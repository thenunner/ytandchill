import threading
import time
import os
import random
from datetime import datetime, timezone
import logging
import yt_dlp
from yt_dlp.utils import GeoRestrictedError
from database import Video, QueueItem, Setting, get_session
from utils import download_thumbnail, makedirs_777

logger = logging.getLogger(__name__)


class YtDlpLogger:
    """Custom logger for yt-dlp that routes output to our logging system."""

    def debug(self, msg):
        # yt-dlp sends most info as debug, log at INFO for visibility
        if msg.startswith('[debug]'):
            logger.debug(f'[yt-dlp] {msg}')
        else:
            logger.info(f'[yt-dlp] {msg}')

    def info(self, msg):
        logger.info(f'[yt-dlp] {msg}')

    def warning(self, msg):
        logger.warning(f'[yt-dlp] {msg}')

    def error(self, msg):
        logger.error(f'[yt-dlp] {msg}')


class DownloadWorker:
    # Timeout constants
    PROGRESS_TIMEOUT = 120   # 2 minutes of no progress triggers timeout (file not growing)
    HARD_TIMEOUT = 14400     # 4 hours maximum download time

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

        # Ensure download directory exists with proper permissions
        makedirs_777(download_dir)
    
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
    
    def cancel_current(self):
        with self._download_lock:
            if self.current_download:
                logger.info(f"Cancelling current download: {self.current_download}")
                self.current_download['cancelled'] = True

    def _set_discoveries_flag(self, session):
        """Set the new discoveries flag using the existing session to avoid database locks."""
        setting = session.query(Setting).filter(Setting.key == 'new_discoveries_flag').first()
        if setting:
            setting.value = 'true'
        else:
            setting = Setting(key='new_discoveries_flag', value='true')
            session.add(setting)
        # Don't commit here - let the caller handle the transaction

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

    def _worker_loop(self):
        logger.debug("Worker loop started")
        while self.running:
            if self.paused:
                logger.debug("Worker paused, sleeping...")
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
                        # Queue is empty - clear delay info (no point showing delay with empty queue)
                        if self.delay_info:
                            self.delay_info = None
                        # Clear rate limit message
                        if self.rate_limit_message:
                            logger.info("Queue empty - clearing rate limit message")
                            self.rate_limit_message = None
                        logger.debug("No queued videos found, sleeping...")
                        time.sleep(2)  # Wait before checking again
            except Exception as e:
                logger.error(f"Worker error: {e}", exc_info=True)

            time.sleep(0.5)

    def _watchdog_timer(self, video_id, video_title):
        """
        Monitors download progress and sets timeout flag if download stalls.
        Runs in a separate thread parallel to the download.
        """
        while True:
            with self._download_lock:
                download = self.current_download
                if not download or download.get('cancelled'):
                    break

                current_time = time.time()
                elapsed_total = current_time - download.get('start_time', current_time)
                time_since_progress = current_time - download.get('last_progress_time', current_time)

                # Hard timeout: Maximum download duration exceeded
                if elapsed_total > self.HARD_TIMEOUT:
                    logger.warning(f'TIMEOUT: Download exceeded {self.HARD_TIMEOUT/3600:.1f} hour limit - {video_title[:50]}')
                    logger.warning(f'Total time: {elapsed_total/3600:.2f} hours')
                    download['timed_out'] = True
                    break

                # Soft timeout: No progress for too long
                if time_since_progress > self.PROGRESS_TIMEOUT:
                    logger.warning(f'TIMEOUT: No progress for {self.PROGRESS_TIMEOUT:.0f} seconds - {video_title[:50]}')
                    logger.warning(f'Last progress: {time_since_progress:.0f} seconds ago')
                    download['timed_out'] = True
                    break

            # Check every 10 seconds (outside lock to not block other threads)
            time.sleep(10)

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

        # Prepare download path with proper permissions
        makedirs_777(video_dir)

        return video, channel, video_dir

    def _setup_progress_tracking(self, queue_item, video):
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
                'timed_out': False
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

    def _configure_download_options(self, channel_dir, video_yt_id, progress_hook):
        """
        Build yt-dlp options dictionary with all settings.

        Returns:
            tuple: (ydl_opts dict, cookies_path)
        """
        # yt-dlp options - Works with HLS/m3u8 streams
        ydl_opts = {
            # Prefer H.264 High profile (avc1.64) for better seeking in Chrome/Edge, fallback to any H.264
            'format': 'bestvideo[vcodec~="^avc1.64"][ext=mp4][height<=1080]+bestaudio[ext=m4a]/bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
            'outtmpl': os.path.join(channel_dir, f'{video_yt_id}.%(ext)s'),
            'quiet': False,  # Enable output for logging
            'verbose': True,  # Verbose output for debugging
            'no_warnings': False,  # Show warnings
            'logger': YtDlpLogger(),  # Custom logger to route to our logging system
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

        # Add cookies if available
        data_dir = os.environ.get('DATA_DIR', 'data')
        cookies_path = os.path.join(data_dir, 'cookies.txt')

        # Check cookie source setting (default: 'file' for backward compatibility)
        cookie_source = self.settings_manager.get('cookie_source', 'file')

        if cookie_source == 'none':
            logger.info('Downloads using anonymous access (no cookies)')
            # Don't set cookiefile or cookiesfrombrowser - yt-dlp will use anonymous access

        elif cookie_source == 'browser':
            browser_type = self.settings_manager.get('cookie_browser', 'firefox')
            try:
                # yt-dlp format: (browser_name, profile, keyring, container)
                # Platform-specific handling:
                # - Docker: use /firefox_profile mount point
                # - Windows/Linux native: let yt-dlp auto-detect browser profile
                if os.path.exists('/.dockerenv'):
                    # Docker container - use mounted Firefox profile
                    firefox_profile_path = '/firefox_profile'
                    ydl_opts['cookiesfrombrowser'] = (browser_type, firefox_profile_path, None, None)
                    logger.info(f'Using cookies from {browser_type} browser at {firefox_profile_path}')
                else:
                    # Native Windows/Linux - let yt-dlp auto-detect
                    ydl_opts['cookiesfrombrowser'] = (browser_type, None, None, None)
                    logger.info(f'Using cookies from {browser_type} browser (auto-detect profile)')
            except Exception as e:
                logger.warning(f'Failed to extract cookies from browser: {e}')
                logger.warning('Browser cookie extraction failed - continuing without cookies')

        elif cookie_source == 'file':
            if os.path.exists(cookies_path):
                ydl_opts['cookiefile'] = cookies_path
                logger.info('Using cookies.txt file for authentication')
            else:
                logger.warning('No cookies.txt file found - downloads may be rate-limited')

        else:
            # Fallback for unknown values (shouldn't happen)
            logger.warning(f'Unknown cookie_source: {cookie_source}, using anonymous access')

        # Add SponsorBlock if enabled
        # Note: Must add postprocessors explicitly when using yt-dlp Python API
        # The sponsorblock_remove option alone doesn't work - need SponsorBlock PP to fetch
        # segment data, then ModifyChapters PP to remove them
        try:
            sponsorblock_categories = self.settings_manager.get_sponsorblock_categories()

            if sponsorblock_categories:
                # Add SponsorBlock postprocessor to fetch segment data from API
                ydl_opts['postprocessors'].append({
                    'key': 'SponsorBlock',
                    'categories': sponsorblock_categories,
                    'api': 'https://sponsor.ajay.app',
                })
                # Add ModifyChapters postprocessor to remove the segments
                ydl_opts['postprocessors'].append({
                    'key': 'ModifyChapters',
                    'remove_sponsor_segments': sponsorblock_categories,
                })
                logger.info(f'SponsorBlock enabled - removing categories: {", ".join(sponsorblock_categories)}')
        except Exception as sb_error:
            logger.warning(f'Failed to load SponsorBlock settings: {sb_error}')

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

        if cancelled:
            # Cancelled - reset to discovered and delete queue item
            logger.info(f'Download cancelled for {video.yt_id}, resetting to discovered')
            video.status = 'discovered'
            session.delete(queue_item)
            # Set flag to notify frontend about kicked back videos (trigger auto-sort)
            self._set_discoveries_flag(session)
        elif timed_out:
            # Timeout - reset to discovered and delete queue item (same as cancelled)
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

        if remaining <= 0:
            # Delay already passed
            self.delay_info = None
            self.last_download_time = None
            self.next_download_delay = 0
            return False

        # Still in delay period - update status and wait
        remaining_int = int(remaining)
        self.delay_info = f"Delayed {remaining_int} sec"

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

        # 2. Setup progress tracking and watchdog
        watchdog_thread, progress_hook = self._setup_progress_tracking(queue_item, video)

        # 3. Download thumbnail
        self._download_thumbnail(video, channel_dir)

        # 4. Configure yt-dlp options
        ydl_opts, cookies_path = self._configure_download_options(channel_dir, video.yt_id, progress_hook)

        # 5. Execute download with retries
        success, cancelled, _rate_limited, timed_out, already_handled, ext = self._execute_download(
            session, video, queue_item, channel_dir, ydl_opts, cookies_path
        )

        # 6. Finalize download (update status, file info, etc.)
        self._finalize_download(
            session, video, queue_item, channel, channel_dir,
            success, cancelled, timed_out, already_handled, ext
        )

        # 7. Apply delay before next download
        self._apply_inter_download_delay(success)
