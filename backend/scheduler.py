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
    def __init__(self, session_factory, download_worker=None, set_operation_callback=None, clear_operation_callback=None, queue_scan_callback=None):
        self.session_factory = session_factory
        self.download_worker = download_worker
        self.scheduler = BackgroundScheduler()
        self.enabled = False
        self.set_operation = set_operation_callback
        self.clear_operation = clear_operation_callback
        self.queue_scan = queue_scan_callback
    
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
        """Queue scans for all channels and update yt-dlp"""
        logger.info("Auto-scan: Starting scheduled auto-scan")

        # First, update yt-dlp
        if self.set_operation:
            self.set_operation('auto_refresh', 'Updating yt-dlp...')
        self.update_ytdlp()

        # Then queue all channels for scanning
        if self.set_operation:
            self.set_operation('auto_refresh', 'Queueing channel scans...')

        session = self.session_factory()
        try:
            channels = session.query(Channel).all()
            logger.info(f"Auto-scan: Queueing {len(channels)} channels for scanning")

            queued_count = 0
            for channel in channels:
                if self.queue_scan:
                    # Queue incremental scan (force_full=False for auto-scans)
                    added = self.queue_scan(channel.id, force_full=False)
                    if added:
                        queued_count += 1
                        logger.debug(f"Auto-scan: Queued scan for channel '{channel.title}'")

            logger.info(f"Auto-scan: Successfully queued {queued_count}/{len(channels)} channels")

            if self.set_operation:
                self.set_operation('auto_refresh', f'Auto-scan: Queued {queued_count} channels')
            if self.clear_operation:
                self.clear_operation()
        except Exception as e:
            logger.error(f"Auto-scan: Error queueing scans: {e}")
            if self.clear_operation:
                self.clear_operation()
        finally:
            session.close()
