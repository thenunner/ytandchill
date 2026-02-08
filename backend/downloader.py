import threading
import time
import os
import random
import glob
from datetime import datetime, timezone
import logging
import psutil
import yt_dlp
from yt_dlp.utils import GeoRestrictedError
from database import Video, QueueItem, Setting, get_session
from utils import download_thumbnail, makedirs_777
from events import queue_events

logger = logging.getLogger(__name__)


def _get_cookie_options(settings_manager, verbose=False):
    """
    Build yt-dlp cookie options based on settings.

    Args:
        settings_manager: Settings manager instance
        verbose: If True, log information about cookie source

    Returns:
        dict: Cookie-related yt-dlp options (cookiefile or cookiesfrombrowser)
    """
    data_dir = os.environ.get('DATA_DIR', 'data')
    cookies_path = os.path.join(data_dir, 'cookies.txt')
    cookie_source = settings_manager.get('cookie_source', 'file')

    opts = {}

    if cookie_source == 'none':
        if verbose:
            logger.info('Downloads using anonymous access (no cookies)')

    elif cookie_source == 'browser':
        browser_type = settings_manager.get('cookie_browser', 'firefox')
        if os.path.exists('/.dockerenv'):
            opts['cookiesfrombrowser'] = (browser_type, '/firefox_profile', None, None)
            if verbose:
                logger.info(f'Using cookies from {browser_type} browser at /firefox_profile')
        else:
            opts['cookiesfrombrowser'] = (browser_type, None, None, None)
            if verbose:
                logger.info(f'Using cookies from {browser_type} browser (auto-detect profile)')

    elif cookie_source == 'file':
        if os.path.exists(cookies_path):
            opts['cookiefile'] = cookies_path
            if verbose:
                logger.info('Using cookies.txt file for authentication')
        elif verbose:
            logger.warning('No cookies.txt file found - downloads may be rate-limited')

    else:
        if verbose:
            logger.warning(f'Unknown cookie_source: {cookie_source}, using anonymous access')

    return opts


def _get_cookies_path():
    """Get the path to the cookies.txt file."""
    data_dir = os.environ.get('DATA_DIR', 'data')
    return os.path.join(data_dir, 'cookies.txt')


class YtDlpLogger:
    """Custom logger for yt-dlp that routes output to our logging system."""

    # Postprocessor indicators in log messages
    POSTPROCESS_INDICATORS = [
        '[Merger]', '[ModifyChapters]', '[SponsorBlock]', '[FFmpegMetadata]',
        '[FFmpegVideoRemuxer]', '[FFmpegExtractAudio]', '[FFmpegEmbedSubtitle]',
        '[MoveFiles]', 'Deleting original file', 'Merging formats', 'Re-encoding',
        'Removing chapters', 'Adding metadata'
    ]

    def __init__(self, activity_callback=None):
        """
        Args:
            activity_callback: Optional callback(is_postprocessing) called on log activity
        """
        self.activity_callback = activity_callback

    def _check_activity(self, msg):
        """Notify callback of activity, detecting if it's postprocessing."""
        if self.activity_callback:
            is_postprocessing = any(indicator in msg for indicator in self.POSTPROCESS_INDICATORS)
            self.activity_callback(is_postprocessing)

    def debug(self, msg):
        # yt-dlp sends most info as debug, log at INFO for visibility
        if msg.startswith('[debug]'):
            logger.debug(f'[yt-dlp] {msg}')
        else:
            logger.info(f'[yt-dlp] {msg}')
            self._check_activity(msg)

    def info(self, msg):
        logger.info(f'[yt-dlp] {msg}')
        self._check_activity(msg)

    def warning(self, msg):
        logger.warning(f'[yt-dlp] {msg}')
        self._check_activity(msg)

    def error(self, msg):
        logger.error(f'[yt-dlp] {msg}')


