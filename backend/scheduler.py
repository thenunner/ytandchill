from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timezone, timedelta
import yt_dlp
import subprocess
import os
from models import Channel, Video, Setting, QueueItem
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from utils import parse_iso8601_duration
from sqlalchemy import func
import logging

logger = logging.getLogger(__name__)

def format_scan_status_date(datetime_obj=None, yyyymmdd_string=None):
    """Format date for scan status message. Returns 'None' if no date."""
    if datetime_obj:
        return datetime_obj.strftime('%m/%d')
    elif yyyymmdd_string:
        # Parse YYYYMMDD format
        year = yyyymmdd_string[0:4]
        month = yyyymmdd_string[4:6]
        day = yyyymmdd_string[6:8]
        return f"{month}/{day}"
    return "None"

class AutoRefreshScheduler:
    def __init__(self, session_factory, download_worker=None, set_operation_callback=None, clear_operation_callback=None):
        self.session_factory = session_factory
        self.download_worker = download_worker
        self.scheduler = BackgroundScheduler()
        self.enabled = False
        self.set_operation = set_operation_callback
        self.clear_operation = clear_operation_callback
    
    def _get_refresh_time(self):
        """Get auto-refresh time from database settings"""
        session = self.session_factory()
        try:
            time_setting = session.query(Setting).filter(Setting.key == 'auto_refresh_time').first()
            if time_setting and time_setting.value:
                hour, minute = time_setting.value.split(':')
                return int(hour), int(minute)
        finally:
            session.close()
        return 3, 0  # Default fallback to 3:00 AM

    def start(self):
        # Check if auto-refresh is enabled
        session = self.session_factory()
        setting = session.query(Setting).filter(Setting.key == 'auto_refresh_enabled').first()
        if setting and setting.value == 'true':
            self.enabled = True
            # Get user-configured time from database
            hour, minute = self._get_refresh_time()
            self.scheduler.add_job(
                self.scan_all_channels,
                'cron',
                hour=hour,
                minute=minute,
                id='auto_refresh'
            )
            logger.info(f"Auto-refresh scheduled for {hour:02d}:{minute:02d}")
        session.close()

        self.scheduler.start()
    
    def stop(self):
        self.scheduler.shutdown()
    
    def enable(self):
        if not self.enabled:
            self.enabled = True
            if not self.scheduler.get_job('auto_refresh'):
                # Get user-configured time from database
                hour, minute = self._get_refresh_time()
                self.scheduler.add_job(
                    self.scan_all_channels,
                    'cron',
                    hour=hour,
                    minute=minute,
                    id='auto_refresh'
                )
                logger.info(f"Auto-refresh enabled and scheduled for {hour:02d}:{minute:02d}")
    
    def disable(self):
        self.enabled = False
        if self.scheduler.get_job('auto_refresh'):
            self.scheduler.remove_job('auto_refresh')

    def reschedule(self):
        """Reschedule the auto-refresh job with updated time from database"""
        if self.enabled and self.scheduler.get_job('auto_refresh'):
            # Remove existing job
            self.scheduler.remove_job('auto_refresh')
            # Get updated time from database
            hour, minute = self._get_refresh_time()
            # Add job with new time
            self.scheduler.add_job(
                self.scan_all_channels,
                'cron',
                hour=hour,
                minute=minute,
                id='auto_refresh'
            )
            logger.info(f"Auto-refresh rescheduled to {hour:02d}:{minute:02d}")

    def update_ytdlp(self):
        """Update yt-dlp to the latest version"""
        try:
            # Get current yt-dlp version
            try:
                version_result = subprocess.run(
                    ['yt-dlp', '--version'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                current_version = version_result.stdout.strip() if version_result.returncode == 0 else "unknown"
            except Exception:
                current_version = "unknown"

            logger.info(f"Auto-scan: Updating yt-dlp (current version: {current_version})...")

            # Check if Deno is available
            try:
                deno_result = subprocess.run(
                    ['deno', '--version'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if deno_result.returncode == 0:
                    deno_version = deno_result.stdout.split('\n')[0].strip()
                    logger.info(f"Auto-scan: Deno available - {deno_version}")
                else:
                    logger.warning("Auto-scan: Deno not found - YouTube downloads may fail")
            except Exception:
                logger.warning("Auto-scan: Deno not found - YouTube downloads may fail")

            # Run pip upgrade using --user flag for non-root permissions
            # Use [default] extras to include yt-dlp-ejs for JavaScript runtime support
            result = subprocess.run(
                ['pip', 'install', '--user', '--upgrade', 'yt-dlp[default]'],
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )

            if result.returncode == 0:
                # Check if it was already up-to-date or actually updated
                if "already satisfied" in result.stdout.lower() or "requirement already satisfied" in result.stdout.lower():
                    logger.info(f"Auto-scan: yt-dlp already up-to-date (version {current_version})")
                else:
                    # Get new version
                    try:
                        new_version_result = subprocess.run(
                            ['yt-dlp', '--version'],
                            capture_output=True,
                            text=True,
                            timeout=10
                        )
                        new_version = new_version_result.stdout.strip() if new_version_result.returncode == 0 else "unknown"
                        logger.info(f"Auto-scan: yt-dlp updated successfully ({current_version} → {new_version})")
                    except Exception:
                        logger.info("Auto-scan: yt-dlp updated successfully")
            else:
                logger.warning(f"Auto-scan: yt-dlp update failed: {result.stderr}")
        except Exception as e:
            logger.error(f"Auto-scan: Error updating yt-dlp: {e}")

    def scan_all_channels(self):
        """Scan all channels and update yt-dlp"""
        logger.info("Auto-scan: Starting scheduled auto-scan")

        # First, update yt-dlp
        if self.set_operation:
            self.set_operation('auto_refresh', 'Updating yt-dlp...')
        self.update_ytdlp()

        # Then scan all channels
        session = self.session_factory()
        try:
            # Get YouTube API key
            api_key_setting = session.query(Setting).filter(Setting.key == 'youtube_api_key').first()
            if not api_key_setting or not api_key_setting.value:
                logger.warning("Auto-scan: YouTube API key not configured, skipping auto-refresh")
                if self.clear_operation:
                    self.clear_operation()
                return

            youtube = build('youtube', 'v3', developerKey=api_key_setting.value, cache_discovery=False)

            channels = session.query(Channel).all()
            logger.info(f"Auto-scan: Scanning {len(channels)} channels")

            total_new_videos = 0
            total_ignored = 0
            total_auto_queued = 0

            for i, channel in enumerate(channels, 1):
                logger.debug(f"Auto-scan: Processing channel {i}/{len(channels)}: {channel.title}")

                # Get last video date for status message
                last_video_date = None
                if channel.videos:
                    videos_with_dates = [v for v in channel.videos if v.upload_date]
                    if videos_with_dates:
                        most_recent = max(videos_with_dates, key=lambda v: v.upload_date)
                        last_video_date = most_recent.upload_date

                # Format status message
                if self.set_operation:
                    last_scan_str = format_scan_status_date(datetime_obj=channel.last_scan_time)
                    last_video_str = format_scan_status_date(yyyymmdd_string=last_video_date)
                    status_msg = f"Scanning {channel.title}. Last scan: {last_scan_str} * Last Video: {last_video_str} ({i}/{len(channels)})"
                    self.set_operation('auto_refresh', status_msg, channel_id=channel.id)

                new_count, ignored_count, auto_queued_count = self._scan_channel_with_api(session, youtube, channel)
                total_new_videos += new_count
                total_ignored += ignored_count
                total_auto_queued += auto_queued_count

            session.commit()

            # Auto-resume the download worker if videos were auto-queued
            if total_auto_queued > 0 and self.download_worker and self.download_worker.paused:
                self.download_worker.resume()
                logger.info(f"Auto-scan: Auto-resumed download worker after auto-queueing {total_auto_queued} video(s) from daily scan")

            # Log and display final summary
            if total_new_videos == 0 and total_ignored == 0 and total_auto_queued == 0:
                logger.info(f"Auto-scan complete: No new videos found.")
            else:
                logger.info(f"Auto-scan complete: {total_new_videos} to review, {total_ignored} ignored, {total_auto_queued} auto-queued")
            if self.set_operation:
                self.set_operation('auto_refresh', f'Auto-scan complete: {total_new_videos} new videos added')
            if self.clear_operation:
                self.clear_operation()
        except Exception as e:
            session.rollback()
            logger.error(f"Auto-scan: Error during auto-scan: {e}")
            if self.clear_operation:
                self.clear_operation()
        finally:
            session.close()
    
    def _scan_channel_with_api(self, session, youtube, channel):
        """Scan a single channel using YouTube Data API"""
        try:
            # Get channel info to find uploads playlist
            channel_response = youtube.channels().list(
                part='contentDetails',
                id=channel.yt_id
            ).execute()

            if not channel_response.get('items'):
                print(f"Channel not found: {channel.title}")
                return 0, 0

            uploads_playlist_id = channel_response['items'][0]['contentDetails']['relatedPlaylists']['uploads']

            # Get recent videos from uploads playlist
            playlist_response = youtube.playlistItems().list(
                part='snippet,contentDetails',
                playlistId=uploads_playlist_id,
                maxResults=50
            ).execute()

            video_ids = [item['contentDetails']['videoId'] for item in playlist_response.get('items', [])]

            if not video_ids:
                logger.debug(f"Auto-scan: No videos found for channel: {channel.title}")
                return 0, 0

            # Get detailed video info including status to diagnose issues
            videos_response = youtube.videos().list(
                part='snippet,contentDetails,status',
                id=','.join(video_ids)
            ).execute()

            # Check if any videos are completely missing from the response (deleted/unavailable)
            returned_video_ids = {item['id'] for item in videos_response.get('items', [])}
            missing_video_ids = set(video_ids) - returned_video_ids
            if missing_video_ids:
                logger.warning(f"Auto-scan: {len(missing_video_ids)} video(s) not returned by API for channel '{channel.title}' (likely deleted): {', '.join(list(missing_video_ids)[:5])}")

            new_videos_count = 0
            ignored_count = 0
            auto_queued_count = 0
            latest_upload_date = None

            for video_data in videos_response.get('items', []):
                video_id = video_data['id']

                try:
                    # Check if video already exists
                    existing = session.query(Video).filter(Video.yt_id == video_id).first()
                    if existing:
                        continue

                    # Check if contentDetails exists (missing for restricted/private/deleted videos)
                    if 'contentDetails' not in video_data:
                        video_title = video_data.get('snippet', {}).get('title', 'Unknown')

                        # Get exact reason from status field
                        status_info = video_data.get('status', {})
                        privacy_status = status_info.get('privacyStatus', 'unknown')
                        upload_status = status_info.get('uploadStatus', 'unknown')

                        reason = f"privacyStatus={privacy_status}, uploadStatus={upload_status}"
                        logger.warning(f"Auto-scan: Skipping video '{video_title}' ({video_id}) - no contentDetails ({reason})")
                        continue

                    # Check if duration field exists in contentDetails
                    if 'duration' not in video_data['contentDetails']:
                        video_title = video_data.get('snippet', {}).get('title', 'Unknown')
                        live_broadcast = video_data.get('snippet', {}).get('liveBroadcastContent', 'none')

                        # Handle upcoming premieres - these don't have duration until they air
                        if live_broadcast == 'upcoming':
                            scheduled_time = video_data.get('liveStreamingDetails', {}).get('scheduledStartTime', 'unknown')
                            logger.info(f"Auto-scan: Skipping upcoming premiere '{video_title}' ({video_id}) - scheduled for {scheduled_time}")
                            continue

                        # For other cases, log detailed diagnostic info
                        status_info = video_data.get('status', {})
                        privacy_status = status_info.get('privacyStatus', 'unknown')
                        upload_status = status_info.get('uploadStatus', 'unknown')
                        content_details_keys = list(video_data['contentDetails'].keys())

                        logger.warning(f"Auto-scan: Skipping video '{video_title}' ({video_id}) - no duration field (privacyStatus={privacy_status}, uploadStatus={upload_status}, liveBroadcastContent={live_broadcast}, contentDetails has: {content_details_keys})")
                        continue

                    # Parse duration
                    duration_str = video_data['contentDetails']['duration']
                    duration_sec = parse_iso8601_duration(duration_str)
                    duration_min = duration_sec / 60

                    # Skip videos under 2 minutes (120 seconds)
                    # This filters out YouTube Shorts and very short videos
                    if duration_sec < 120:
                        logger.debug(f"Auto-scan: Skipping video {video_id}: duration {duration_sec}s (<2 min)")
                        continue

                    # Parse upload date
                    upload_date = video_data['snippet']['publishedAt'][:10].replace('-', '')
                    # Track the latest upload date found
                    if upload_date:
                        upload_dt = datetime.strptime(upload_date, '%Y%m%d')
                        if latest_upload_date is None or upload_dt > latest_upload_date:
                            latest_upload_date = upload_dt

                    # Check duration filters and set status
                    status = 'discovered'
                    if channel.min_minutes > 0 and duration_min < channel.min_minutes:
                        status = 'ignored'
                    elif channel.max_minutes > 0 and duration_min > channel.max_minutes:
                        status = 'ignored'

                    # Create video record
                    video = Video(
                        yt_id=video_id,
                        channel_id=channel.id,
                        title=video_data['snippet']['title'],
                        duration_sec=duration_sec,
                        upload_date=upload_date,
                        thumb_url=video_data['snippet']['thumbnails'].get('high', {}).get('url'),
                        status=status
                    )
                    session.add(video)
                    session.flush()  # Get video.id for queue item

                    # Auto-queue if channel has auto_download enabled and video passed filters
                    if status == 'discovered' and channel.auto_download:
                        video.status = 'queued'
                        max_pos = session.query(func.max(QueueItem.queue_position)).scalar() or 0
                        queue_item = QueueItem(video_id=video.id, queue_position=max_pos + 1)
                        session.add(queue_item)
                        auto_queued_count += 1
                        logger.info(f"Auto-scan: Auto-queued '{video.title}' for channel '{channel.title}'")

                    if status == 'ignored':
                        ignored_count += 1
                    else:
                        new_videos_count += 1

                except KeyError as e:
                    video_title = video_data.get('snippet', {}).get('title', 'Unknown')
                    status_info = video_data.get('status', {})
                    privacy_status = status_info.get('privacyStatus', 'unknown')
                    upload_status = status_info.get('uploadStatus', 'unknown')
                    logger.error(f"Auto-scan: Missing field {e} for video '{video_title}' ({video_id}) - privacyStatus={privacy_status}, uploadStatus={upload_status}")
                    continue
                except Exception as e:
                    video_title = video_data.get('snippet', {}).get('title', 'Unknown')
                    status_info = video_data.get('status', {})
                    privacy_status = status_info.get('privacyStatus', 'unknown')
                    upload_status = status_info.get('uploadStatus', 'unknown')
                    logger.error(f"Auto-scan: Error processing video '{video_title}' ({video_id}): {e} - privacyStatus={privacy_status}, uploadStatus={upload_status}")
                    continue

            # Update last scan time to the latest video upload date found
            # This ensures the next scan picks up from the last video, not the scan time
            if latest_upload_date:
                channel.last_scan_at = latest_upload_date.replace(tzinfo=timezone.utc)
                logger.debug(f"Auto-scan: Updated last_scan_at for '{channel.title}' to {latest_upload_date}")
            elif channel.last_scan_at is None:
                # If no videos were found and no previous scan, set to now
                channel.last_scan_at = datetime.now(timezone.utc)
                logger.debug(f"Auto-scan: Set initial last_scan_at for '{channel.title}' to now")

            # Update last_scan_time to when the scan actually executed
            channel.last_scan_time = datetime.now(timezone.utc)
            logger.debug(f"Auto-scan: Updated last_scan_time for '{channel.title}' to now")

            if new_videos_count == 0 and ignored_count == 0 and auto_queued_count == 0:
                logger.info(f"Auto-scan: Channel '{channel.title}' - No new videos found.")
            else:
                logger.info(f"Auto-scan: Channel '{channel.title}' - {new_videos_count} new, {ignored_count} ignored, {auto_queued_count} auto-queued")
            return new_videos_count, ignored_count, auto_queued_count

        except HttpError as api_error:
            logger.error(f"Auto-scan: YouTube API error for channel '{channel.title}': {api_error}")
            return 0, 0, 0
        except Exception as e:
            logger.error(f"Auto-scan: Error scanning channel '{channel.title}': {e}")
            return 0, 0, 0
