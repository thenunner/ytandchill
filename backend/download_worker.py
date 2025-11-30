import threading
import time
import os
import random
from datetime import datetime, timezone
import logging
import yt_dlp
from yt_dlp.utils import GeoRestrictedError
from models import Video, QueueItem, Setting, get_session
from sqlalchemy.orm import Session
import signal
import glob

logger = logging.getLogger(__name__)

class DownloadWorker:
    # Timeout constants
    PROGRESS_TIMEOUT = 1800  # 30 minutes of no progress triggers timeout
    HARD_TIMEOUT = 14400     # 4 hours maximum download time

    def __init__(self, session_factory, download_dir='downloads', settings_manager=None):
        self.session_factory = session_factory
        self.download_dir = download_dir
        self.settings_manager = settings_manager
        self.running = False
        self.thread = None
        self.current_download = None
        self.paused = True  # Start paused by default to prevent auto-start on backend restart
        self.delay_info = None  # For tracking delay status
        self.rate_limit_message = None  # Persistent rate limit message for UI
        self.last_download_time = None  # Track when last download finished for rate limiting
        self.next_download_delay = 0  # Delay in seconds before next download can start

        # Ensure download directory exists
        os.makedirs(download_dir, exist_ok=True)
    
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

    def resume(self):
        logger.info("Download worker resuming")
        self.paused = False

        # Reset any stuck 'downloading' videos back to 'queued' when resuming
        with get_session(self.session_factory) as session:
            stuck_videos = session.query(Video).filter(
                Video.status == 'downloading'
            ).all()
            for video in stuck_videos:
                logger.debug(f"Resetting stuck video {video.yt_id} from 'downloading' to 'queued'")
                video.status = 'queued'

                # Reset progress for the queue item
                queue_item = session.query(QueueItem).filter(
                    QueueItem.video_id == video.id
                ).first()
                if queue_item:
                    queue_item.progress_pct = 0
                    queue_item.speed_bps = 0
                    queue_item.eta_seconds = 0

            # DON'T clear queue_item.log - keep rate limit warnings visible
            # They will be cleared automatically when a download actually succeeds

            if stuck_videos:
                logger.info(f"Reset {len(stuck_videos)} stuck 'downloading' videos to 'queued'")
            else:
                logger.debug("No stuck videos found when resuming")
    
    def cancel_current(self):
        if self.current_download:
            logger.info(f"Cancelling current download: {self.current_download}")
            self.current_download['cancelled'] = True

    def _cleanup_failed_video(self, session, video, queue_item, channel_dir, reason):
        """
        Cleanup files and set video to ignored status.

        Args:
            session: Database session
            video: Video object
            queue_item: QueueItem object
            channel_dir: Channel directory path
            reason: Human-readable reason for ignoring
        """
        logger.warning(f'{reason}: {video.title} ({video.yt_id})')
        logger.warning(f'Moving video to ignored status')

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
        video.status = 'ignored'
        if queue_item:
            session.delete(queue_item)
        session.commit()
        self.current_download = None
        logger.info(f'Successfully moved video to ignored: {video.yt_id}')

    def _handle_rate_limit(self, session, video, queue_item, cookies_path=None, error_code=None):
        """
        Handle rate limiting errors with appropriate messages.

        Args:
            session: Database session
            video: Video object
            queue_item: QueueItem object
            cookies_path: Path to cookies.txt (optional, for 403 errors)
            error_code: Error code string (e.g., '403') for specific messages
        """
        logger.warning(f'WARNING: RATE LIMIT DETECTED ({error_code or "general"}) - Auto-pausing queue')
        self.paused = True
        video.status = 'queued'

        # Set appropriate message based on error type
        if error_code == '403':
            if cookies_path and os.path.exists(cookies_path):
                msg = 'YouTube rate limit detected (403 Forbidden). Try updating your cookies.txt file and wait 30-60 minutes.'
            else:
                msg = 'YouTube rate limit detected (403 Forbidden). Add a cookies.txt file and wait 30-60 minutes.'
        else:
            msg = 'YouTube rate limit detected. Queue paused. Please wait 30-60 minutes before resuming downloads.'

        self.rate_limit_message = msg
        queue_item.log = msg

        # Reset any other stuck 'downloading' videos back to 'queued'
        with get_session(self.session_factory) as temp_session:
            stuck_videos = temp_session.query(Video).filter(
                Video.status == 'downloading',
                Video.id != video.id
            ).all()
            for stuck_video in stuck_videos:
                stuck_video.status = 'queued'
                # Reset progress for their queue items
                stuck_queue_item = temp_session.query(QueueItem).filter(
                    QueueItem.video_id == stuck_video.id
                ).first()
                if stuck_queue_item:
                    stuck_queue_item.progress_pct = 0
                    stuck_queue_item.speed_bps = 0
                    stuck_queue_item.eta_seconds = 0

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
        while self.current_download and not self.current_download.get('cancelled'):
            current_time = time.time()

            # Check if download has been removed (completed/failed)
            if not self.current_download:
                break

            elapsed_total = current_time - self.current_download['start_time']
            time_since_progress = current_time - self.current_download['last_progress_time']

            # Hard timeout: Maximum download duration exceeded
            if elapsed_total > self.HARD_TIMEOUT:
                logger.warning(f'TIMEOUT: Download exceeded {self.HARD_TIMEOUT/3600:.1f} hour limit - {video_title[:50]}')
                logger.warning(f'Total time: {elapsed_total/3600:.2f} hours')
                self.current_download['timed_out'] = True
                break

            # Soft timeout: No progress for too long
            if time_since_progress > self.PROGRESS_TIMEOUT:
                logger.warning(f'TIMEOUT: No progress for {self.PROGRESS_TIMEOUT/60:.0f} minutes - {video_title[:50]}')
                logger.warning(f'Last progress: {time_since_progress/60:.1f} minutes ago')
                self.current_download['timed_out'] = True
                break

            # Check every 10 seconds
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

        # Prepare download path
        os.makedirs(video_dir, exist_ok=True)

        return video, channel, video_dir

    def _setup_progress_tracking(self, queue_item, video):
        """
        Setup progress tracking and watchdog timer.

        Returns:
            tuple: (watchdog_thread, progress_hook_function)
        """
        # Setup progress tracking with timeout watchdog
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
            if self.current_download and self.current_download.get('cancelled'):
                raise Exception('Download cancelled by user')

            if self.current_download and self.current_download.get('timed_out'):
                raise Exception('Download timed out - no progress for too long')

            # Check if queue was paused during download
            if self.paused:
                raise Exception('Download paused by user')

            if d['status'] == 'downloading':
                # Update last activity time
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
        import urllib.request
        thumb_path = os.path.join(channel_dir, f'{video.yt_id}.jpg')
        try:
            logger.debug(f'Downloading thumbnail from {video.thumb_url}')
            urllib.request.urlretrieve(video.thumb_url, thumb_path)
            logger.debug(f'Downloaded thumbnail for {video.yt_id}')
        except Exception as thumb_error:
            logger.warning(f'Failed to download thumbnail: {thumb_error}')

    def _configure_download_options(self, channel_dir, video_yt_id, progress_hook):
        """
        Build yt-dlp options dictionary with all settings.

        Returns:
            tuple: (ydl_opts dict, cookies_path)
        """
        # yt-dlp options - Works with HLS/m3u8 streams
        ydl_opts = {
            'format': 'best',  # Let yt-dlp choose best available format
            'outtmpl': os.path.join(channel_dir, f'{video_yt_id}.%(ext)s'),
            'quiet': True,
            'no_warnings': True,
            'progress_hooks': [progress_hook],
            'nocheckcertificate': True,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'socket_timeout': 30,
            'retries': 3,
            'continue': True,
            'noprogress': False,
            'concurrent_fragment_downloads': 3,  # Download 3 fragments in parallel for better performance
            'postprocessor_args': {
                'ffmpeg': ['-movflags', '+faststart']  # Move MOOV atom to beginning for fast video seeking
            },
        }

        # Add cookies if available
        cookies_path = os.path.join(os.path.dirname(__file__), 'cookies.txt')
        if os.path.exists(cookies_path):
            ydl_opts['cookiefile'] = cookies_path
            logger.info('Using cookies.txt file for authentication')
        else:
            logger.warning('No cookies.txt file found - downloads may be rate-limited')

        # Add SponsorBlock if enabled
        try:
            sponsorblock_categories = self.settings_manager.get_sponsorblock_categories()

            if sponsorblock_categories:
                ydl_opts['sponsorblock_remove'] = sponsorblock_categories
                logger.info(f'SponsorBlock enabled - removing categories: {", ".join(sponsorblock_categories)}')
        except Exception as sb_error:
            logger.warning(f'Failed to load SponsorBlock settings: {sb_error}')

        return ydl_opts, cookies_path

    def _execute_download(self, session, video, queue_item, channel_dir, ydl_opts, cookies_path):
        """
        Execute download with retries and error handling.

        Returns:
            tuple: (success, cancelled, rate_limited, timed_out, ext)
                - success: bool - download succeeded
                - cancelled: bool - user cancelled
                - rate_limited: bool - hit rate limit
                - timed_out: bool - download timed out
                - ext: str - file extension (or None)
        """
        download_success = False
        cancelled = False
        rate_limited = False
        ext = None
        attempt = 1
        max_attempts = 2

        # Retry loop
        while attempt <= max_attempts and not download_success:
            try:
                logger.info(f'Download attempt {attempt}/{max_attempts} for video {video.yt_id}')

                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(f'https://www.youtube.com/watch?v={video.yt_id}', download=True)
                    ext = info['ext']

                logger.info(f'Download attempt {attempt} succeeded for {video.yt_id}')
                download_success = True

            except GeoRestrictedError as geo_error:
                # Video is geo-blocked - mark as geoblocked and skip
                logger.warning(f'Video geo-blocked: {video.title} ({video.yt_id})')
                video.status = 'geoblocked'
                session.delete(queue_item)
                session.commit()
                self.current_download = None
                return False, False, False, False, None

            except Exception as download_error:
                error_str = str(download_error)

                if 'cancelled' in error_str.lower():
                    logger.info(f'Download cancelled for {video.yt_id}')
                    cancelled = True
                    break

                if 'paused' in error_str.lower():
                    logger.info(f'Download paused for {video.yt_id} at {queue_item.progress_pct:.1f}%')
                    # Keep video in queued status but preserve progress
                    # The .part file remains on disk, yt-dlp will auto-resume from this point
                    video.status = 'queued'
                    # Keep progress_pct and total_bytes so UI shows "Paused at X%"
                    # Only reset speed and ETA since those are no longer valid
                    queue_item.speed_bps = 0
                    queue_item.eta_seconds = 0
                    session.commit()
                    self.current_download = None
                    return False, False, False, False, None

                # Check for age verification errors - move to ignored status
                if 'verify your age' in error_str.lower() or \
                   ('age' in error_str.lower() and 'verif' in error_str.lower()):
                    self._cleanup_failed_video(session, video, queue_item, channel_dir, 'Age verification required')
                    return False, False, False, False, None

                # Check for private videos - auto-ignore
                if 'private' in error_str.lower() and 'video' in error_str.lower():
                    self._cleanup_failed_video(session, video, queue_item, channel_dir, 'Private video detected')
                    return False, False, False, False, None

                # Check for deleted/unavailable videos - auto-ignore
                if 'removed' in error_str.lower() or 'unavailable' in error_str.lower() or 'does not exist' in error_str.lower():
                    self._cleanup_failed_video(session, video, queue_item, channel_dir, 'Deleted/unavailable video detected')
                    return False, False, False, False, None

                # Check for members-only content - auto-ignore
                if ('members' in error_str.lower() and 'only' in error_str.lower()) or 'join this channel' in error_str.lower():
                    self._cleanup_failed_video(session, video, queue_item, channel_dir, 'Members-only content detected')
                    return False, False, False, False, None

                # Check for copyright takedowns - auto-ignore
                if 'copyright' in error_str.lower():
                    self._cleanup_failed_video(session, video, queue_item, channel_dir, 'Copyright takedown detected')
                    return False, False, False, False, None

                logger.error(f'Download attempt {attempt} failed for {video.yt_id}: {error_str}')

                # Check for rate limiting errors
                if ('rate' in error_str.lower() and 'limit' in error_str.lower()) or \
                   ("This content isn't available" in error_str and 'try again later' in error_str.lower()):
                    self._handle_rate_limit(session, video, queue_item)
                    rate_limited = True
                    break

                if 'CERTIFICATE_VERIFY_FAILED' in error_str or 'SSL' in error_str:
                    if attempt < max_attempts:
                        attempt += 1
                        time.sleep(2)
                    else:
                        raise Exception('SSL certificate error persists. Try: pip install --upgrade yt-dlp certifi')

                elif '403' in error_str or 'Forbidden' in error_str:
                    if attempt < max_attempts:
                        logger.warning(f'403 error detected, retrying... (attempt {attempt}/{max_attempts})')
                        time.sleep(2)
                        attempt += 1
                    else:
                        # Also pause on 403 errors as they often indicate rate limiting
                        self._handle_rate_limit(session, video, queue_item, cookies_path, '403')
                        rate_limited = True
                        break
                else:
                    raise download_error

        # Check if timed out
        timed_out = self.current_download and self.current_download.get('timed_out', False)

        return download_success, cancelled, rate_limited, timed_out, ext

    def _finalize_download(self, session, video, queue_item, channel, channel_dir, download_success, cancelled, rate_limited, timed_out, ext):
        """Update video status and database based on download result."""
        if cancelled:
            # Cancelled - reset to discovered and delete queue item
            logger.info(f'Download cancelled for {video.yt_id}, resetting to discovered')
            video.status = 'discovered'
            session.delete(queue_item)
        elif timed_out:
            # Timeout - reset to discovered and delete queue item (same as cancelled)
            logger.warning(f'Download timed out for {video.yt_id}, resetting to discovered')
            video.status = 'discovered'
            session.delete(queue_item)
        elif rate_limited:
            # Rate limited - keep video in queue, keep queue item, maintain paused state
            logger.warning(f'Download rate-limited for {video.yt_id}, keeping in queue')
            video.status = 'queued'  # Ensure it stays queued
            queue_item.progress_pct = 0  # Reset progress
            queue_item.speed_bps = 0
            queue_item.eta_seconds = 0
        elif not download_success:
            # Failed (non-rate-limit) - reset to discovered and delete queue item
            logger.error(f'Download failed for {video.yt_id}, resetting to discovered')
            video.status = 'discovered'
            session.delete(queue_item)
        else:
            # Success - mark as library and delete queue item
            logger.info(f'Successfully downloaded video {video.yt_id}')

            # Clear rate limit message on successful download
            self.rate_limit_message = None

            # Get file path and size
            video_file_path = os.path.join(channel_dir, f'{video.yt_id}.{ext}')
            video.file_path = video_file_path
            video.file_size_bytes = os.path.getsize(video_file_path) if os.path.exists(video_file_path) else 0
            video.status = 'library'
            video.downloaded_at = datetime.now(timezone.utc)

            # Log completion with file details
            size_mb = video.file_size_bytes / (1024 * 1024)
            # Get folder name for logging (handle both channel and playlist videos)
            folder_display = channel.folder_name if channel else f"Singles/{video.folder_name or 'Uncategorized'}"
            logger.info(f'Download complete: {video.title[:50]} ({size_mb:.1f} MB) - saved to {folder_display}/')
            logger.debug(f'File path: {video_file_path}')

            # Delete queue item - download complete
            session.delete(queue_item)

        self.current_download = None
        session.commit()
        logger.debug(f'Download complete, current_download cleared')

    def _apply_inter_download_delay(self, download_success):
        """Set delay timer after successful download to avoid rate limiting."""
        if download_success:
            # Random delay: 60 seconds to 3 minutes (60-180 seconds)
            self.next_download_delay = random.randint(60, 180)
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
        if remaining_int >= 60:
            self.delay_info = f"Delayed {remaining_int//60} min {remaining_int%60} sec to avoid rate limiting"
        else:
            self.delay_info = f"Delayed {remaining_int} sec to avoid rate limiting"

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
        success, cancelled, rate_limited, timed_out, ext = self._execute_download(
            session, video, queue_item, channel_dir, ydl_opts, cookies_path
        )

        # 6. Finalize download (update status, file info, etc.)
        self._finalize_download(
            session, video, queue_item, channel, channel_dir,
            success, cancelled, rate_limited, timed_out, ext
        )

        # 7. Apply delay before next download
        self._apply_inter_download_delay(success)