class DownloadWorker:
    # Timeout constants
    DOWNLOAD_PROGRESS_TIMEOUT = 120  # 2 minutes of no progress hooks → start file size checking
    DOWNLOAD_FILESIZE_TIMEOUT = 180  # 3 minutes of no file size change during download → timeout
    POSTPROCESS_FILESIZE_TIMEOUT = 300  # 5 minutes of no file size change during postprocessing → timeout
    HARD_TIMEOUT = 14400             # 4 hours maximum download time
    FILESIZE_CHECK_INTERVAL = 30     # Check file size every 30 seconds

    # Inter-download delay range (seconds) - prevents rate limiting
    DELAY_MIN = 45           # Minimum delay between downloads
    DELAY_MAX = 120          # Maximum delay between downloads (2 minutes)

    def __init__(self, session_factory, download_dir='downloads', settings_manager=None):
        self.session_factory = session_factory
        self.download_dir = download_dir
        self.settings_manager = settings_manager
        self.running = False
        self.thread = None
        self.current_download = None
        self._download_lock = threading.Lock()  # Protects access to current_download
        self.paused = True  # Start paused by default to prevent auto-start on backend restart
        self.delay_info = None  # For tracking delay status
        self.rate_limit_message = None  # Persistent rate limit message for UI
        self.last_download_time = None  # Track when last download finished for rate limiting
        self.next_download_delay = 0  # Delay in seconds before next download can start
        self.last_error_message = None  # Last download error for UI display
        self.cookie_warning_message = None  # Persistent cookie warning (cleared on user interaction)

        # Format choice state - for videos without H.264 format available
        self.format_choice_pending = None  # {video_id, yt_id, title, queue_item_id} or None
        self._format_choice_event = threading.Event()  # Signal when user responds
        self._format_choice_result = None  # 'reencode' or 'skip'

        # Ensure download directory exists with proper permissions
        makedirs_777(download_dir)

        # SSE event throttling
        self._last_sse_emit = 0
        self._sse_throttle_interval = 0.5  # Emit at most twice per second for smoother progress

    def _emit_queue_update(self, force=False):
        """Emit SSE signal to notify clients queue state changed."""
        if not force:
            # Throttle to avoid overwhelming clients
            now = time.time()
            if now - self._last_sse_emit < self._sse_throttle_interval:
                return
            self._last_sse_emit = now

        # Just emit a signal - SSE endpoint will build the state
        # This avoids circular imports (downloader -> routes.queue -> downloader)
        queue_events.emit('queue:changed')
    
    def start(self):
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._worker_loop, daemon=True)
            self.thread.start()
            logger.info("Download worker started")
    
    def stop(self):
        logger.info("Stopping download worker")
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)

    def pause(self):
        logger.info("Download worker paused")
        self.paused = True
        self._emit_queue_update(force=True)

    def _reset_stuck_videos(self, session, target_status, exclude_video_id=None, reset_queue_progress=False):
        """
        Reset stuck 'downloading' videos to a target status.

        Args:
            session: Database session to use
            target_status: Status to set stuck videos to ('queued' or 'discovered')
            exclude_video_id: Optional video ID to exclude from reset
            reset_queue_progress: Whether to reset queue item progress to 0
        """
        query = session.query(Video).filter(Video.status == 'downloading')
        if exclude_video_id:
            query = query.filter(Video.id != exclude_video_id)

        stuck_videos = query.all()

        for video in stuck_videos:
            logger.debug(f"Resetting stuck video {video.yt_id} from 'downloading' to '{target_status}'")
            video.status = target_status

            queue_item = session.query(QueueItem).filter(
                QueueItem.video_id == video.id
            ).first()

            if queue_item:
                if reset_queue_progress:
                    queue_item.progress_pct = 0
                    queue_item.speed_bps = 0
                    queue_item.eta_seconds = 0
                elif target_status == 'discovered':
                    # When resetting to discovered, delete the queue item
                    session.delete(queue_item)

        if stuck_videos:
            logger.info(f"Reset {len(stuck_videos)} stuck 'downloading' videos to '{target_status}'")
        else:
            logger.debug(f"No stuck videos found when resetting to '{target_status}'")

    def resume(self):
        logger.info("Download worker resuming")
        self.paused = False

        # Reset any stuck 'downloading' videos back to 'queued' when resuming
        with get_session(self.session_factory) as session:
            self._reset_stuck_videos(session, target_status='queued', reset_queue_progress=True)
            # DON'T clear queue_item.log - keep rate limit warnings visible
            # They will be cleared automatically when a download actually succeeds

        self._emit_queue_update(force=True)

    def handle_format_choice(self, choice):
        """
        Handle user's format choice for a video without H.264 format.

        Args:
            choice: 'reencode' to download and re-encode, 'skip' to mark as ignored
        """
        logger.info(f"Format choice received: {choice}")
        self._format_choice_result = choice
        self._format_choice_event.set()

    def _check_format_compatibility(self, video_url):
        """
        Check if H.264 format is available for the video.

        Returns:
            tuple: (has_h264, info_dict) - whether H.264 is available and the video info
        """
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                **_get_cookie_options(self.settings_manager),
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
                formats = info.get('formats', [])

                # Check for H.264/avc1 formats with video
                h264_formats = [
                    f for f in formats
                    if f.get('vcodec', '').startswith('avc1') and f.get('vcodec') != 'none'
                ]

                has_h264 = len(h264_formats) > 0
                logger.info(f"Format check for {info.get('id', 'unknown')}: H.264 available = {has_h264}, total formats = {len(formats)}, H.264 formats = {len(h264_formats)}")

                return has_h264, info

        except Exception as e:
            logger.error(f"Error checking format compatibility: {e}")
            # On error, assume H.264 is available to avoid blocking
            return True, None

    def _download_and_reencode(self, session, video, queue_item, channel_dir, progress_hook):
        """
        Download best available format and re-encode to H.264.

        Returns:
            tuple: (success, ext) - whether download succeeded and file extension
        """
        import subprocess

        video_url = f'https://www.youtube.com/watch?v={video.yt_id}'
        temp_output = os.path.join(channel_dir, f'{video.yt_id}_temp.%(ext)s')
        final_output = os.path.join(channel_dir, f'{video.yt_id}.mp4')

        # Configure yt-dlp for best quality (no codec restriction)
        ydl_opts = {
            'format': 'bestvideo+bestaudio/best',
            'outtmpl': temp_output,
            'quiet': False,
            'verbose': True,
            'no_warnings': False,
            'logger': YtDlpLogger(activity_callback=self._on_ytdlp_activity),
            'progress_hooks': [progress_hook],
            'nocheckcertificate': True,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'socket_timeout': 30,
            'retries': 3,
            'continue': True,
            'noprogress': True,
            'concurrent_fragment_downloads': 4,
            'merge_output_format': 'mkv',  # Use MKV for intermediate (handles more codecs)
            'postprocessor_hooks': [self._postprocessor_hook],
            **_get_cookie_options(self.settings_manager),
        }

        try:
            # Step 1: Download with best available format
            logger.info(f"Re-encode: Downloading best available format for {video.yt_id}")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=True)
                downloaded_ext = info.get('ext', 'mkv')

            # Find the downloaded file
            downloaded_file = os.path.join(channel_dir, f'{video.yt_id}_temp.{downloaded_ext}')
            if not os.path.exists(downloaded_file):
                # Try common extensions
                for ext in ['mkv', 'webm', 'mp4']:
                    test_path = os.path.join(channel_dir, f'{video.yt_id}_temp.{ext}')
                    if os.path.exists(test_path):
                        downloaded_file = test_path
                        break

            if not os.path.exists(downloaded_file):
                logger.error(f"Re-encode: Downloaded file not found for {video.yt_id}")
                return False, None

            logger.info(f"Re-encode: Downloaded file: {downloaded_file}")

            # Step 2: Re-encode to H.264/AAC MP4
            logger.info(f"Re-encode: Starting ffmpeg re-encode for {video.yt_id}")

            # Update phase to show re-encoding in UI
            with self._download_lock:
                if self.current_download:
                    self.current_download['phase'] = 'postprocessing'
                    self.current_download['postprocessor'] = 'Re-encoding to H.264'
                    self.current_download['postprocess_start_time'] = time.time()

            self._emit_queue_update(force=True)

            ffmpeg_cmd = [
                'ffmpeg', '-i', downloaded_file,
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', '23',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-movflags', '+faststart',
                '-y',  # Overwrite output
                final_output
            ]

            logger.info(f"Re-encode: Running ffmpeg command: {' '.join(ffmpeg_cmd)}")

            process = subprocess.Popen(
                ffmpeg_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )

            # Wait for ffmpeg to complete, checking for cancellation
            while process.poll() is None:
                with self._download_lock:
                    if self.current_download and self.current_download.get('cancelled'):
                        logger.info("Re-encode: Cancellation requested, killing ffmpeg")
                        process.kill()
                        # Clean up temp file
                        if os.path.exists(downloaded_file):
                            os.remove(downloaded_file)
                        if os.path.exists(final_output):
                            os.remove(final_output)
                        raise Exception('Download cancelled by user')

                    # Update activity timestamp
                    if self.current_download:
                        self.current_download['last_progress_time'] = time.time()
                        self.current_download['last_file_size_change'] = time.time()

                time.sleep(1)

            stdout, stderr = process.communicate()

            if process.returncode != 0:
                logger.error(f"Re-encode: ffmpeg failed with code {process.returncode}: {stderr.decode()}")
                # Clean up temp file
                if os.path.exists(downloaded_file):
                    os.remove(downloaded_file)
                return False, None

            # Step 3: Clean up temp file
            if os.path.exists(downloaded_file):
                os.remove(downloaded_file)
                logger.info(f"Re-encode: Removed temp file {downloaded_file}")

            logger.info(f"Re-encode: Successfully re-encoded {video.yt_id} to H.264")
            return True, 'mp4'

        except Exception as e:
            error_str = str(e)
            logger.error(f"Re-encode: Error during download/re-encode for {video.yt_id}: {error_str}")

            # Clean up any temp files
            for ext in ['mkv', 'webm', 'mp4']:
                temp_path = os.path.join(channel_dir, f'{video.yt_id}_temp.{ext}')
                if os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except:
                        pass

            if 'cancelled' in error_str.lower():
                raise

            return False, None
    
    def cancel_current(self):
        with self._download_lock:
            if self.current_download:
                logger.info(f"Cancelling current download: {self.current_download}")
                self.current_download['cancelled'] = True
                # If in postprocessing phase, kill FFmpeg immediately
                if self.current_download.get('phase') == 'postprocessing':
                    self._kill_ffmpeg_processes()

    def _on_ytdlp_activity(self, is_postprocessing):
        """
        Called by YtDlpLogger when yt-dlp outputs a message.
        Updates last_progress_time to prevent timeout during active processing.
        """
        with self._download_lock:
            if self.current_download:
                self.current_download['last_progress_time'] = time.time()
                if is_postprocessing:
                    self.current_download['phase'] = 'postprocessing'

    def _kill_ffmpeg_processes(self):
        """Kill any FFmpeg child processes (used when cancelling during postprocessing)."""
        try:
            current_process = psutil.Process()
            for child in current_process.children(recursive=True):
                if 'ffmpeg' in child.name().lower():
                    logger.info(f"Killing FFmpeg process {child.pid}")
                    child.kill()
        except Exception as e:
            logger.warning(f"Error killing FFmpeg processes: {e}")

    # Known postprocessors (must match frontend Toast.jsx mapping)
    KNOWN_POSTPROCESSORS = {
        'SponsorBlock', 'ModifyChapters', 'FFmpegMerger', 'FFmpegMetadata',
        'FFmpegExtractAudio', 'FFmpegEmbedSubtitle', 'FFmpegVideoConvertor',
        'FFmpegFixupM3u8', 'FFmpegFixupM4a', 'FFmpegFixupDuplicateMoov',
        'FFmpegFixupStretchedPP', 'FFmpegFixupTimestamp', 'MoveFiles'
    }

    # Map postprocessor names to user-friendly display names
    POSTPROCESSOR_DISPLAY_NAMES = {
        'ModifyChapters': 'SponsorBlock Encoding',  # The slow re-encoding step
        'SponsorBlock': 'SponsorBlock',             # Quick API fetch
        'Merger': 'Merging',
        'FFmpegMerger': 'Merging',
        'FFmpegMetadata': 'Metadata',
        'FFmpegVideoRemuxer': 'Processing',
        'MoveFiles': 'Finalizing',
    }

    def _postprocessor_hook(self, d):
        """
        Track postprocessor progress to prevent timeout during re-encoding.
        Also checks for cancel flag since progress_hook isn't called during postprocessing.
        """
        with self._download_lock:
            if self.current_download:
                # Check for cancel during postprocessing
                if self.current_download.get('cancelled'):
                    self._kill_ffmpeg_processes()
                    raise Exception('Download cancelled by user')

                # IMPORTANT: Update progress tracking BEFORE checking timeout
                # This ensures phase is set correctly for the watchdog
                self.current_download['last_progress_time'] = time.time()
                self.current_download['last_file_size_change'] = time.time()  # Also reset file size timer
                self.current_download['phase'] = 'postprocessing'

                postprocessor_name = d.get('postprocessor', 'unknown')
                # Use friendly display name if available
                display_name = self.POSTPROCESSOR_DISPLAY_NAMES.get(postprocessor_name, postprocessor_name)
                self.current_download['postprocessor'] = display_name

                # Now check for timeout (after phase is set)
                # Don't raise during postprocessing - let it complete since file may be usable
                if self.current_download.get('timed_out'):
                    logger.warning(f'Timeout flag set during {display_name}, but allowing postprocessing to continue')
                    # Clear timeout flag since we're making progress
                    self.current_download['timed_out'] = False

                # Log warning for unmapped postprocessors
                if postprocessor_name not in self.KNOWN_POSTPROCESSORS:
                    logger.warning(f"Unknown postprocessor (add to frontend mapping): {postprocessor_name}")

                # Track when postprocessing started for elapsed time display
                if 'postprocess_start_time' not in self.current_download:
                    self.current_download['postprocess_start_time'] = time.time()
                    logger.info(f"Postprocessing started: {display_name}")

    def _set_discoveries_flag(self, session):
        """Set the new discoveries flag using the existing session to avoid database locks."""
        setting = session.query(Setting).filter(Setting.key == 'new_discoveries_flag').first()
        if setting:
            setting.value = 'true'
        else:
            setting = Setting(key='new_discoveries_flag', value='true')
            session.add(setting)
        # Don't commit here - let the caller handle the transaction

    def _fetch_sponsorblock_segments(self, video_yt_id, categories):
        """
        Fetch SponsorBlock segments from API for playback-time skipping.

        Args:
            video_yt_id: YouTube video ID
            categories: List of categories to fetch (e.g., ['sponsor', 'selfpromo'])

        Returns:
            List of segment dicts with start, end, category keys, or empty list
        """
        import requests
        import json

        if not categories:
            return []

        try:
            # SponsorBlock API endpoint
            url = f"https://sponsor.ajay.app/api/skipSegments?videoID={video_yt_id}&categories={json.dumps(categories)}"
            response = requests.get(url, timeout=10)

            if response.status_code == 200:
                segments = response.json()
                # Convert to simplified format
                result = [
                    {
                        "start": seg["segment"][0],
                        "end": seg["segment"][1],
                        "category": seg["category"]
                    }
                    for seg in segments
                ]
                logger.info(f'Fetched {len(result)} SponsorBlock segments for {video_yt_id}')
                return result
            elif response.status_code == 404:
                # No segments for this video (common case)
                logger.debug(f'No SponsorBlock segments found for {video_yt_id}')
                return []
            else:
                logger.warning(f'SponsorBlock API returned {response.status_code} for {video_yt_id}')
                return []
        except Exception as e:
            logger.warning(f'Failed to fetch SponsorBlock segments for {video_yt_id}: {e}')
            return []

    def _cut_sponsorblock_segments(self, video_file_path, segments):
        """
        Cut SponsorBlock segments from video using ffmpeg stream copy (no re-encoding).

        Extracts non-sponsor portions and concatenates them back together.
        Falls back to keeping the original file if anything fails.

        Args:
            video_file_path: Absolute path to the video file
            segments: List of dicts with 'start' and 'end' keys (seconds)

        Returns:
            New file size in bytes, or None if cutting failed
        """
        import subprocess

        if not segments or not os.path.exists(video_file_path):
            return None

        # Sort segments by start time and compute "keep" ranges
        sorted_segments = sorted(segments, key=lambda s: s['start'])
        keep_ranges = []
        current = 0.0

        for seg in sorted_segments:
            if seg['start'] > current:
                keep_ranges.append((current, seg['start']))
            current = max(current, seg['end'])

        # Add final segment (from last sponsor end to video end)
        keep_ranges.append((current, None))

        # Filter out tiny ranges (< 0.5s) that would produce empty files
        keep_ranges = [(s, e) for s, e in keep_ranges if e is None or e - s >= 0.5]

        if not keep_ranges:
            logger.warning('SponsorBlock cut: No content would remain after cutting, skipping')
            return None

        file_dir = os.path.dirname(video_file_path)
        file_base = os.path.splitext(os.path.basename(video_file_path))[0]
        file_ext = os.path.splitext(video_file_path)[1]
        part_files = []

        try:
            # Step 1: Extract each "keep" segment with stream copy
            for i, (start, end) in enumerate(keep_ranges):
                part_path = os.path.join(file_dir, f'{file_base}_cutpart_{i}{file_ext}')
                part_files.append(part_path)

                cmd = ['ffmpeg', '-y', '-ss', str(start)]
                if end is not None:
                    cmd.extend(['-to', str(end)])
                cmd.extend([
                    '-i', video_file_path,
                    '-c', 'copy',
                    '-avoid_negative_ts', 'make_zero',
                    part_path
                ])

                logger.debug(f'SponsorBlock cut: Extracting part {i+1}/{len(keep_ranges)} ({start:.1f}s - {end if end else "end"})')
                result = subprocess.run(cmd, capture_output=True, timeout=120)
                if result.returncode != 0:
                    logger.error(f'SponsorBlock cut: ffmpeg extract failed for part {i}: {result.stderr.decode()[-500:]}')
                    raise Exception(f'ffmpeg extract failed for part {i}')

            # Step 2: Create concat demuxer list
            concat_list_path = os.path.join(file_dir, f'{file_base}_cutlist.txt')
            with open(concat_list_path, 'w') as f:
                for part_path in part_files:
                    f.write(f"file '{os.path.basename(part_path)}'\n")

            # Step 3: Concatenate all parts with stream copy
            output_path = os.path.join(file_dir, f'{file_base}_cut{file_ext}')
            concat_cmd = [
                'ffmpeg', '-y',
                '-f', 'concat', '-safe', '0',
                '-i', concat_list_path,
                '-c', 'copy',
                '-movflags', '+faststart',
                output_path
            ]

            logger.debug(f'SponsorBlock cut: Concatenating {len(part_files)} parts')
            result = subprocess.run(concat_cmd, capture_output=True, timeout=120)
            if result.returncode != 0:
                logger.error(f'SponsorBlock cut: ffmpeg concat failed: {result.stderr.decode()[-500:]}')
                raise Exception('ffmpeg concat failed')

            # Step 4: Replace original with cut version
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                os.replace(output_path, video_file_path)
                new_size = os.path.getsize(video_file_path)
                total_cut = sum(seg['end'] - seg['start'] for seg in sorted_segments)
                logger.info(f'SponsorBlock cut: Removed ~{total_cut:.0f}s of segments from video ({len(segments)} segments)')
                return new_size
            else:
                logger.error('SponsorBlock cut: Output file is empty or missing')
                raise Exception('Output file empty')

        except Exception as e:
            logger.warning(f'SponsorBlock cut failed, keeping original file: {e}')
            return None

        finally:
            # Clean up temp files
            for part_path in part_files:
                if os.path.exists(part_path):
                    os.remove(part_path)
            concat_list_path = os.path.join(file_dir, f'{file_base}_cutlist.txt')
            if os.path.exists(concat_list_path):
                os.remove(concat_list_path)
            output_path = os.path.join(file_dir, f'{file_base}_cut{file_ext}')
            if os.path.exists(output_path):
                os.remove(output_path)

    def _cleanup_failed_video(self, session, video, queue_item, channel_dir, reason):
        """
        Cleanup files and set video to removed status (permanent error).

        Args:
            session: Database session
            video: Video object
            queue_item: QueueItem object
            channel_dir: Channel directory path
            reason: Human-readable reason for removal
        """
        logger.warning(f'{reason}: {video.title} ({video.yt_id})')
        logger.warning(f'Moving video to removed status')

        # Delete partial files
        video_pattern = os.path.join(channel_dir, f'{video.yt_id}.*')
        for file_path in glob.glob(video_pattern):
            try:
                os.remove(file_path)
                logger.debug(f'Deleted file: {file_path}')
            except Exception as del_error:
                logger.warning(f'Failed to delete file {file_path}: {del_error}')

        # Delete thumbnail
        thumb_path = os.path.join(channel_dir, f'{video.yt_id}.jpg')
        if os.path.exists(thumb_path):
            try:
                os.remove(thumb_path)
                logger.debug(f'Deleted thumbnail: {thumb_path}')
            except Exception as thumb_error:
                logger.warning(f'Failed to delete thumbnail: {thumb_error}')

        # Update database
        video.status = 'removed'
        if queue_item:
            session.delete(queue_item)
        session.commit()
        self.current_download = None
        logger.info(f'Successfully moved video to removed: {video.yt_id}')
        # Broadcast state change for error toast
        self._emit_queue_update(force=True)

    def _handle_rate_limit(self, session, video, queue_item, cookies_path=None, error_code=None):
        """
        Handle rate limiting errors - return video to discovered status and pause queue.

        Args:
            session: Database session
            video: Video object
            queue_item: QueueItem object
            cookies_path: Path to cookies.txt (optional, for 403 errors)
            error_code: Error code string (e.g., '403') for specific messages
        """
        logger.warning(f'WARNING: RATE LIMIT DETECTED ({error_code or "general"}) - Auto-pausing queue')
        self.paused = True

        # Return video to discovered status so it can be re-queued later
        video.status = 'discovered'
        session.delete(queue_item)
        session.commit()
        self.current_download = None

        # Set appropriate message based on error type
        if error_code == '403':
            if cookies_path and os.path.exists(cookies_path):
                msg = 'YouTube rate limit detected (403 Forbidden). Try updating your cookies.txt file and wait 30-60 minutes.'
            else:
                msg = 'YouTube rate limit detected (403 Forbidden). Add a cookies.txt file and wait 30-60 minutes.'
        else:
            msg = 'YouTube rate limit detected. Queue paused. Please wait 30-60 minutes before resuming downloads.'

        self.rate_limit_message = msg
        logger.info(f'Video {video.yt_id} returned to discovered status, can be re-queued later')

        # Reset any other stuck 'downloading' videos back to 'discovered'
        with get_session(self.session_factory) as temp_session:
            self._reset_stuck_videos(temp_session, target_status='discovered', exclude_video_id=video.id)

        # Broadcast state change for rate limit toast
        self._emit_queue_update(force=True)

    def _worker_loop(self):
        logger.debug("Worker loop started")
        while self.running:
            if self.paused:
                time.sleep(1)
                continue

            # Check if we need to wait for inter-download delay
            if self._wait_for_delay():
                time.sleep(1)  # Check delay status every second
                continue

            try:
                with get_session(self.session_factory) as session:
                    # Get next queued video (join with QueueItem for ordering)
                    queue_item = session.query(QueueItem).join(Video).filter(
                        Video.status == 'queued'
                    ).order_by(QueueItem.queue_position).first()

                    if queue_item:
                        logger.info(f"Found queued video: {queue_item.video.yt_id} - {queue_item.video.title}")
                        self._download_video(session, queue_item)
                    else:
                        # Queue is empty - clear delay info and rate limit message
                        had_status = self.delay_info or self.rate_limit_message
                        if self.delay_info:
                            self.delay_info = None
                        if self.rate_limit_message:
                            logger.info("Queue empty - clearing rate limit message")
                            self.rate_limit_message = None
                        # Emit SSE update if we cleared any status
                        if had_status:
                            self._emit_queue_update(force=True)
                        logger.debug("No queued videos found, sleeping...")
                        time.sleep(2)  # Wait before checking again
            except Exception as e:
                logger.error(f"Worker error: {e}", exc_info=True)

            time.sleep(0.5)

    def _get_download_file_size(self, channel_dir, video_yt_id):
        """Get the current size of download files (including partial files)."""
        total_size = 0
        patterns = [
            f'{video_yt_id}.mp4',
            f'{video_yt_id}.mp4.part',
            f'{video_yt_id}.f*.mp4',      # Format-specific files during download
            f'{video_yt_id}.f*.m4a',
            f'{video_yt_id}.f*.part',
        ]
        for pattern in patterns:
            for filepath in glob.glob(os.path.join(channel_dir, pattern)):
                try:
                    total_size += os.path.getsize(filepath)
                except OSError:
                    pass
        return total_size

    def _watchdog_timer(self, video_id, video_title):
        """
        Monitors download progress and sets timeout flag if download stalls.
        Runs in a separate thread parallel to the download.

        Download phase: Uses progress hooks, falls back to file size monitoring.
        Postprocessing phase: Uses file size monitoring only.
        """
        while True:
            with self._download_lock:
                download = self.current_download
                if not download or download.get('cancelled'):
                    break

                current_time = time.time()
                elapsed_total = current_time - download.get('start_time', current_time)
                time_since_progress = current_time - download.get('last_progress_time', current_time)

                channel_dir = download.get('channel_dir')
                video_yt_id = download.get('video_yt_id')
                is_postprocessing = download.get('phase') == 'postprocessing'

                # Hard timeout: Maximum download duration exceeded
                if elapsed_total > self.HARD_TIMEOUT:
                    logger.warning(f'TIMEOUT: Download exceeded {self.HARD_TIMEOUT/3600:.1f} hour limit - {video_title[:50]}')
                    download['timed_out'] = True
                    break

                # Check file size for activity detection
                if channel_dir and video_yt_id:
                    current_file_size = self._get_download_file_size(channel_dir, video_yt_id)
                    last_file_size = download.get('last_file_size', 0)

                    if current_file_size != last_file_size:
                        # File size changed - activity detected
                        download['last_file_size'] = current_file_size
                        download['last_file_size_change'] = current_time
                        # Also reset progress time since we have activity
                        download['last_progress_time'] = current_time

                    time_since_file_change = current_time - download.get('last_file_size_change', current_time)
                else:
                    time_since_file_change = 0  # Can't check, don't timeout on file size

                if is_postprocessing:
                    # Postprocessing: Use file size monitoring with 5 min timeout
                    if time_since_file_change > self.POSTPROCESS_FILESIZE_TIMEOUT:
                        logger.warning(f'TIMEOUT: No file activity for {self.POSTPROCESS_FILESIZE_TIMEOUT:.0f}s during postprocessing - {video_title[:50]}')
                        download['timed_out'] = True
                        break
                else:
                    # Download phase: Primary is progress hooks, fallback is file size
                    if time_since_progress > self.DOWNLOAD_PROGRESS_TIMEOUT:
                        # No progress hooks for 2 min - check file size as fallback
                        if time_since_file_change > self.DOWNLOAD_FILESIZE_TIMEOUT:
                            logger.warning(f'TIMEOUT: No progress or file activity for {self.DOWNLOAD_FILESIZE_TIMEOUT:.0f}s - {video_title[:50]}')
                            download['timed_out'] = True
                            break
                        elif time_since_progress > self.DOWNLOAD_PROGRESS_TIMEOUT + 10:  # Log once after threshold
                            logger.debug(f'No progress hooks for {time_since_progress:.0f}s, but file size changing - continuing')

            # Check every 30 seconds (file size check interval)
            time.sleep(self.FILESIZE_CHECK_INTERVAL)

        logger.debug(f'Watchdog timer exiting for {video_id}')

    def _validate_and_prepare_video(self, session, queue_item):
        """
        Validate video and channel exist, prepare for download.

        Returns:
            tuple: (video, channel, download_dir) or (None, None, None) if validation fails
            Note: channel may be None for playlist videos - download_dir will be set from folder_name
        """
        video = session.query(Video).filter(Video.id == queue_item.video_id).first()
        if not video:
            logger.warning(f"Video not found for queue item {queue_item.id}, deleting queue item")
            session.delete(queue_item)
            session.commit()
            return None, None, None

        logger.info(f"Starting download for video: {video.yt_id} - {video.title}")

        channel = video.channel

        # Determine download directory based on whether video has a channel or folder_name
        if channel:
            # Channel video - use channel folder
            logger.debug(f"Channel: {channel.title}, Folder: {channel.folder_name}")
            video_dir = os.path.join(self.download_dir, channel.folder_name)
        elif video.folder_name:
            # Singles video (imported via Videos tab) - use Singles/{folder_name}
            logger.debug(f"Singles video, Folder: Singles/{video.folder_name}")
            video_dir = os.path.join(self.download_dir, 'Singles', video.folder_name)
        else:
            # No channel and no folder_name - use Singles/Uncategorized
            logger.warning(f"Video {video.yt_id} has no channel or folder_name, using Singles/Uncategorized")
            video_dir = os.path.join(self.download_dir, 'Singles', 'Uncategorized')

        # Update status to downloading
        video.status = 'downloading'
        session.commit()
        logger.info(f"Video {video.yt_id} status updated to 'downloading'")

        # Emit SSE immediately so UI shows downloading card right away
        self._emit_queue_update(force=True)

        # Prepare download path with proper permissions
        makedirs_777(video_dir)

        return video, channel, video_dir

    def _setup_progress_tracking(self, queue_item, video, channel_dir):
        """
        Setup progress tracking and watchdog timer.

        Returns:
            tuple: (watchdog_thread, progress_hook_function)
        """
        # Setup progress tracking with timeout watchdog
        with self._download_lock:
            self.current_download = {
                'cancelled': False,
                'queue_item_id': queue_item.id,
                'last_progress_time': time.time(),
                'start_time': time.time(),
                'timed_out': False,
                'phase': 'downloading',  # Track phase: downloading or postprocessing
                'channel_dir': channel_dir,
                'video_yt_id': video.yt_id,
                'last_file_size': 0,
                'last_file_size_change': time.time(),
            }

        # Start watchdog timer thread
        watchdog_thread = threading.Thread(
            target=self._watchdog_timer,
            args=(video.yt_id, video.title),
            daemon=True
        )
        watchdog_thread.start()
        logger.debug(f'Started watchdog timer for {video.yt_id}')

        # Track last logged progress to avoid log spam
        last_logged_progress = [0]  # Use list for mutable closure variable

        def progress_hook(d):
            with self._download_lock:
                download = self.current_download
                if download and download.get('cancelled'):
                    raise Exception('Download cancelled by user')

                if download and download.get('timed_out'):
                    raise Exception('Download timed out - no progress for too long')

            # Check if queue was paused during download
            if self.paused:
                raise Exception('Download paused by user')

            if d['status'] == 'downloading':
                # Update last activity time
                with self._download_lock:
                    if self.current_download:
                        self.current_download['last_progress_time'] = time.time()
                try:
                    # Update progress in database
                    with get_session(self.session_factory) as temp_session:
                        temp_queue_item = temp_session.query(QueueItem).filter(
                            QueueItem.id == queue_item.id
                        ).first()

                        if temp_queue_item:
                            downloaded = d.get('downloaded_bytes', 0)
                            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                            if total > 0:
                                progress_pct = (downloaded / total) * 100
                                temp_queue_item.progress_pct = progress_pct

                                # Log progress every 5% at INFO level
                                progress_milestone = int(progress_pct // 5) * 5
                                if progress_milestone > last_logged_progress[0] and progress_milestone % 5 == 0:
                                    speed_mbps = (d.get('speed', 0) or 0) / (1024 * 1024)
                                    eta_min = (d.get('eta', 0) or 0) / 60
                                    # Only log if we have actual download progress (not just initial metadata)
                                    # Require: actual bytes downloaded AND meaningful speed (at least 10 KB/s)
                                    if downloaded > 0 and d.get('speed') and d.get('speed') > 10240:
                                        logger.info(f'Download progress: {video.title[:50]} - {progress_milestone}% ({speed_mbps:.2f} MB/s, ETA: {eta_min:.1f}min)')
                                        last_logged_progress[0] = progress_milestone

                            temp_queue_item.speed_bps = d.get('speed', 0) or 0
                            temp_queue_item.eta_seconds = d.get('eta', 0) or 0
                            temp_queue_item.total_bytes = total  # Store file size

                    # Emit SSE event for progress update (throttled)
                    self._emit_queue_update()
                except Exception as progress_error:
                    logger.error(f'Failed to update download progress for {video.yt_id}: {progress_error}')

        return watchdog_thread, progress_hook

    def _download_thumbnail(self, video, channel_dir):
        """Download video thumbnail from YouTube."""
        thumb_path = os.path.join(channel_dir, f'{video.yt_id}.jpg')
        if download_thumbnail(video.thumb_url, thumb_path):
            logger.debug(f'Downloaded thumbnail for {video.yt_id}')
        else:
            logger.warning(f'Failed to download thumbnail for {video.yt_id}')

    def _configure_download_options(self, channel_dir, video_yt_id, progress_hook, video_duration_sec=None):
        """
        Build yt-dlp options dictionary with all settings.

        Args:
            channel_dir: Directory to save the video
            video_yt_id: YouTube video ID
            progress_hook: Progress callback function
            video_duration_sec: Video duration in seconds (for SponsorBlock skip check)

        Returns:
            tuple: (ydl_opts dict, cookies_path)
        """
        # yt-dlp options - Works with HLS/m3u8 streams
        ydl_opts = {
            # Force H.264 (avc1) codec for universal mobile/desktop compatibility
            # Fallbacks all require H.264 - may get 720p instead of 1080p if H.264 1080p unavailable
            'format': 'bestvideo[vcodec~="^avc1"][height<=1080]+bestaudio[ext=m4a]/bestvideo[vcodec~="^avc1"]+bestaudio[ext=m4a]/bestvideo[vcodec~="^avc1"]+bestaudio/best[vcodec~="^avc1"]',
            'outtmpl': os.path.join(channel_dir, f'{video_yt_id}.%(ext)s'),
            'quiet': False,  # Enable output for logging
            'verbose': True,  # Verbose output for debugging
            'no_warnings': False,  # Show warnings
            'logger': YtDlpLogger(activity_callback=self._on_ytdlp_activity),  # Custom logger with activity tracking
            'progress_hooks': [progress_hook],
            'nocheckcertificate': True,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'socket_timeout': 30,
            'retries': 3,
            'continue': True,
            'noprogress': True,  # Disable progress bar (we use progress_hooks instead)

            # aria2c disabled - too aggressive for YouTube (triggers rate limiting)
            # Using yt-dlp's native downloader with conservative settings to avoid bot detection

            # Conservative concurrent downloads to avoid triggering YouTube rate limits
            'concurrent_fragment_downloads': 4,  # Optimal for YouTube (3-4 is safe range)

            'merge_output_format': 'mp4',  # Force MP4 output to ensure faststart is applied
            'postprocessor_args': {
                'ffmpeg': ['-movflags', '+faststart']  # Move MOOV atom to beginning for iPhone compatibility
            },
            'postprocessors': [{
                'key': 'FFmpegVideoRemuxer',
                'preferedformat': 'mp4',  # Note: yt-dlp uses British spelling 'prefered'
            }, {
                'key': 'FFmpegMetadata',
                'add_metadata': True,
            }],
        }

        # Add SponsorBlock chapter markers if categories are enabled
        # This embeds segment markers as chapters in the video metadata (no re-encoding)
        # Works alongside our playback-time auto-skip for external player compatibility
        sponsorblock_categories = self.settings_manager.get_sponsorblock_categories()
        if sponsorblock_categories:
            ydl_opts['sponsorblock_mark'] = sponsorblock_categories

        # Add cookies based on settings (with verbose logging for downloads)
        ydl_opts.update(_get_cookie_options(self.settings_manager, verbose=True))
        cookies_path = _get_cookies_path()

        # SponsorBlock: We fetch segments from API after download (not during)
        # Segments are stored in the database and skipped during playback
        # This avoids re-encoding which caused A/V desync issues

        # Add subtitles if enabled
        if self.settings_manager.get('download_subtitles', 'false') == 'true':
            ydl_opts['writesubtitles'] = True
            ydl_opts['writeautomaticsub'] = True  # Include auto-generated captions
            ydl_opts['subtitleslangs'] = ['en.*', 'a.en']  # English variants + auto-English
            ydl_opts['subtitlesformat'] = 'srt/vtt/best'
            logger.info('Subtitle download enabled - will fetch English subtitles if available')

        # Add postprocessor hook to track phase and prevent timeout during re-encoding
        ydl_opts['postprocessor_hooks'] = [self._postprocessor_hook]

        return ydl_opts, cookies_path

    def _execute_download(self, session, video, queue_item, channel_dir, ydl_opts, cookies_path):
        """
        Execute download with retries and error handling.

        Returns:
            tuple: (success, cancelled, rate_limited, timed_out, already_handled, ext)
                - success: bool - download succeeded
                - cancelled: bool - user cancelled
                - rate_limited: bool - hit rate limit (already handled)
                - timed_out: bool - download timed out
                - already_handled: bool - status already set, skip _finalize_download
                - ext: str - file extension (or None)
        """
        download_success = False
        cancelled = False
        rate_limited = False
        ext = None
        attempt = 1
        max_attempts = 3  # Try with cookies twice, then without cookies once
        tried_without_cookies = False

        # Retry loop
        while attempt <= max_attempts and not download_success:
            try:
                current_ydl_opts = ydl_opts.copy()

                # Reset timeout flag for each attempt (prevents false failures on retry)
                with self._download_lock:
                    if self.current_download:
                        self.current_download['timed_out'] = False
                        self.current_download['last_progress_time'] = time.time()

                # On 3rd attempt, try without cookies as last resort
                if attempt == 3 and cookies_path and 'cookiefile' in ydl_opts:
                    logger.info(f'Download attempt {attempt}/{max_attempts} for video {video.yt_id} (without cookies)')
                    current_ydl_opts.pop('cookiefile', None)
                    current_ydl_opts.pop('cookiesfrombrowser', None)
                    tried_without_cookies = True
                else:
                    logger.info(f'Download attempt {attempt}/{max_attempts} for video {video.yt_id}')

                with yt_dlp.YoutubeDL(current_ydl_opts) as ydl:
                    info = ydl.extract_info(f'https://www.youtube.com/watch?v={video.yt_id}', download=True)
                    ext = info['ext']

                logger.info(f'Download attempt {attempt} succeeded for {video.yt_id}')
                download_success = True

                # If succeeded without cookies after failing with cookies, warn about stale cookies
                if tried_without_cookies and attempt == 3:
                    logger.warning('Download succeeded without cookies after failing with cookies - cookies may be stale/invalid')
                    self.cookie_warning_message = 'Download succeeded but cookies.txt appears to be stale/invalid. Please update your cookies.txt file.'

            except GeoRestrictedError as geo_error:
                # Video is geo-blocked - mark as removed and skip
                logger.warning(f'Video geo-blocked: {video.title} ({video.yt_id})')
                self.last_error_message = f"{video.title[:50]} - Geo-blocked in your region"
                video.status = 'removed'
                session.delete(queue_item)
                session.commit()
                self.current_download = None
                self._emit_queue_update(force=True)
                return False, False, False, False, True, None  # already_handled=True

            except Exception as download_error:
                error_str = str(download_error)

                if 'cancelled' in error_str.lower():
                    logger.info(f'Download cancelled for {video.yt_id}')
                    cancelled = True
                    break

                if 'paused' in error_str.lower():
                    logger.info(f'Download paused for {video.yt_id} at {queue_item.progress_pct:.1f}%')
                    # Return video to discovered status - .part file remains on disk
                    # yt-dlp will auto-resume from .part when re-queued later
                    video.status = 'discovered'
                    session.delete(queue_item)
                    # Set flag to notify frontend about kicked back videos (trigger auto-sort)
                    self._set_discoveries_flag(session)
                    session.commit()
                    self.current_download = None
                    return False, False, False, False, True, None  # already_handled=True

                # Check for geo-restriction errors - move to removed status
                if 'not available in your country' in error_str.lower() or \
                   'geo' in error_str.lower() and 'restrict' in error_str.lower():
                    self.last_error_message = f"{video.title[:50]} - Geo-blocked in your region"
                    self._cleanup_failed_video(session, video, queue_item, channel_dir, 'Geo-restricted')
                    return False, False, False, False, True, None  # already_handled=True

                # Check for age verification errors - move to removed status
                if 'verify your age' in error_str.lower() or \
                   ('age' in error_str.lower() and 'verif' in error_str.lower()):
                    self.last_error_message = f"{video.title[:50]} - Age verification required"
                    self._cleanup_failed_video(session, video, queue_item, channel_dir, 'Age verification required')
                    return False, False, False, False, True, None  # already_handled=True

                # Check for private videos - move to removed status
                if 'private' in error_str.lower() and 'video' in error_str.lower():
                    self.last_error_message = f"{video.title[:50]} - Private video"
                    self._cleanup_failed_video(session, video, queue_item, channel_dir, 'Private video detected')
                    return False, False, False, False, True, None  # already_handled=True

                # Check for deleted/unavailable videos - move to removed status
                if 'removed' in error_str.lower() or 'unavailable' in error_str.lower() or 'does not exist' in error_str.lower():
                    self.last_error_message = f"{video.title[:50]} - Video unavailable/removed"
                    self._cleanup_failed_video(session, video, queue_item, channel_dir, 'Deleted/unavailable video detected')
                    return False, False, False, False, True, None  # already_handled=True

                # Check for members-only content - move to removed status
                if ('members' in error_str.lower() and 'only' in error_str.lower()) or 'join this channel' in error_str.lower():
                    self.last_error_message = f"{video.title[:50]} - Members-only content"
                    self._cleanup_failed_video(session, video, queue_item, channel_dir, 'Members-only content detected')
                    return False, False, False, False, True, None  # already_handled=True

                # Check for copyright takedowns - move to removed status
                if 'copyright' in error_str.lower():
                    self.last_error_message = f"{video.title[:50]} - Copyright takedown"
                    self._cleanup_failed_video(session, video, queue_item, channel_dir, 'Copyright takedown detected')
                    return False, False, False, False, True, None  # already_handled=True

                # Check for empty file errors - DRM protected content, mark as removed and continue
                if 'downloaded file is empty' in error_str.lower() or 'empty file' in error_str.lower():
                    self.last_error_message = f"{video.title[:50]} - Empty file (DRM protected)"
                    self._cleanup_failed_video(session, video, queue_item, channel_dir, 'Empty file - likely DRM protected')
                    return False, False, False, False, True, None  # already_handled=True

                logger.error(f'Download attempt {attempt} failed for {video.yt_id}: {error_str}')

                # Check for rate limiting errors
                if ('rate' in error_str.lower() and 'limit' in error_str.lower()) or \
                   ("This content isn't available" in error_str and 'try again later' in error_str.lower()):
                    self.last_error_message = f"{video.title[:50]} - Rate limited by YouTube"
                    self._handle_rate_limit(session, video, queue_item)
                    return False, False, False, False, True, None  # already_handled=True

                if 'CERTIFICATE_VERIFY_FAILED' in error_str or 'SSL' in error_str:
                    if attempt < max_attempts:
                        attempt += 1
                        time.sleep(2)
                    else:
                        self.last_error_message = f"{video.title[:50]} - SSL certificate error"
                        logger.error('SSL certificate error persists. Try: pip install --upgrade yt-dlp certifi')
                        break

                elif '403' in error_str or 'Forbidden' in error_str:
                    if attempt < max_attempts:
                        logger.warning(f'403 error detected, retrying... (attempt {attempt}/{max_attempts})')
                        time.sleep(2)
                        attempt += 1
                    else:
                        # Only pause if we've exhausted all retries including without cookies
                        self.last_error_message = f"{video.title[:50]} - 403 Forbidden (rate limit)"
                        self._handle_rate_limit(session, video, queue_item, cookies_path, '403')
                        return False, False, False, False, True, None  # already_handled=True
                else:
                    # Unknown error - retry if we have attempts left, otherwise fail gracefully
                    if attempt < max_attempts:
                        logger.warning(f'Unknown error, retrying... (attempt {attempt}/{max_attempts})')
                        time.sleep(2)
                        attempt += 1
                    else:
                        # Max attempts reached - fail gracefully instead of crashing
                        # Truncate error message for display
                        short_error = error_str[:100] + '...' if len(error_str) > 100 else error_str
                        self.last_error_message = f"{video.title[:50]} - {short_error}"
                        logger.error(f'Max attempts reached for {video.yt_id}, giving up: {error_str}')
                        break

        # Check if timed out
        timed_out = self.current_download and self.current_download.get('timed_out', False)

        return download_success, cancelled, False, timed_out, False, ext  # rate_limited always False here (handled above), already_handled=False

    def _finalize_download(self, session, video, queue_item, channel, channel_dir, download_success, cancelled, timed_out, already_handled, ext):
        """Update video status and database based on download result."""
        # Early return if already handled by _execute_download (permanent errors, rate limits, pause)
        if already_handled:
            logger.debug(f'Download already handled for {video.yt_id}, skipping finalize')
            return

        # Check if file exists even on timeout/failure (postprocessing may have completed)
        if (timed_out or not download_success) and not cancelled:
            expected_file = os.path.join(channel_dir, f'{video.yt_id}.mp4')
            if os.path.exists(expected_file) and os.path.getsize(expected_file) > 1024 * 1024:  # > 1MB
                logger.info(f'Download reported {"timeout" if timed_out else "failure"} but file exists for {video.yt_id}, treating as success')
                download_success = True
                timed_out = False
                ext = 'mp4'

        if cancelled:
            # Cancelled - reset to discovered and delete queue item
            logger.info(f'Download cancelled for {video.yt_id}, resetting to discovered')
            video.status = 'discovered'
            session.delete(queue_item)
            # Set flag to notify frontend about kicked back videos (trigger auto-sort)
            self._set_discoveries_flag(session)
        elif timed_out:
            # Timeout and no file - reset to discovered and delete queue item
            logger.warning(f'Download timed out for {video.yt_id}, resetting to discovered')
            video.status = 'discovered'
            session.delete(queue_item)
            # Set flag to notify frontend about kicked back videos (trigger auto-sort)
            self._set_discoveries_flag(session)
        elif not download_success:
            # Failed (non-rate-limit) - reset to discovered and delete queue item
            logger.error(f'Download failed for {video.yt_id}, resetting to discovered')
            video.status = 'discovered'
            session.delete(queue_item)
            # Set flag to notify frontend about kicked back videos (trigger auto-sort)
            self._set_discoveries_flag(session)
        else:
            # Success - mark as library and delete queue item
            logger.info(f'Successfully downloaded video {video.yt_id}')

            # Clear rate limit message and error message on successful download
            self.rate_limit_message = None
            self.last_error_message = None

            # Get file path and size
            video_file_path = os.path.join(channel_dir, f'{video.yt_id}.{ext}')
            video.file_path = video_file_path
            video.file_size_bytes = os.path.getsize(video_file_path) if os.path.exists(video_file_path) else 0
            video.status = 'library'
            video.downloaded_at = datetime.now(timezone.utc)

            # Update thumb_url to local path (folder/videoId.jpg)
            folder_name = channel.folder_name if channel else (video.folder_name or 'Singles')
            video.thumb_url = f"{folder_name}/{video.yt_id}.jpg"

            # Log completion with file details
            size_mb = video.file_size_bytes / (1024 * 1024)
            # Get folder name for logging (handle both channel and playlist videos)
            folder_display = channel.folder_name if channel else f"Singles/{video.folder_name or 'Uncategorized'}"
            logger.info(f'Download complete: {video.title[:50]} ({size_mb:.1f} MB) - saved to {folder_display}/')
            logger.debug(f'File path: {video_file_path}')

            # Fetch and store SponsorBlock segments for playback-time skipping
            try:
                sponsorblock_categories = self.settings_manager.get_sponsorblock_categories()
                if sponsorblock_categories:
                    import json
                    segments = self._fetch_sponsorblock_segments(video.yt_id, sponsorblock_categories)
                    if segments:
                        video.sponsorblock_segments = json.dumps(segments)
                        logger.info(f'Stored {len(segments)} SponsorBlock segments for playback skipping')

                        # Cut segments from video file if enabled
                        if self.settings_manager.get_bool('sponsorblock_cut_segments'):
                            try:
                                # Show toast during cut
                                with self._download_lock:
                                    if self.current_download:
                                        self.current_download['phase'] = 'postprocessing'
                                        self.current_download['postprocessor'] = 'Cutting Segments'
                                        self.current_download['postprocess_start_time'] = time.time()
                                self._emit_queue_update(force=True)

                                new_size = self._cut_sponsorblock_segments(video_file_path, segments)
                                if new_size:
                                    video.file_size_bytes = new_size
                                    video.sponsorblock_segments = 'cut'  # Mark as cut, timestamps no longer valid
                            except Exception as cut_error:
                                logger.warning(f'Failed to cut SponsorBlock segments: {cut_error}')
            except Exception as sb_error:
                logger.warning(f'Failed to fetch SponsorBlock segments: {sb_error}')

            # Delete queue item - download complete (with explicit error handling to prevent orphans)
            try:
                logger.debug(f'Deleting queue item {queue_item.id} for video {video.yt_id}')
                session.delete(queue_item)
                logger.debug(f'Queue item {queue_item.id} marked for deletion')
            except Exception as delete_error:
                logger.error(f'Failed to delete queue item {queue_item.id} for video {video.yt_id}: {delete_error}')
                # Don't raise - we still want to commit the video status change
                # The cleanup script can handle orphaned queue items later

        self.current_download = None

        # Commit with explicit error handling
        try:
            session.commit()
            logger.debug(f'Download complete, current_download cleared, database committed')
            # Emit SSE event for queue state change
            self._emit_queue_update(force=True)
            # Emit video status change for real-time library updates
            queue_events.emit('video:changed')
        except Exception as commit_error:
            logger.error(f'Failed to commit download completion for video {video.yt_id}: {commit_error}')
            session.rollback()
            raise

    def _apply_inter_download_delay(self, download_success):
        """Set delay timer after successful download to avoid rate limiting."""
        if download_success:
            # Random delay between downloads to avoid rate limiting
            self.next_download_delay = random.randint(self.DELAY_MIN, self.DELAY_MAX)
            self.last_download_time = time.time()
            logger.info(f"Next download will wait {self.next_download_delay} seconds ({self.next_download_delay/60:.1f} min) to avoid rate limiting")
        else:
            logger.debug(f"No delay needed (download_success={download_success})")

    def _wait_for_delay(self):
        """Wait for inter-download delay if needed. Returns True if waited, False if no wait needed."""
        if not self.last_download_time or self.next_download_delay <= 0:
            return False

        elapsed = time.time() - self.last_download_time
        remaining = self.next_download_delay - elapsed

        if remaining <= 1:
            # Delay already passed (or less than 1 sec remaining - not worth showing)
            had_delay = self.delay_info is not None
            self.delay_info = None
            self.last_download_time = None
            self.next_download_delay = 0
            # Emit SSE update to clear delay indicator from UI
            if had_delay:
                self._emit_queue_update(force=True)
            return False

        # Still in delay period - update status and wait
        remaining_int = int(remaining)
        self.delay_info = f"Delayed {remaining_int} sec"

        # Emit SSE update so frontend countdown updates in real-time
        self._emit_queue_update()

        # Log occasionally
        if remaining_int % 30 == 0:
            logger.debug(f"Delay countdown: {remaining_int} seconds remaining")

        return True

    def _download_video(self, session, queue_item):
        """
        Download a video from the queue with full error handling and retry logic.

        This method orchestrates the entire download process using focused helper methods.
        """
        # 1. Validate and prepare
        video, channel, channel_dir = self._validate_and_prepare_video(session, queue_item)
        if not video:
            return

        # 2. Check format compatibility before proceeding
        video_url = f'https://www.youtube.com/watch?v={video.yt_id}'
        has_h264, _info = self._check_format_compatibility(video_url)

        if not has_h264:
            logger.warning(f"No H.264 format available for {video.yt_id} - {video.title}")

            # Set pending state and pause for user decision
            self.format_choice_pending = {
                'video_id': video.id,
                'yt_id': video.yt_id,
                'title': video.title,
                'queue_item_id': queue_item.id,
                'thumb_url': video.thumb_url,
            }

            # Reset video status back to queued while waiting
            video.status = 'queued'
            session.commit()

            # Emit SSE event to notify frontend
            self._emit_queue_update(force=True)
            queue_events.emit('format-choice', self.format_choice_pending)

            logger.info(f"Waiting for user format choice for {video.yt_id}")

            # Wait for user response (blocking)
            self._format_choice_event.clear()
            self._format_choice_result = None

            # Wait indefinitely until user responds
            while not self._format_choice_event.is_set():
                # Check if cancelled or paused
                if not self.running:
                    logger.info("Worker stopped while waiting for format choice")
                    self.format_choice_pending = None
                    return
                self._format_choice_event.wait(timeout=1)

            # Process user choice
            choice = self._format_choice_result
            self.format_choice_pending = None
            self._emit_queue_update(force=True)

            if choice == 'skip':
                logger.info(f"User chose to skip {video.yt_id}, marking as ignored")
                video.status = 'ignored'
                session.delete(queue_item)
                session.commit()
                queue_events.emit('video:changed')
                return

            elif choice == 'reencode':
                logger.info(f"User chose to re-encode {video.yt_id}")
                # Update status back to downloading
                video.status = 'downloading'
                session.commit()
                self._emit_queue_update(force=True)

                # Setup progress tracking for re-encode
                watchdog_thread, progress_hook = self._setup_progress_tracking(queue_item, video, channel_dir)

                # Download thumbnail
                self._download_thumbnail(video, channel_dir)

                # Execute re-encode download
                try:
                    success, ext = self._download_and_reencode(session, video, queue_item, channel_dir, progress_hook)
                    cancelled = False
                    timed_out = False
                    already_handled = False
                except Exception as e:
                    if 'cancelled' in str(e).lower():
                        success = False
                        cancelled = True
                        timed_out = False
                        already_handled = False
                        ext = None
                    else:
                        raise

                # Finalize
                self._finalize_download(
                    session, video, queue_item, channel, channel_dir,
                    success, cancelled, timed_out, already_handled, ext
                )
                self._apply_inter_download_delay(success)
                return

        # Normal H.264 download path
        # 3. Setup progress tracking and watchdog
        watchdog_thread, progress_hook = self._setup_progress_tracking(queue_item, video, channel_dir)

        # 4. Download thumbnail
        self._download_thumbnail(video, channel_dir)

        # 5. Configure yt-dlp options (pass duration for SponsorBlock skip check)
        ydl_opts, cookies_path = self._configure_download_options(channel_dir, video.yt_id, progress_hook, video.duration_sec)

        # 6. Execute download with retries
        success, cancelled, _rate_limited, timed_out, already_handled, ext = self._execute_download(
            session, video, queue_item, channel_dir, ydl_opts, cookies_path
        )

        # 7. Finalize download (update status, file info, etc.)
        self._finalize_download(
            session, video, queue_item, channel, channel_dir,
            success, cancelled, timed_out, already_handled, ext
        )

        # 8. Apply delay before next download
        self._apply_inter_download_delay(success)
