from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timezone, timedelta
import yt_dlp
import subprocess
import os
from models import Channel, Video, Setting
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from utils import parse_iso8601_duration
import logging

logger = logging.getLogger(__name__)

class AutoRefreshScheduler:
    def __init__(self, session_factory, set_operation_callback=None, clear_operation_callback=None):
        self.session_factory = session_factory
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
            logger.info("Auto-scan: Updating yt-dlp...")
            # Run pip upgrade using the current environment's pip
            result = subprocess.run(
                ['pip', 'install', '--upgrade', 'yt-dlp'],
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )

            if result.returncode == 0:
                logger.info("Auto-scan: yt-dlp updated successfully")
                logger.debug(f"yt-dlp update output: {result.stdout}")
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

            youtube = build('youtube', 'v3', developerKey=api_key_setting.value)

            channels = session.query(Channel).all()
            logger.info(f"Auto-scan: Scanning {len(channels)} channels")

            for i, channel in enumerate(channels, 1):
                logger.debug(f"Auto-scan: Processing channel {i}/{len(channels)}: {channel.title}")
                if self.set_operation:
                    self.set_operation('auto_refresh', f'Auto-scan: {channel.title} ({i}/{len(channels)})', channel_id=channel.id)
                self._scan_channel_with_api(session, youtube, channel)

            session.commit()
            logger.info("Auto-scan: Completed successfully")
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
                return

            uploads_playlist_id = channel_response['items'][0]['contentDetails']['relatedPlaylists']['uploads']

            # Get recent videos from uploads playlist
            playlist_response = youtube.playlistItems().list(
                part='snippet,contentDetails',
                playlistId=uploads_playlist_id,
                maxResults=50
            ).execute()

            video_ids = [item['contentDetails']['videoId'] for item in playlist_response.get('items', [])]

            if not video_ids:
                print(f"No videos found for channel: {channel.title}")
                return

            # Get detailed video info
            videos_response = youtube.videos().list(
                part='snippet,contentDetails',
                id=','.join(video_ids)
            ).execute()

            new_videos_count = 0
            ignored_count = 0
            latest_upload_date = None

            for video_data in videos_response.get('items', []):
                video_id = video_data['id']

                # Check if video already exists
                existing = session.query(Video).filter(Video.yt_id == video_id).first()
                if existing:
                    continue

                # Parse duration
                duration_str = video_data['contentDetails']['duration']
                duration_sec = parse_iso8601_duration(duration_str)
                duration_min = duration_sec / 60

                # Skip videos under 2 minutes (120 seconds)
                # This filters out YouTube Shorts and very short videos
                if duration_sec < 120:
                    print(f"Skipping video {video_id}: duration {duration_sec}s (<2 min)")
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

                if status == 'ignored':
                    ignored_count += 1
                else:
                    new_videos_count += 1

            # Update last scan time to the latest video upload date found
            # This ensures the next scan picks up from the last video, not the scan time
            if latest_upload_date:
                channel.last_scan_at = latest_upload_date.replace(tzinfo=timezone.utc)
                logger.debug(f"Auto-scan: Updated last_scan_at for '{channel.title}' to {latest_upload_date}")
            elif channel.last_scan_at is None:
                # If no videos were found and no previous scan, set to now
                channel.last_scan_at = datetime.now(timezone.utc)
                logger.debug(f"Auto-scan: Set initial last_scan_at for '{channel.title}' to now")

            logger.info(f"Auto-scan: Channel '{channel.title}' - {new_videos_count} new videos, {ignored_count} ignored")

        except HttpError as api_error:
            logger.error(f"Auto-scan: YouTube API error for channel '{channel.title}': {api_error}")
        except Exception as e:
            logger.error(f"Auto-scan: Error scanning channel '{channel.title}': {e}")
