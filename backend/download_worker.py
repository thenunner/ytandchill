import threading
import time
import os
import random
from datetime import datetime, timezone
import logging
import yt_dlp
from yt_dlp.utils import GeoRestrictedError
from models import Video, QueueItem
from sqlalchemy.orm import Session
import signal
import glob

logger = logging.getLogger(__name__)

class DownloadWorker:
    # Timeout constants
    PROGRESS_TIMEOUT = 1800  # 30 minutes of no progress triggers timeout
    HARD_TIMEOUT = 14400     # 4 hours maximum download time

    def __init__(self, session_factory, download_dir='downloads'):
        self.session_factory = session_factory
        self.download_dir = download_dir
        self.running = False
        self.thread = None
        self.current_download = None
        self.paused = True  # Start paused by default to prevent auto-start on backend restart
        self.delay_info = None  # For tracking delay status
        self.rate_limit_message = None  # Persistent rate limit message for UI

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
        session = self.session_factory()
        try:
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
            session.commit()
        finally:
            session.close()
    
    def cancel_current(self):
        if self.current_download:
            logger.info(f"Cancelling current download: {self.current_download}")
            self.current_download['cancelled'] = True

    def _worker_loop(self):
        logger.debug("Worker loop started")
        while self.running:
            if self.paused:
                logger.debug("Worker paused, sleeping...")
                time.sleep(1)
                continue

            session = self.session_factory()
            try:
                # Get next queued video (join with QueueItem for ordering)
                queue_item = session.query(QueueItem).join(Video).filter(
                    Video.status == 'queued'
                ).order_by(QueueItem.queue_position).first()

                if queue_item:
                    logger.info(f"Found queued video: {queue_item.video.yt_id} - {queue_item.video.title}")
                    self._download_video(session, queue_item)
                else:
                    # Queue is empty - clear rate limit message
                    if self.rate_limit_message:
                        logger.info("Queue empty - clearing rate limit message")
                        self.rate_limit_message = None
                    logger.debug("No queued videos found, sleeping...")
                    time.sleep(2)  # Wait before checking again

                session.commit()
            except Exception as e:
                session.rollback()
                logger.error(f"Worker error: {e}", exc_info=True)
            finally:
                session.close()

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

    def _download_video(self, session, queue_item):
        video = session.query(Video).filter(Video.id == queue_item.video_id).first()
        if not video:
            # Video not found - delete queue item
            logger.warning(f"Video not found for queue item {queue_item.id}, deleting queue item")
            session.delete(queue_item)
            session.commit()
            return

        logger.info(f"Starting download for video: {video.yt_id} - {video.title}")

        channel = video.channel
        if not channel:
            # Channel not found - delete queue item and reset video
            logger.error(f"Channel not found for video {video.yt_id}, resetting to 'discovered'")
            video.status = 'discovered'
            session.delete(queue_item)
            session.commit()
            return

        logger.debug(f"Channel: {channel.title}, Folder: {channel.folder_name}")

        # Update status to downloading
        video.status = 'downloading'
        session.commit()
        logger.info(f"Video {video.yt_id} status updated to 'downloading'")

        # Prepare download path
        channel_dir = os.path.join(self.download_dir, channel.folder_name)
        os.makedirs(channel_dir, exist_ok=True)

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
                    temp_session = self.session_factory()
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
                        temp_session.commit()
                    temp_session.close()
                except Exception as progress_error:
                    logger.error(f'Failed to update download progress for {video.yt_id}: {progress_error}')

        # Download thumbnail from YouTube first (same approach as test-app.py line 1038)
        import urllib.request
        thumb_path = os.path.join(channel_dir, f'{video.yt_id}.jpg')
        try:
            logger.debug(f'Downloading thumbnail from {video.thumb_url}')
            urllib.request.urlretrieve(video.thumb_url, thumb_path)
            logger.debug(f'Downloaded thumbnail for {video.yt_id}')
        except Exception as thumb_error:
            logger.warning(f'Failed to download thumbnail: {thumb_error}')

        # yt-dlp options - Works with HLS/m3u8 streams
        ydl_opts = {
            'format': 'best',  # Let yt-dlp choose best available format
            'outtmpl': os.path.join(channel_dir, f'{video.yt_id}.%(ext)s'),
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
        }

        # Add cookies if available
        cookies_path = os.path.join(os.path.dirname(__file__), 'cookies.txt')
        if os.path.exists(cookies_path):
            ydl_opts['cookiefile'] = cookies_path
            logger.info('Using cookies.txt file for authentication')
            # Removed print - using logger instead
        else:
            logger.warning('No cookies.txt file found - downloads may be rate-limited')
            # Removed print - using logger instead

        download_success = False
        cancelled = False
        rate_limited = False  # Track if download failed due to rate limiting
        attempt = 1
        max_attempts = 2

        # Retry loop from test-app.py lines 1095-1134
        while attempt <= max_attempts and not download_success:
            try:
                logger.info(f'Download attempt {attempt}/{max_attempts} for video {video.yt_id}')
                # Removed print - using logger instead

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
                return  # Exit and move to next video

            except Exception as download_error:
                error_str = str(download_error)

                if 'cancelled' in error_str.lower():
                    logger.info(f'Download cancelled for {video.yt_id}')
                    # Removed print - using logger instead
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
                    return  # Exit download, .part file preserved for resume

                # Check for age verification errors - move to ignored status
                if 'verify your age' in error_str.lower() or \
                   ('age' in error_str.lower() and 'verif' in error_str.lower()):
                    logger.warning(f'Age verification required for video: {video.title} ({video.yt_id})')
                    logger.warning('Moving video to ignored status to prevent re-download attempts')

                    # Delete partial files if they exist
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

                    # Set to ignored status and remove from queue
                    video.status = 'ignored'
                    if queue_item:
                        session.delete(queue_item)
                    session.commit()
                    self.current_download = None
                    logger.info(f'Successfully moved age-restricted video to ignored: {video.yt_id}')
                    return  # Exit and move to next video

                # Check for private videos - auto-ignore
                if 'private' in error_str.lower() and 'video' in error_str.lower():
                    logger.warning(f'Private video detected: {video.title} ({video.yt_id})')
                    logger.warning('Moving private video to ignored status')

                    # Delete partial files if they exist
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

                    # Set to ignored status and remove from queue
                    video.status = 'ignored'
                    if queue_item:
                        session.delete(queue_item)
                    session.commit()
                    self.current_download = None
                    logger.info(f'Successfully moved private video to ignored: {video.yt_id}')
                    return  # Exit and move to next video

                # Check for deleted/unavailable videos - auto-ignore
                if 'removed' in error_str.lower() or 'unavailable' in error_str.lower() or 'does not exist' in error_str.lower():
                    logger.warning(f'Deleted/unavailable video detected: {video.title} ({video.yt_id})')
                    logger.warning('Moving deleted video to ignored status')

                    # Delete partial files if they exist
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

                    # Set to ignored status and remove from queue
                    video.status = 'ignored'
                    if queue_item:
                        session.delete(queue_item)
                    session.commit()
                    self.current_download = None
                    logger.info(f'Successfully moved deleted/unavailable video to ignored: {video.yt_id}')
                    return  # Exit and move to next video

                # Check for members-only content - auto-ignore
                if ('members' in error_str.lower() and 'only' in error_str.lower()) or 'join this channel' in error_str.lower():
                    logger.warning(f'Members-only content detected: {video.title} ({video.yt_id})')
                    logger.warning('Moving members-only video to ignored status')

                    # Delete partial files if they exist
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

                    # Set to ignored status and remove from queue
                    video.status = 'ignored'
                    if queue_item:
                        session.delete(queue_item)
                    session.commit()
                    self.current_download = None
                    logger.info(f'Successfully moved members-only video to ignored: {video.yt_id}')
                    return  # Exit and move to next video

                # Check for copyright takedowns - auto-ignore
                if 'copyright' in error_str.lower():
                    logger.warning(f'Copyright takedown detected: {video.title} ({video.yt_id})')
                    logger.warning('Moving copyright-blocked video to ignored status')

                    # Delete partial files if they exist
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

                    # Set to ignored status and remove from queue
                    video.status = 'ignored'
                    if queue_item:
                        session.delete(queue_item)
                    session.commit()
                    self.current_download = None
                    logger.info(f'Successfully moved copyright-blocked video to ignored: {video.yt_id}')
                    return  # Exit and move to next video

                logger.error(f'Download attempt {attempt} failed for {video.yt_id}: {error_str}')
                # Removed print - using logger instead

                # Check for rate limiting errors
                if ('rate' in error_str.lower() and 'limit' in error_str.lower()) or \
                   ("This content isn't available" in error_str and 'try again later' in error_str.lower()):
                    logger.warning('WARNING: RATE LIMIT DETECTED - Auto-pausing queue')
                    # Removed print - using logger instead
                    self.paused = True
                    rate_limited = True  # Mark as rate limited

                    # Set persistent rate limit message
                    self.rate_limit_message = 'YouTube rate limit detected. Queue paused. Please wait 30-60 minutes before resuming downloads.'
                    queue_item.log = self.rate_limit_message
                    video.status = 'queued'  # Keep as queued for retry

                    # Reset any other stuck 'downloading' videos back to 'queued'
                    temp_session = self.session_factory()
                    try:
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
                        temp_session.commit()
                    finally:
                        temp_session.close()

                    break

                if 'CERTIFICATE_VERIFY_FAILED' in error_str or 'SSL' in error_str:
                    # Removed print - using logger instead
                    if attempt < max_attempts:
                        attempt += 1
                        time.sleep(2)
                    else:
                        raise Exception('SSL certificate error persists. Try: pip install --upgrade yt-dlp certifi')

                elif '403' in error_str or 'Forbidden' in error_str:
                    if attempt < max_attempts:
                        logger.warning(f'403 error detected, retrying... (attempt {attempt}/{max_attempts})')
                        # Removed print - using logger instead
                        time.sleep(2)
                        attempt += 1
                    else:
                        # Also pause on 403 errors as they often indicate rate limiting
                        logger.warning('WARNING: 403 ERROR - Auto-pausing queue (likely rate-limited)')
                        self.paused = True
                        rate_limited = True  # Mark as rate limited
                        video.status = 'queued'  # Keep as queued for retry

                        # Reset any other stuck 'downloading' videos back to 'queued'
                        temp_session = self.session_factory()
                        try:
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
                            temp_session.commit()
                        finally:
                            temp_session.close()

                        if os.path.exists(cookies_path):
                            self.rate_limit_message = 'YouTube rate limit detected (403 Forbidden). Try updating your cookies.txt file and wait 30-60 minutes.'
                            queue_item.log = self.rate_limit_message
                        else:
                            self.rate_limit_message = 'YouTube rate limit detected (403 Forbidden). Add a cookies.txt file and wait 30-60 minutes.'
                            queue_item.log = self.rate_limit_message
                        break  # Exit retry loop
                else:
                    raise download_error

        # Check if timed out
        timed_out = self.current_download and self.current_download.get('timed_out', False)

        if cancelled:
            # Cancelled - reset to discovered and delete queue item
            logger.info(f'Download cancelled for {video.yt_id}, resetting to discovered')
            video.status = 'discovered'
            session.delete(queue_item)
            # Removed print - using logger instead
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
            # queue_item.log already set above
            # Removed print - using logger instead
        elif not download_success:
            # Failed (non-rate-limit) - reset to discovered and delete queue item
            logger.error(f'Download failed for {video.yt_id}, resetting to discovered')
            video.status = 'discovered'
            session.delete(queue_item)
            # Removed print - using logger instead
        else:
            # Success - mark as library and delete queue item
            logger.info(f'Successfully downloaded video {video.yt_id}')
            # Removed print - using logger instead

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
            logger.info(f'Download complete: {video.title[:50]} ({size_mb:.1f} MB) - saved to {channel.folder_name}/')
            logger.debug(f'File path: {video_file_path}')

            # Delete queue item - download complete
            session.delete(queue_item)

        self.current_download = None
        session.commit()
        logger.debug(f'Download complete, current_download cleared')

        # Add random delay between 30 seconds and 3 minutes to avoid rate limiting
        # Only delay if there are more items in the queue
        session = self.session_factory()
        try:
            has_more = session.query(Video).filter(
                Video.status == 'queued'
            ).count() > 0

            if has_more and download_success:
                # Random delay: 60 seconds to 5 minutes (60-300 seconds)
                delay_seconds = random.randint(60, 300)
                logger.info(f"Delaying {delay_seconds} seconds ({delay_seconds/60:.1f} min) before next download to avoid rate limiting...")
                # Removed print - using logger instead

                # Count down the delay and update status
                start_time = time.time()
                while time.time() - start_time < delay_seconds:
                    remaining = int(delay_seconds - (time.time() - start_time))

                    # Update delay info for status bar
                    if remaining >= 60:
                        self.delay_info = f"Delayed {remaining//60} min {remaining%60} sec to avoid rate limiting"
                    else:
                        self.delay_info = f"Delayed {remaining} sec to avoid rate limiting"

                    # Log every 10 seconds for debug visibility
                    if remaining % 10 == 0:
                        logger.debug(f"Delay countdown: {remaining} seconds remaining")

                    time.sleep(1)  # Update every second

                # Clear delay info
                self.delay_info = None
                logger.info("Delay complete, ready for next download")
                # Removed print - using logger instead
            else:
                logger.debug(f"No delay needed (has_more={has_more}, download_success={download_success})")
        finally:
            session.close()
