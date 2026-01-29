from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timezone, timedelta
import subprocess
import sys
import os
import json
from database import Channel, Video, Setting, QueueItem, get_session
from sqlalchemy import func
import logging

logger = logging.getLogger(__name__)


class AutoRefreshScheduler:
    def __init__(self, session_factory, download_worker=None, settings_manager=None, set_operation_callback=None, clear_operation_callback=None, queue_scan_callback=None):
        self.session_factory = session_factory
        self.download_worker = download_worker
        self.settings_manager = settings_manager
        self.scheduler = BackgroundScheduler()
        self.enabled = False
        self.set_operation = set_operation_callback
        self.clear_operation = clear_operation_callback
        self.queue_scan = queue_scan_callback
    
    def _get_refresh_config(self):
        """Get auto-refresh configuration from database settings, migrating legacy format if needed"""
        config_json = self.settings_manager.get('auto_refresh_config')

        default_config = {
            'mode': 'times',
            'times': ['03:00']
        }

        if not config_json:
            # Migrate from legacy auto_refresh_time setting
            legacy_time = self.settings_manager.get('auto_refresh_time', '3:0')
            # Ensure proper HH:MM format
            try:
                parts = legacy_time.split(':')
                hour = int(parts[0])
                minute = int(parts[1]) if len(parts) > 1 else 0
                formatted_time = f"{hour:02d}:{minute:02d}"
            except (ValueError, IndexError):
                logger.warning(f"Invalid legacy time format '{legacy_time}', using default")
                formatted_time = '03:00'

            config = {
                'mode': 'times',
                'times': [formatted_time]
            }
            self.settings_manager.set('auto_refresh_config', json.dumps(config))
            logger.info(f"Migrated legacy auto_refresh_time '{legacy_time}' to new config format")
            return config

        try:
            return json.loads(config_json)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse auto_refresh_config JSON: {e}, using default config")
            return default_config

    def _remove_all_jobs(self):
        """Remove all auto-refresh jobs (both time-based and interval-based)"""
        # Get all jobs and remove any that start with 'auto_refresh'
        jobs = self.scheduler.get_jobs()
        for job in jobs:
            if job.id.startswith('auto_refresh'):
                self.scheduler.remove_job(job.id)
                logger.debug(f"Removed job: {job.id}")

    def _parse_time(self, time_str, default_hour=3, default_minute=0):
        """Parse a time string in HH:MM format, returning (hour, minute) tuple"""
        try:
            parts = time_str.split(':')
            hour = int(parts[0])
            minute = int(parts[1]) if len(parts) > 1 else 0
            # Validate ranges
            if not (0 <= hour <= 23 and 0 <= minute <= 59):
                raise ValueError("Hour or minute out of range")
            return hour, minute
        except (ValueError, IndexError, AttributeError) as e:
            logger.warning(f"Invalid time format '{time_str}': {e}, using default {default_hour:02d}:{default_minute:02d}")
            return default_hour, default_minute

    def _schedule_jobs(self):
        """Schedule jobs based on current configuration (specific times or interval mode)"""
        config = self._get_refresh_config()

        if config['mode'] == 'times':
            # Schedule cron jobs for specific times
            scheduled_times = []
            for idx, time_str in enumerate(config.get('times', ['03:00'])):
                hour, minute = self._parse_time(time_str)
                self.scheduler.add_job(
                    self.scan_all_channels,
                    'cron',
                    hour=hour,
                    minute=minute,
                    id=f'auto_refresh_{idx}',
                    misfire_grace_time=60  # Run if missed by up to 60 seconds
                )
                scheduled_times.append(f"{hour:02d}:{minute:02d}")
            logger.info(f"Auto-refresh scheduled at: {', '.join(scheduled_times)}")

        elif config['mode'] == 'interval':
            # Schedule interval job with custom start time
            interval_hours = config.get('interval_hours', 6)
            start_time = config.get('interval_start', '00:00')
            hour, minute = self._parse_time(start_time, default_hour=0, default_minute=0)

            # Calculate next run time based on start time
            now = datetime.now()
            start_datetime = now.replace(hour=hour, minute=minute, second=0, microsecond=0)

            # If start time already passed today, schedule for next occurrence based on interval
            if start_datetime <= now:
                start_datetime += timedelta(hours=interval_hours)

            self.scheduler.add_job(
                self.scan_all_channels,
                'interval',
                hours=interval_hours,
                next_run_time=start_datetime,
                id='auto_refresh_interval',
                misfire_grace_time=60  # Run if missed by up to 60 seconds
            )
            logger.info(f"Auto-refresh scheduled every {interval_hours} hours starting at {start_datetime.strftime('%Y-%m-%d %H:%M')}")

    def start(self):
        """Start the scheduler and set up auto-refresh jobs if enabled"""
        if self.settings_manager.get_bool('auto_refresh_enabled'):
            self.enabled = True
            self._schedule_jobs()

        self.scheduler.start()
    
    def stop(self):
        self.scheduler.shutdown()
    
    def enable(self):
        """Enable auto-refresh and schedule jobs based on current configuration"""
        if not self.enabled:
            self.enabled = True
            self._remove_all_jobs()  # Clean slate
            self._schedule_jobs()
            logger.info("Auto-refresh enabled")
    
    def disable(self):
        """Disable auto-refresh and remove all jobs"""
        self.enabled = False
        self._remove_all_jobs()
        logger.info("Auto-refresh disabled")

    def reschedule(self):
        """Reschedule jobs with updated configuration from database"""
        if self.enabled:
            self._remove_all_jobs()
            self._schedule_jobs()
            logger.info("Auto-refresh jobs rescheduled")

    def update_dependencies(self):
        """Update yt-dlp to latest version"""
        try:
            # Get current yt-dlp version (use python -m for Windows compatibility)
            try:
                version_result = subprocess.run(
                    [sys.executable, '-m', 'yt_dlp', '--version'],
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
            # Use python -m pip for Windows compatibility
            result = subprocess.run(
                [sys.executable, '-m', 'pip', 'install', '--user', '--upgrade', 'yt-dlp[default]'],
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )

            if result.returncode == 0:
                # Check if it was already up-to-date or actually updated
                if "already satisfied" in result.stdout.lower() or "requirement already satisfied" in result.stdout.lower():
                    logger.info(f"Auto-scan: Dependencies already up-to-date (yt-dlp {current_version})")
                else:
                    # Get new version
                    try:
                        new_version_result = subprocess.run(
                            [sys.executable, '-m', 'yt_dlp', '--version'],
                            capture_output=True,
                            text=True,
                            timeout=10
                        )
                        new_version = new_version_result.stdout.strip() if new_version_result.returncode == 0 else "unknown"
                        logger.info(f"Auto-scan: Dependencies updated (yt-dlp {current_version} → {new_version})")
                    except Exception:
                        logger.info("Auto-scan: Dependencies updated successfully")
            else:
                logger.warning(f"Auto-scan: Dependency update failed: {result.stderr}")
        except Exception as e:
            logger.error(f"Auto-scan: Error updating yt-dlp: {e}")

    def cleanup_orphaned_videos(self):
        """Remove or mark as ignored videos whose files no longer exist on disk"""
        logger.info("Auto-scan: Checking for orphaned videos...")

        with get_session(self.session_factory) as session:
            # Get all videos marked as 'library' status
            library_videos = session.query(Video).filter(Video.status == 'library').all()

            if not library_videos:
                logger.debug("Auto-scan: No library videos to check")
                return

            logger.debug(f"Auto-scan: Checking {len(library_videos)} library videos for missing files")

            orphaned_count = 0
            deleted_count = 0
            ignored_count = 0

            for video in library_videos:
                # Skip videos without file_path
                if not video.file_path:
                    continue

                # Check if file exists on disk
                if not os.path.exists(video.file_path):
                    orphaned_count += 1

                    # Check if this is a singles video
                    is_single = (
                        video.channel_id is None or
                        video.channel is None or
                        video.channel.yt_id == '__singles__'
                    )

                    if is_single:
                        # Delete singles videos completely
                        logger.info(f"Auto-scan: Deleting orphaned single video: {video.title} (ID: {video.id})")
                        session.delete(video)
                        deleted_count += 1
                    else:
                        # Mark channel videos as ignored
                        logger.info(f"Auto-scan: Marking orphaned channel video as ignored: {video.title} (Channel: {video.channel.title})")
                        video.status = 'ignored'
                        ignored_count += 1

            session.commit()

            if orphaned_count > 0:
                logger.info(f"Auto-scan: Cleaned up {orphaned_count} orphaned videos ({deleted_count} deleted, {ignored_count} marked ignored)")
            else:
                logger.debug("Auto-scan: No orphaned videos found")

    def scan_all_channels(self):
        """Queue scans for all channels and update yt-dlp"""
        logger.info("Auto-scan: Starting scheduled auto-scan")

        # First, update yt-dlp to latest version
        if self.set_operation:
            self.set_operation('auto_refresh', 'Updating dependencies...')
        self.update_dependencies()

        # Clean up orphaned videos (files that no longer exist)
        if self.set_operation:
            self.set_operation('auto_refresh', 'Cleaning up orphaned videos...')
        self.cleanup_orphaned_videos()

        # Then queue all channels for scanning
        if self.set_operation:
            self.set_operation('auto_refresh', 'Queueing channel scans...')

        with get_session(self.session_factory) as session:
            # Exclude Singles pseudo-channel and deleted channels from auto-scan
            channels = session.query(Channel).filter(
                Channel.yt_id != '__singles__',
                Channel.deleted_at.is_(None)
            ).all()

            if not channels:
                logger.debug("Auto-scan: No channels to scan")
                return

            logger.debug(f"Auto-scan: Queueing {len(channels)} channels for scanning")

            queued_count = 0
            for i, channel in enumerate(channels):
                if self.queue_scan:
                    # Queue incremental scan (force_full=False for auto-scans)
                    # Mark first channel as batch start and all as auto-scan
                    result = self.queue_scan(
                        channel.id,
                        force_full=False,
                        is_batch_start=(i == 0),
                        is_auto_scan=True,
                        batch_label='Auto-Scan'
                    )

                    if result == True:
                        queued_count += 1
                        logger.debug(f"Auto-scan: Queued scan for channel '{channel.title}'")
                    elif result == 'pending' and i == 0:
                        # First channel returned 'pending' - auto-scan will run later
                        logger.debug("Auto-scan: Queued to run after current batch completes")
                        break  # Stop trying to queue more channels

            if queued_count > 0:
                logger.debug(f"Auto-scan: Successfully queued {queued_count}/{len(channels)} channels")
                if self.set_operation:
                    self.set_operation('auto_refresh', f'Auto-scan: Queued {queued_count} channels')

            if self.clear_operation:
                self.clear_operation()
