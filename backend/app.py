from flask import Flask, request, jsonify, send_from_directory, send_file, Response, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import secrets
from datetime import datetime, timezone, timedelta
import os
import yt_dlp
import subprocess
from models import init_db, Channel, Video, Playlist, PlaylistVideo, QueueItem, Setting, Category, get_session
from download_worker import DownloadWorker
from scheduler import AutoRefreshScheduler
from googleapiclient.errors import HttpError
from youtube_client import YouTubeAPIClient
import logging_config
import logging
import atexit
from sqlalchemy.orm import joinedload
from sqlalchemy import func
from utils import parse_iso8601_duration
from werkzeug.security import check_password_hash, generate_password_hash, safe_join
from functools import wraps
import threading
from queue import Queue

# Get logger for this module
logger = logging.getLogger(__name__)

# FORCE DISABLE DEBUG MODE - No matter what environment variables say
os.environ['FLASK_ENV'] = 'production'
os.environ['FLASK_DEBUG'] = '0'

# Lock file to prevent multiple instances - uses ATOMIC file locking
LOCK_FILE = 'app.lock'
lock_file_handle = None

def check_single_instance():
    """Ensure only one instance of the backend is running using atomic file locking"""
    global lock_file_handle

    try:
        # Try to open the lock file in exclusive mode (fails if already open by another process)
        import msvcrt  # Windows-specific file locking

        # Open file in write mode (create if doesn't exist)
        lock_file_handle = open(LOCK_FILE, 'w')

        # Try to acquire exclusive lock (non-blocking)
        # This is ATOMIC - only one process can succeed
        try:
            msvcrt.locking(lock_file_handle.fileno(), msvcrt.LK_NBLCK, 1)
        except IOError:
            # Lock failed - another instance is running
            lock_file_handle.close()
            print("=" * 60)
            print("ERROR: Another instance is already running!")
            print("=" * 60)
            print("")
            print("To fix this:")
            print("  1. Close any other backend windows")
            print("  2. If no other windows exist, delete: backend/app.lock")
            print("")
            input("Press Enter to exit...")
            exit(1)

        # Write PID to lock file
        lock_file_handle.write(str(os.getpid()))
        lock_file_handle.flush()

        # Register cleanup to remove lock file on exit
        def cleanup():
            global lock_file_handle
            if lock_file_handle:
                try:
                    lock_file_handle.close()
                except:
                    pass
            if os.path.exists(LOCK_FILE):
                try:
                    os.remove(LOCK_FILE)
                except:
                    pass
        atexit.register(cleanup)

    except ImportError:
        # Fallback for non-Windows systems (use fcntl on Linux/Mac)
        import fcntl
        lock_file_handle = open(LOCK_FILE, 'w')
        try:
            fcntl.flock(lock_file_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except IOError:
            lock_file_handle.close()
            print("=" * 60)
            print("ERROR: Another instance is already running!")
            print("=" * 60)
            exit(1)

        lock_file_handle.write(str(os.getpid()))
        lock_file_handle.flush()

        def cleanup():
            global lock_file_handle
            if lock_file_handle:
                lock_file_handle.close()
            if os.path.exists(LOCK_FILE):
                os.remove(LOCK_FILE)
        atexit.register(cleanup)

# Check for single instance before starting
check_single_instance()

# YouTube Data API Helper Functions
def get_youtube_api_key(session=None):
    """Get YouTube API key from settings"""
    return settings_manager.get('youtube_api_key')

def get_youtube_client():
    """Get YouTube API client instance"""
    api_key = get_youtube_api_key()
    if not api_key:
        raise ValueError('YouTube API key not configured. Please add it in Settings.')
    return YouTubeAPIClient(api_key)

# Initialize database BEFORE Flask app so we can load secret key from DB
engine, Session = init_db()
session_factory = Session

# Initialize settings manager with caching
from utils import SettingsManager
settings_manager = SettingsManager(session_factory, cache_ttl=5)

def get_or_create_secret_key():
    """Get or create persistent secret key from database"""
    secret_key = settings_manager.get('secret_key')

    if secret_key:
        # Use existing secret key
        return secret_key
    else:
        # Generate new secret key and save to database
        new_secret_key = secrets.token_hex(32)
        settings_manager.set('secret_key', new_secret_key)
        return new_secret_key

# Determine static folder path - different for Docker vs local dev
# In Docker: /app/dist, In local dev: ../frontend/dist
static_folder = 'dist' if os.path.exists('dist') else '../frontend/dist'
app = Flask(__name__, static_folder=static_folder)

# Session configuration
app.config['SECRET_KEY'] = get_or_create_secret_key()
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 7776000  # 90 days (default without "Remember Me")

# CORS configuration - using after_request to allow credentials from any origin
@app.after_request
def add_cors_headers(response):
    # Get the origin from the request
    origin = request.headers.get('Origin')

    if origin:
        # Set CORS headers to allow the requesting origin
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'

    # Log the request
    logger.api(f'{request.method} {request.path} - {response.status_code}')

    return response

# FORCE DEBUG MODE OFF - Multiple layers of protection
app.debug = False
app.config['DEBUG'] = False
app.config['TESTING'] = False
app.config['ENV'] = 'production'

# Disable werkzeug's default request logging - we'll handle it ourselves
logging.getLogger('werkzeug').setLevel(logging.ERROR)  # Only log errors from werkzeug

# Initialize rate limiter
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per minute"],  # General rate limit for all endpoints
    storage_uri="memory://"
)

# Authentication helper functions
def get_stored_credentials():
    """Get stored username and password hash from database"""
    username = settings_manager.get('auth_username', 'admin')
    password_hash = settings_manager.get('auth_password_hash', generate_password_hash('admin'))
    return username, password_hash

def check_auth_credentials(username, password):
    """Validate username and password against stored credentials"""
    stored_username, stored_password_hash = get_stored_credentials()
    return username == stored_username and check_password_hash(stored_password_hash, password)

def is_authenticated():
    """Check if user is logged in via session"""
    return session.get('authenticated', False)

# Handle OPTIONS preflight requests for CORS
@app.before_request
def handle_options():
    """Handle CORS preflight OPTIONS requests"""
    if request.method == 'OPTIONS':
        response = app.make_default_options_response()
        return response

# Authentication check before each request
@app.before_request
def require_authentication():
    """Require session-based authentication for all requests except auth/setup endpoints"""
    # Allow auth endpoints without authentication
    if request.path.startswith('/api/auth/'):
        return None

    # Allow static files without auth (CSS, JS, etc.)
    if request.path.startswith('/assets/'):
        return None

    # Allow root path for React app
    if request.path == '/' or not request.path.startswith('/api/'):
        return None

    # Check if user is authenticated
    if not is_authenticated():
        return jsonify({'error': 'Authentication required'}), 401

# Initialize download worker
download_worker = DownloadWorker(session_factory, download_dir='downloads', settings_manager=settings_manager)
download_worker.start()

# Initialize scan queue and worker
scan_queue = Queue()
scan_worker_running = True
scan_worker_thread = None
scan_total_channels = 0
scan_current_channel = 0
scan_last_queue_time = 0  # Timestamp of last queue operation
scan_batch_in_progress = False  # Global batch lock
scan_batch_lock = threading.Lock()  # Thread-safe lock
scan_pending_auto_scan = False  # Auto-scan queued flag
scan_batch_stats = {'new': 0, 'ignored': 0, 'auto_queued': 0, 'channels': 0}  # Track batch results
scan_batch_label = ''  # Label for the batch (e.g., "Scan New", "Auto-Scan", "Channel: xyz")

def acquire_scan_batch_lock(is_auto_scan=False, batch_label=''):
    """
    Try to acquire batch scan lock.

    Args:
        is_auto_scan: If True, this is an auto-scan request
        batch_label: Label for the batch (e.g., "Scan New", "Channel: xyz")

    Returns:
        True if acquired, 'pending' if auto-scan queued, False if rejected
    """
    global scan_batch_in_progress, scan_pending_auto_scan, scan_batch_stats, scan_batch_label
    with scan_batch_lock:
        if scan_batch_in_progress:
            # Batch already running
            if is_auto_scan:
                # Auto-scan should queue itself for later
                scan_pending_auto_scan = True
                logger.debug("Auto-scan queued - will run after current batch completes")
                return 'pending'
            else:
                # Manual scan should be rejected
                logger.debug("Manual scan rejected - batch already in progress")
                return False

        # Acquire the lock and reset batch stats
        scan_batch_in_progress = True
        scan_batch_stats = {'new': 0, 'ignored': 0, 'auto_queued': 0, 'channels': 0}
        scan_batch_label = batch_label
        logger.debug(f"Scan batch lock ACQUIRED: {batch_label}")
        return True

def release_scan_batch_lock():
    """Release the batch scan lock and check for pending auto-scan."""
    global scan_batch_in_progress, scan_pending_auto_scan, scan_batch_stats, scan_batch_label
    with scan_batch_lock:
        if scan_batch_in_progress:
            scan_batch_in_progress = False

            # Set completion message and log if any channels were scanned
            if scan_batch_stats['channels'] > 0:
                new = scan_batch_stats['new']
                ignored = scan_batch_stats['ignored']
                auto_queued = scan_batch_stats['auto_queued']

                # Format the batch completion message
                if new == 0 and ignored == 0 and auto_queued == 0:
                    completion_msg = f"{scan_batch_label} completed. No new videos found"
                else:
                    completion_msg = f"{scan_batch_label} completed. {new} new, {ignored} ignored, {auto_queued} auto-queued"

                # Log completion
                logger.info(completion_msg)

                # Set status bar message (same format)
                set_operation('scan_complete', completion_msg)

                # Auto-clear scan completion message after 10 seconds
                threading.Timer(10.0, clear_operation).start()

            logger.debug("Scan batch lock RELEASED")

            # Check if auto-scan is pending
            if scan_pending_auto_scan:
                scan_pending_auto_scan = False
                logger.debug("Triggering pending auto-scan")
                return True  # Signal that auto-scan should run
        return False

def _scan_worker():
    """Background worker thread that processes scan queue"""
    global scan_worker_running, scan_current_channel, scan_total_channels, scan_batch_label
    logger.debug("Scan worker thread started")

    while scan_worker_running:
        try:
            # Get next scan job from queue (blocking with timeout)
            try:
                scan_job = scan_queue.get(timeout=1.0)
            except:
                # Timeout - no job available, continue loop
                # Reset counters if queue is empty
                if scan_queue.empty():
                    scan_total_channels = 0
                    scan_current_channel = 0
                    should_trigger_auto_scan = release_scan_batch_lock()  # Release lock and check for pending auto-scan
                    if should_trigger_auto_scan:
                        # Auto-scan was pending, trigger it now
                        logger.debug("Scan worker: Triggering pending auto-scan")
                        scheduler.scan_all_channels()
                continue

            channel_id = scan_job['channel_id']
            force_full = scan_job.get('force_full', False)

            # Increment current channel counter
            scan_current_channel += 1

            # Log batch start on first channel
            if scan_current_channel == 1:
                channel_word = 'channel' if scan_total_channels == 1 else 'channels'
                logger.info(f"Starting {scan_batch_label} for {scan_total_channels} {channel_word}")

            logger.debug(f"Scan worker: Processing scan for channel ID {channel_id} ({scan_current_channel}/{scan_total_channels})")

            # Process the scan in a new session
            try:
                with get_session(session_factory) as session:
                    channel = session.query(Channel).filter(Channel.id == channel_id).first()
                    if not channel:
                        logger.warning(f"Scan worker: Channel {channel_id} not found")
                        scan_queue.task_done()
                        continue

                    # Execute the scan logic with progress info
                    result = _execute_channel_scan(session, channel, force_full, scan_current_channel, scan_total_channels)

                    # Accumulate batch statistics
                    global scan_batch_stats
                    scan_batch_stats['new'] += result.get('new_videos', 0)
                    scan_batch_stats['ignored'] += result.get('ignored_videos', 0)
                    scan_batch_stats['auto_queued'] += result.get('auto_queued', 0)
                    scan_batch_stats['channels'] += 1

                    logger.debug(f"Scan worker: Completed scan for channel '{channel.title}'")

            except Exception as e:
                logger.error(f"Scan worker: Error scanning channel {channel_id}: {e}", exc_info=True)
            finally:
                scan_queue.task_done()

        except Exception as e:
            logger.error(f"Scan worker: Unexpected error in worker loop: {e}", exc_info=True)

    logger.debug("Scan worker thread stopped")

def start_scan_worker():
    """Start the scan worker thread"""
    global scan_worker_thread
    scan_worker_thread = threading.Thread(target=_scan_worker, daemon=True)
    scan_worker_thread.start()
    logger.debug("Scan worker initialized")

def stop_scan_worker():
    """Stop the scan worker thread"""
    global scan_worker_running
    scan_worker_running = False
    if scan_worker_thread:
        scan_worker_thread.join(timeout=5)
    logger.debug("Scan worker stopped")

# Register cleanup
atexit.register(stop_scan_worker)

# Start scan worker
start_scan_worker()

# Startup recovery: Reset any stuck 'downloading' videos to 'queued' and compact queue positions
def startup_recovery():
    with get_session(session_factory) as session:
        # Reset stuck downloading videos
        stuck_videos = session.query(Video).filter(Video.status == 'downloading').all()
        for video in stuck_videos:
            video.status = 'queued'
        if stuck_videos:
            print(f"Startup recovery: Reset {len(stuck_videos)} stuck 'downloading' videos to 'queued'")

        # Compact queue positions to sequential order [1, 2, 3, ...]
        queue_items = session.query(QueueItem).order_by(QueueItem.queue_position.nullslast(), QueueItem.created_at).all()
        if queue_items:
            for idx, item in enumerate(queue_items, start=1):
                item.queue_position = idx
            print(f"Startup recovery: Compacted {len(queue_items)} queue positions")

startup_recovery()

# Global operation tracking (for status bar updates) - Must be defined before scheduler
current_operation = {
    'type': None,  # 'scanning', 'adding_channel', 'auto_refresh'
    'message': None,
    'channel_id': None,
    'progress': 0
}

def set_operation(op_type, message, channel_id=None, progress=0):
    """Update current operation status"""
    global current_operation
    current_operation = {
        'type': op_type,
        'message': message,
        'channel_id': channel_id,
        'progress': progress
    }

def clear_operation():
    """Clear current operation status"""
    global current_operation
    current_operation = {
        'type': None,
        'message': None,
        'channel_id': None,
        'progress': 0
    }

# Initialize default settings
def init_settings():
    defaults = {
        'auto_refresh_enabled': 'false',
        'download_quality': 'best',
        'concurrent_downloads': '1'
    }
    for key, value in defaults.items():
        if not settings_manager.get(key):
            settings_manager.set(key, value)

init_settings()

# Helper functions
def get_db():
    return session_factory()

def serialize_channel(channel):
    # Calculate video counts based on status
    discovered_count = len([v for v in channel.videos if v.status == 'discovered'])
    downloaded_count = len([v for v in channel.videos if v.status == 'library'])
    ignored_count = len([v for v in channel.videos if v.status in ['ignored', 'geoblocked']])

    # Get the most recent video upload date
    last_video_date = None
    if channel.videos:
        videos_with_dates = [v for v in channel.videos if v.upload_date]
        if videos_with_dates:
            most_recent = max(videos_with_dates, key=lambda v: v.upload_date)
            last_video_date = most_recent.upload_date

    # Convert local thumbnail path to URL, or keep YouTube URL if still remote
    thumbnail_url = None
    if channel.thumbnail:
        if channel.thumbnail.startswith('http'):
            # Old YouTube URL - keep as is (will fix later)
            thumbnail_url = channel.thumbnail
        else:
            # Local path - convert to API URL with forward slashes
            normalized_path = channel.thumbnail.replace('\\', '/')
            thumbnail_url = f"/api/media/{normalized_path}"

    return {
        'id': channel.id,
        'yt_id': channel.yt_id,
        'title': channel.title,
        'thumbnail': thumbnail_url,
        'folder_name': channel.folder_name,
        'min_minutes': channel.min_minutes,
        'max_minutes': channel.max_minutes,
        'auto_download': channel.auto_download or False,
        'last_scan_at': channel.last_scan_at.replace(tzinfo=timezone.utc).isoformat() if channel.last_scan_at else None,
        'last_scan_time': channel.last_scan_time.replace(tzinfo=timezone.utc).isoformat() if channel.last_scan_time else None,
        'last_video_date': last_video_date,
        'created_at': channel.created_at.isoformat(),
        'updated_at': channel.updated_at.isoformat(),
        'video_count': discovered_count,
        'downloaded_count': downloaded_count,
        'ignored_count': ignored_count
    }

def format_scan_status_date(datetime_obj=None, yyyymmdd_string=None):
    """Format date for scan status message. Returns 'None' if no date."""
    if datetime_obj:
        # Convert UTC to local time
        if datetime_obj.tzinfo is not None:
            local_dt = datetime_obj.astimezone()
        else:
            # Assume UTC if no timezone info
            local_dt = datetime_obj.replace(tzinfo=timezone.utc).astimezone()

        # Check if today in local time
        now_local = datetime.now()
        if local_dt.date() == now_local.date():
            # Today - show time only
            return local_dt.strftime('%I:%M%p').lstrip('0').lower()
        else:
            # Not today - show date
            return local_dt.strftime('%m/%d')
    elif yyyymmdd_string:
        # Parse YYYYMMDD format
        year = yyyymmdd_string[0:4]
        month = yyyymmdd_string[4:6]
        day = yyyymmdd_string[6:8]
        return f"{month}/{day}"
    return "None"

def _execute_channel_scan(session, channel, force_full=False, current_num=0, total_num=0):
    """
    Execute a channel scan. This function contains the core scan logic.
    Used by both the scan endpoint and the scan worker thread.

    Args:
        session: SQLAlchemy session
        channel: Channel object to scan
        force_full: Boolean, if True does full scan, otherwise incremental
        current_num: Current channel number in batch (for progress display)
        total_num: Total channels in batch (for progress display)

    Returns:
        dict with 'new_videos' and 'ignored_videos' counts
    """
    scan_type = "full" if force_full else "incremental"
    logger.info(f"Starting scan for channel: {channel.title} (id: {channel.id})")

    # Get last video date for status message
    last_video_date = None
    if channel.videos:
        videos_with_dates = [v for v in channel.videos if v.upload_date]
        if videos_with_dates:
            most_recent = max(videos_with_dates, key=lambda v: v.upload_date)
            last_video_date = most_recent.upload_date

    # Format status message with last scan and last video info
    last_scan_str = format_scan_status_date(datetime_obj=channel.last_scan_time)
    last_video_str = format_scan_status_date(yyyymmdd_string=last_video_date)

    # Add progress prefix if we have total info
    progress_prefix = f"[{current_num}/{total_num}] " if total_num > 0 else ""
    status_msg = f"{progress_prefix}Scanning {channel.title}. Last scan: {last_scan_str} * Last Video: {last_video_str}"
    set_operation('scanning', status_msg, channel_id=channel.id)

    # Get YouTube API client
    try:
        youtube_client = get_youtube_client()
    except ValueError as e:
        logger.debug("YouTube API key not configured")
        clear_operation()
        raise e

    # Scan videos using YouTube Data API
    # For full scan, get ALL videos (999999 effectively means no limit)
    # For incremental scans:
    #   - If auto-scan is OFF: use 250 (manual scans are infrequent, need larger buffer)
    #   - If auto-scan is ON: use 50 (scans daily, smaller buffer is fine)
    logger.debug(f"Scanning channel: {channel.title}")
    if force_full:
        max_results = 999999
    else:
        # Check if auto-scan is enabled
        auto_scan_enabled = settings_manager.get_bool('auto_refresh_enabled')
        max_results = 50 if auto_scan_enabled else 250
    logger.debug(f"Fetching up to {max_results} videos for channel: {channel.title}")
    videos = youtube_client.scan_channel_videos(channel.yt_id, max_results=max_results)
    logger.debug(f"Found {len(videos)} total videos from YouTube API for channel: {channel.title}")

    new_count = 0
    ignored_count = 0
    existing_count = 0
    auto_queued_count = 0
    latest_upload_date = None

    total_videos = len(videos)
    logger.debug(f"Processing {total_videos} videos for channel '{channel.title}'")

    for idx, video_data in enumerate(videos, 1):
        # Update status with progress
        if total_videos > 0:
            progress_msg = f"{progress_prefix}Scanning {channel.title}. Last scan: {last_scan_str} * Last Video: {last_video_str} ({idx}/{total_videos})"
            set_operation('scanning', progress_msg, channel_id=channel.id)

        # Track the latest upload date found
        if video_data['upload_date']:
            upload_dt = datetime.strptime(video_data['upload_date'], '%Y%m%d')
            if latest_upload_date is None or upload_dt > latest_upload_date:
                latest_upload_date = upload_dt

        # Check if video already exists in database
        existing = session.query(Video).filter(Video.yt_id == video_data['id']).first()
        if existing:
            # Video already in database, skip it
            existing_count += 1
            logger.debug(f"[{idx}/{total_videos}] Already tracked: '{video_data['title']}'")
            continue

        # Log new video found
        logger.info(f"[{idx}/{total_videos}] New video found: '{video_data['title']}'")

        duration_min = video_data['duration_sec'] / 60

        # Determine status based on duration filters
        status = 'discovered'
        if channel.min_minutes > 0 and duration_min < channel.min_minutes:
            status = 'ignored'
            logger.info(f"[{idx}/{total_videos}] Ignored (too short): '{video_data['title']}' - {duration_min:.1f}m < {channel.min_minutes}m minimum")
        elif channel.max_minutes > 0 and duration_min > channel.max_minutes:
            status = 'ignored'
            logger.info(f"[{idx}/{total_videos}] Ignored (too long): '{video_data['title']}' - {duration_min:.1f}m > {channel.max_minutes}m maximum")
        else:
            logger.debug(f"[{idx}/{total_videos}] Discovered: '{video_data['title']}' - {duration_min:.1f}m duration")

        video = Video(
            yt_id=video_data['id'],
            channel_id=channel.id,
            title=video_data['title'],
            duration_sec=video_data['duration_sec'],
            upload_date=video_data['upload_date'],
            thumb_url=video_data['thumbnail'],
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
            logger.info(f"[{idx}/{total_videos}] Auto-queued: '{video.title}' (position {max_pos + 1})")

        if status == 'ignored':
            ignored_count += 1
        else:
            new_count += 1

    logger.debug(f"Scan results for '{channel.title}': {new_count} new, {ignored_count} ignored, {existing_count} already in database")

    # Update last scan time to the latest video upload date found
    # This ensures the next scan picks up from the last video, not the scan time
    if latest_upload_date:
        channel.last_scan_at = latest_upload_date.replace(tzinfo=timezone.utc)
        logger.debug(f"Updated last_scan_at for '{channel.title}' to {latest_upload_date}")
    elif channel.last_scan_at is None:
        # If no videos were found and no previous scan, set to now
        channel.last_scan_at = datetime.now(timezone.utc)
        logger.debug(f"Set initial last_scan_at for '{channel.title}' to now")

    # Update last_scan_time to when the scan actually executed
    channel.last_scan_time = datetime.now(timezone.utc)
    logger.debug(f"Updated last_scan_time for '{channel.title}' to now")

    # Log scan summary at INFO level
    if new_count == 0 and ignored_count == 0 and auto_queued_count == 0:
        logger.info("Scan complete. No new videos found")
    else:
        logger.info(f"Scan complete. {new_count} new, {ignored_count} ignored, {auto_queued_count} auto-queued")

    # Auto-resume the download worker if videos were auto-queued
    if auto_queued_count > 0 and download_worker.paused:
        download_worker.resume()
        logger.info(f"Auto-resumed download worker after auto-queueing {auto_queued_count} video(s) from scan")

    # Don't clear operation if this is part of a batch scan
    # Let the batch completion message be set by release_scan_batch_lock instead
    if scan_total_channels == 0:
        # This was a single channel scan, clear operation
        clear_operation()

    return {
        'new_videos': new_count,
        'ignored_videos': ignored_count,
        'auto_queued': auto_queued_count
    }

def queue_channel_scan(channel_id, force_full=False, reset_counters=False, is_batch_start=False, is_auto_scan=False, batch_label=''):
    """
    Add a channel to the scan queue.

    Args:
        channel_id: ID of channel to scan
        force_full: If True, rescan all videos (not just new ones)
        reset_counters: If True, force reset of scan progress counters (used when starting a new batch)
        is_batch_start: If True, this is the first channel in a batch scan
        is_auto_scan: If True, this is an auto-scan (can be queued for later)
        batch_label: Label for the batch (e.g., "Scan New", "Channel: xyz")

    Returns:
        True if added, 'pending' if auto-scan queued, False if rejected
    """
    global scan_total_channels, scan_current_channel, scan_last_queue_time
    import time

    # Check if already in queue by examining all pending items
    queue_items = list(scan_queue.queue)
    for item in queue_items:
        if item['channel_id'] == channel_id:
            logger.debug(f"Channel {channel_id} already in scan queue, skipping")
            return False

    # Try to acquire batch lock if this is the start of a batch
    if is_batch_start:
        lock_result = acquire_scan_batch_lock(is_auto_scan, batch_label)
        if lock_result != True:
            return lock_result  # Returns 'pending' or False

    current_time = time.time()
    time_since_last_queue = current_time - scan_last_queue_time

    # Reset counters if:
    # 1. Explicitly requested, OR
    # 2. Queue is empty AND it's been >3 seconds since last queue (new batch, not rapid queueing)
    should_reset = reset_counters or (scan_queue.empty() and time_since_last_queue > 3)

    if should_reset:
        if scan_total_channels > 0 or scan_current_channel > 0:
            logger.debug(f"Resetting scan counters (was {scan_current_channel}/{scan_total_channels})")
        scan_total_channels = 0
        scan_current_channel = 0

    # Add to queue and increment total
    scan_queue.put({
        'channel_id': channel_id,
        'force_full': force_full
    })
    scan_total_channels += 1
    scan_last_queue_time = current_time
    logger.debug(f"Added channel {channel_id} to scan queue (force_full={force_full}) - Total queued: {scan_total_channels}")
    return True

def get_scan_queue_status():
    """Get current scan queue status"""
    queue_items = list(scan_queue.queue)
    queue_size = len(queue_items)

    # Get channel IDs in queue
    queued_channel_ids = [item['channel_id'] for item in queue_items]

    return {
        'queue_size': queue_size,
        'queued_channel_ids': queued_channel_ids,
        'current_operation': current_operation.copy(),
        'scan_current': scan_current_channel,
        'scan_total': scan_total_channels
    }

# Initialize scheduler with operation tracking callbacks and scan queue function
scheduler = AutoRefreshScheduler(session_factory, download_worker, settings_manager, set_operation, clear_operation, queue_channel_scan)
scheduler.start()

def serialize_video(video):
    # Get playlist information for this video
    playlist_names = []
    playlist_ids = []
    if hasattr(video, 'playlist_videos') and video.playlist_videos:
        for pv in video.playlist_videos:
            if pv.playlist:
                playlist_names.append(pv.playlist.name)
                playlist_ids.append(pv.playlist.id)

    return {
        'id': video.id,
        'yt_id': video.yt_id,
        'channel_id': video.channel_id,
        'channel_title': video.channel.title if video.channel else None,
        'title': video.title,
        'duration_sec': video.duration_sec,
        'upload_date': video.upload_date,
        'thumb_url': video.thumb_url,
        'file_path': video.file_path,
        'file_size_bytes': video.file_size_bytes,
        'status': video.status,
        'watched': video.watched,
        'playback_seconds': video.playback_seconds,
        'discovered_at': video.discovered_at.isoformat(),
        'downloaded_at': video.downloaded_at.isoformat() if video.downloaded_at else None,
        'playlist_names': playlist_names,  # List of playlist names this video belongs to
        'playlist_ids': playlist_ids,  # List of playlist IDs this video belongs to
        'playlist_name': playlist_names[0] if playlist_names else None  # First playlist name for backward compatibility
    }

def serialize_category(category):
    """Serialize category with playlist count"""
    playlist_count = len(category.playlists) if category.playlists else 0

    # Get a random playlist thumbnail if category has playlists
    thumbnail = None
    if category.playlists:
        import random
        playlists_with_videos = [p for p in category.playlists if p.playlist_videos]
        if playlists_with_videos:
            random_playlist = random.choice(playlists_with_videos)
            random_video = random.choice(random_playlist.playlist_videos).video
            if random_video:
                thumbnail = random_video.thumb_url

    return {
        'id': category.id,
        'name': category.name,
        'playlist_count': playlist_count,
        'thumbnail': thumbnail,
        'created_at': category.created_at.isoformat(),
        'updated_at': category.updated_at.isoformat()
    }

def serialize_playlist(playlist):
    import random

    # Get a random video thumbnail if playlist has videos
    thumbnail = None
    if playlist.playlist_videos:
        random_video = random.choice(playlist.playlist_videos).video
        if random_video:
            thumbnail = random_video.thumb_url

    # Include category info
    category_info = None
    if playlist.category:
        category_info = {
            'id': playlist.category.id,
            'name': playlist.category.name
        }

    return {
        'id': playlist.id,
        'channel_id': playlist.channel_id,
        'category_id': playlist.category_id,
        'category': category_info,
        'name': playlist.name,
        'title': playlist.name,  # Add title for frontend compatibility
        'video_count': len(playlist.playlist_videos),
        'thumbnail': thumbnail,  # Random video thumbnail
        'created_at': playlist.created_at.isoformat(),
        'updated_at': playlist.updated_at.isoformat()
    }

def serialize_queue_item(item):
    return {
        'id': item.id,
        'video_id': item.video_id,
        'video': serialize_video(item.video) if item.video else None,
        'progress_pct': item.progress_pct,
        'speed_bps': item.speed_bps,
        'eta_seconds': item.eta_seconds,
        'total_bytes': item.total_bytes,
        'log': item.log,
        'created_at': item.created_at.isoformat(),
        'updated_at': item.updated_at.isoformat()
    }

# API Routes

# Health check
@app.route('/api/health', methods=['GET'])
def health_check():
    # Check ffmpeg
    ffmpeg_available = False
    try:
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5)
        ffmpeg_available = result.returncode == 0
    except:
        pass
    
    # Check yt-dlp version
    ytdlp_version = yt_dlp.version.__version__
    
    # Check auto-refresh status
    auto_refresh_enabled = settings_manager.get_bool('auto_refresh_enabled')
    auto_refresh_time = settings_manager.get('auto_refresh_time', '03:00')
    
    # Check cookies.txt
    cookies_path = os.path.join(os.path.dirname(__file__), 'cookies.txt')
    cookies_available = os.path.exists(cookies_path)

    # Calculate total storage size of downloads directory
    total_storage_bytes = 0
    downloads_path = os.path.join(os.path.dirname(__file__), 'downloads')
    if os.path.exists(downloads_path):
        for dirpath, dirnames, filenames in os.walk(downloads_path):
            for filename in filenames:
                filepath = os.path.join(dirpath, filename)
                try:
                    total_storage_bytes += os.path.getsize(filepath)
                except (OSError, FileNotFoundError):
                    pass

    # Format storage size
    def format_bytes(bytes_size):
        if bytes_size < 1024:
            return f"{bytes_size}B"
        elif bytes_size < 1024 * 1024:
            return f"{bytes_size / 1024:.1f}KB"
        elif bytes_size < 1024 * 1024 * 1024:
            return f"{bytes_size / (1024 * 1024):.1f}MB"
        elif bytes_size < 1024 * 1024 * 1024 * 1024:
            return f"{bytes_size / (1024 * 1024 * 1024):.1f}GB"
        else:
            return f"{bytes_size / (1024 * 1024 * 1024 * 1024):.1f}TB"

    total_storage = format_bytes(total_storage_bytes)

    # Check if worker thread is actually alive (not just the flag)
    worker_alive = download_worker.running and download_worker.thread and download_worker.thread.is_alive()

    # If worker flag says running but thread is dead, restart it
    if download_worker.running and (not download_worker.thread or not download_worker.thread.is_alive()):
        logger.warning('Worker thread is dead but flag says running - restarting worker')
        download_worker.running = False
        download_worker.start()
        worker_alive = True

    return jsonify({
        'status': 'ok',
        'ffmpeg_available': ffmpeg_available,
        'ytdlp_version': ytdlp_version,
        'auto_refresh_enabled': auto_refresh_enabled,
        'auto_refresh_time': auto_refresh_time,
        'download_worker_running': worker_alive,
        'cookies_available': cookies_available,
        'total_storage': total_storage
    })

# Channels
@app.route('/api/channels', methods=['GET'])
def get_channels():
    with get_session(session_factory) as session:
        channels = session.query(Channel).all()
        result = [serialize_channel(c) for c in channels]
        return jsonify(result)

@app.route('/api/channels', methods=['POST'])
def create_channel():
    data = request.json

    try:
        set_operation('adding_channel', 'Fetching channel information...')

        # Get YouTube API client
        try:
            youtube_client = get_youtube_client()
        except ValueError as e:
            clear_operation()
            return jsonify({'error': str(e)}), 400

        # Resolve channel ID from URL
        try:
            channel_id = youtube_client.resolve_channel_id_from_url(data['url'])
        except HttpError as e:
            clear_operation()
            return jsonify({'error': f'YouTube API error: {e}'}), 500

        if not channel_id:
            clear_operation()
            return jsonify({'error': 'Could not resolve channel ID from URL'}), 400

        with get_session(session_factory) as session:
            # Check if already exists
            existing = session.query(Channel).filter(Channel.yt_id == channel_id).first()
            if existing:
                clear_operation()
                return jsonify({'error': 'Channel already exists'}), 400

            # Get channel info
            try:
                channel_info = youtube_client.get_channel_info(channel_id)
            except HttpError as e:
                clear_operation()
                return jsonify({'error': f'YouTube API error: {e}'}), 500

            if not channel_info:
                clear_operation()
                return jsonify({'error': 'Could not fetch channel information'}), 400

            # Create folder name
            folder_name = channel_info['title'].replace(' ', '_').replace('/', '_')[:50]

            # Download channel thumbnail locally
            import urllib.request
            thumbnails_dir = os.path.join('downloads', 'thumbnails')
            os.makedirs(thumbnails_dir, exist_ok=True)

            thumbnail_path = None
            if channel_info['thumbnail']:
                try:
                    thumbnail_filename = f"{channel_id}.jpg"
                    local_file_path = os.path.join(thumbnails_dir, thumbnail_filename)
                    urllib.request.urlretrieve(channel_info['thumbnail'], local_file_path)

                    # Store relative path (without 'downloads/' prefix) since media endpoint serves from downloads/
                    thumbnail_path = os.path.join('thumbnails', thumbnail_filename)
                    print(f'Downloaded channel thumbnail for {channel_id}')
                except Exception as e:
                    print(f'Failed to download channel thumbnail: {e}')
                    thumbnail_path = None

            channel = Channel(
                yt_id=channel_id,
                title=channel_info['title'],
                thumbnail=thumbnail_path,  # Store local path instead of YouTube URL
                folder_name=folder_name,
                min_minutes=data.get('min_minutes', 0),
                max_minutes=data.get('max_minutes', 0)
            )
            session.add(channel)
            session.commit()

            # Queue initial full scan of the channel (runs in background)
            # force_full=True ensures we get the entire channel history
            queue_channel_scan(channel.id, force_full=True)
            logger.info(f"Queued initial full scan for new channel: {channel.title} (ID: {channel.id})")

            clear_operation()
            result = serialize_channel(channel)
            result['scan_result'] = {
                'message': 'Initial scan queued',
                'status': 'queued'
            }
            return jsonify(result), 201

    except HttpError as api_error:
        clear_operation()
        logger.error(f'YouTube API error while adding channel: {api_error}', exc_info=True)
        return jsonify({'error': 'Failed to add channel due to YouTube API error'}), 500
    except Exception as e:
        clear_operation()
        logger.error(f'Error adding channel: {str(e)}', exc_info=True)
        return jsonify({'error': 'An error occurred while adding the channel'}), 500

@app.route('/api/channels/<int:channel_id>', methods=['PATCH'])
def update_channel(channel_id):
    data = request.json

    with get_session(session_factory) as session:
        channel = session.query(Channel).filter(Channel.id == channel_id).first()
        if not channel:
            return jsonify({'error': 'Channel not found'}), 404

        if 'min_minutes' in data:
            old_min = channel.min_minutes
            channel.min_minutes = int(data['min_minutes'] or 0)
            if channel.min_minutes != old_min:
                logger.info(f"Duration filter updated for '{channel.title}': min_minutes {old_min} -> {channel.min_minutes}")
        if 'max_minutes' in data:
            old_max = channel.max_minutes
            channel.max_minutes = int(data['max_minutes'] or 0)
            if channel.max_minutes != old_max:
                logger.info(f"Duration filter updated for '{channel.title}': max_minutes {old_max} -> {channel.max_minutes}")
        if 'auto_download' in data:
            old_value = channel.auto_download
            channel.auto_download = bool(data['auto_download'])
            if channel.auto_download != old_value:
                if channel.auto_download:
                    logger.info(f"Auto-download enabled for channel '{channel.title}'")
                else:
                    logger.info(f"Auto-download disabled for channel '{channel.title}'")
        if 'folder_name' in data:
            channel.folder_name = data['folder_name']

        channel.updated_at = datetime.now(timezone.utc)
        session.commit()

        result = serialize_channel(channel)
        return jsonify(result)

@app.route('/api/channels/<int:channel_id>', methods=['DELETE'])
@limiter.limit("20 per minute")
def delete_channel(channel_id):
    with get_session(session_factory) as session:
        channel = session.query(Channel).filter(Channel.id == channel_id).first()

        if not channel:
            return jsonify({'error': 'Channel not found'}), 404

        session.delete(channel)
        session.commit()

        return '', 204

@app.route('/api/channels/<int:channel_id>/scan', methods=['POST'])
def scan_channel(channel_id):
    """Queue a channel scan (runs in background)"""
    with get_session(session_factory) as session:
        channel = session.query(Channel).filter(Channel.id == channel_id).first()

        if not channel:
            logger.debug(f"Scan requested for non-existent channel ID: {channel_id}")
            return jsonify({'error': 'Channel not found'}), 404

        # Get scan parameters
        data = request.get_json() or {}
        force_full = data.get('force_full', False)
        is_batch_start = data.get('is_batch_start', False)
        is_auto_scan = data.get('is_auto_scan', False)
        batch_label = data.get('batch_label', channel.title)

        # Try to queue the channel
        result = queue_channel_scan(
            channel_id,
            force_full,
            is_batch_start=is_batch_start,
            is_auto_scan=is_auto_scan,
            batch_label=batch_label
        )

        scan_type = "full" if force_full else "incremental"

        if result == True:
            logger.debug(f"Queued {scan_type} scan for channel: {channel.title} (ID: {channel_id})")
            return jsonify({'status': 'queued', 'message': f'Scan queued for {channel.title}'}), 202
        elif result == 'pending':
            logger.debug(f"Auto-scan queued for later: {channel.title} (ID: {channel_id})")
            return jsonify({'status': 'auto_scan_pending', 'message': 'Auto-scan queued for after current batch'}), 202
        else:
            # result is False - batch in progress or already queued
            logger.debug(f"Scan rejected for channel {channel.title} (ID: {channel_id}) - batch in progress or already queued")
            return jsonify({'status': 'batch_in_progress', 'message': 'A scan is already running. Please wait.'}), 409

@app.route('/api/channels/scan-status', methods=['GET'])
def get_scan_status():
    """Get current scan queue status"""
    status = get_scan_queue_status()
    return jsonify(status)

@app.route('/api/channels/batch-scan-status', methods=['GET'])
def get_batch_scan_status():
    """Check batch scan status and pending auto-scan"""
    return jsonify({
        'batch_in_progress': scan_batch_in_progress,
        'auto_scan_pending': scan_pending_auto_scan,
        'queue_size': scan_queue.qsize(),
        'current': scan_current_channel,
        'total': scan_total_channels
    })

# Videos
@app.route('/api/videos', methods=['GET'])
def get_videos():
    with get_session(session_factory) as session:
        # Parse query parameters
        channel_id = request.args.get('channel_id', type=int)
        status = request.args.get('status')
        watched = request.args.get('watched')
        ignored = request.args.get('ignored')
        search = request.args.get('search')
        min_duration = request.args.get('min_duration', type=int)
        max_duration = request.args.get('max_duration', type=int)
        upload_from = request.args.get('upload_from')  # YYYY-MM-DD format
        upload_to = request.args.get('upload_to')  # YYYY-MM-DD format

        query = session.query(Video).options(
            joinedload(Video.channel),
            joinedload(Video.playlist_videos).joinedload(PlaylistVideo.playlist)
        )

        # Get video IDs that are currently in the queue (exclude them from results)
        # Note: We only check presence in QueueItem table, not status (Video.status is source of truth)
        queued_video_ids = session.query(QueueItem.video_id).all()
        queued_video_ids = [vid[0] for vid in queued_video_ids]

        # Exclude queued videos from results (unless specifically filtering by 'downloading' status)
        if status != 'downloading' and queued_video_ids:
            query = query.filter(~Video.id.in_(queued_video_ids))

        if channel_id:
            query = query.filter(Video.channel_id == channel_id)
        # Handle ignored filter (includes both 'ignored' and 'geoblocked' statuses)
        if ignored is not None:
            has_ignored = ignored.lower() == 'true'
            if has_ignored:
                # Include both 'ignored' and 'geoblocked' videos in ignored filter
                query = query.filter(Video.status.in_(['ignored', 'geoblocked']))
            else:
                # Exclude ignored/geoblocked videos, but still apply status filter if provided
                query = query.filter(~Video.status.in_(['ignored', 'geoblocked']))
                if status:
                    query = query.filter(Video.status == status)
        elif status:
            # Apply status filter when ignored parameter is not present
            query = query.filter(Video.status == status)
        if watched is not None:
            query = query.filter(Video.watched == (watched.lower() == 'true'))
        if search:
            # Split search into individual words and match each word independently (case-insensitive)
            search_terms = search.lower().split()
            for term in search_terms:
                query = query.filter(Video.title.ilike(f'%{term}%'))
        if min_duration is not None:
            query = query.filter(Video.duration_sec >= min_duration * 60)
        if max_duration is not None:
            query = query.filter(Video.duration_sec <= max_duration * 60)
        if upload_from:
            # Convert YYYY-MM-DD to YYYYMMDD
            upload_from_formatted = upload_from.replace('-', '')
            query = query.filter(Video.upload_date.isnot(None), Video.upload_date >= upload_from_formatted)
        if upload_to:
            # Convert YYYY-MM-DD to YYYYMMDD
            upload_to_formatted = upload_to.replace('-', '')
            query = query.filter(Video.upload_date.isnot(None), Video.upload_date <= upload_to_formatted)

        videos = query.order_by(Video.discovered_at.desc()).all()
        result = [serialize_video(v) for v in videos]

        return jsonify(result)

@app.route('/api/videos/<int:video_id>', methods=['GET'])
def get_video(video_id):
    with get_session(session_factory) as session:
        video = session.query(Video).filter(Video.id == video_id).first()

        if not video:
            return jsonify({'error': 'Video not found'}), 404

        result = serialize_video(video)
        return jsonify(result)

@app.route('/api/videos/<int:video_id>', methods=['PATCH'])
def update_video(video_id):
    data = request.json

    with get_session(session_factory) as session:
        video = session.query(Video).filter(Video.id == video_id).first()
        if not video:
            logger.debug(f"Video update requested for non-existent video ID: {video_id}")
            return jsonify({'error': 'Video not found'}), 404

        changes = []
        if 'watched' in data:
            video.watched = data['watched']
            changes.append(f"watched={data['watched']}")
        if 'playback_seconds' in data:
            video.playback_seconds = data['playback_seconds']
            changes.append(f"playback={data['playback_seconds']}s")
        if 'status' in data:
            old_status = video.status
            video.status = data['status']
            changes.append(f"status: {old_status} -> {data['status']}")

        if changes:
            logger.debug(f"Updated video '{video.title}' (ID: {video_id}): {', '.join(changes)}")

        session.commit()
        result = serialize_video(video)

        return jsonify(result)

@app.route('/api/videos/<int:video_id>', methods=['DELETE'])
@limiter.limit("20 per minute")
def delete_video(video_id):
    import os

    with get_session(session_factory) as session:
        video = session.query(Video).filter(Video.id == video_id).first()
        if not video:
            return jsonify({'error': 'Video not found'}), 404

        # Delete video file if it exists
        if video.file_path and os.path.exists(video.file_path):
            try:
                os.remove(video.file_path)
                print(f"Deleted video file: {video.file_path}")
            except Exception as e:
                print(f"Error deleting video file: {e}")

        # Delete thumbnail if it exists (typically same name as video with .jpg extension)
        if video.file_path:
            thumb_path = os.path.splitext(video.file_path)[0] + '.jpg'
            if os.path.exists(thumb_path):
                try:
                    os.remove(thumb_path)
                    print(f"Deleted thumbnail: {thumb_path}")
                except Exception as e:
                    print(f"Error deleting thumbnail: {e}")

        # Remove from queue if present
        queue_item = session.query(QueueItem).filter(QueueItem.video_id == video.id).first()
        if queue_item:
            session.delete(queue_item)
            print(f"Removed video from queue")

        # Soft-delete: Set status to 'ignored' instead of removing record
        # This prevents the video from being re-queued on future scans
        # The video stays in DB so scans see it already exists and skip it
        video.status = 'ignored'
        video.file_path = None  # Clear file path since file is deleted
        video.file_size_bytes = None
        video.downloaded_at = None

        session.commit()

        return '', 204

@app.route('/api/videos/bulk', methods=['PATCH'])
def bulk_update_videos():
    data = request.json
    video_ids = data.get('video_ids', [])
    updates = data.get('updates', {})

    with get_session(session_factory) as session:
        videos = session.query(Video).filter(Video.id.in_(video_ids)).all()

        for video in videos:
            if 'watched' in updates:
                video.watched = updates['watched']
            if 'status' in updates:
                video.status = updates['status']

        session.commit()

        return jsonify({'updated': len(videos)})

# Playlists
# ==================== CATEGORY ENDPOINTS ====================

@app.route('/api/categories', methods=['GET'])
def get_categories():
    """List all categories with playlist counts"""
    from sqlalchemy.orm import joinedload
    with get_session(session_factory) as session:
        categories = session.query(Category).options(
            joinedload(Category.playlists).joinedload(Playlist.playlist_videos)
        ).order_by(Category.name).all()
        result = [serialize_category(c) for c in categories]
        return jsonify(result)

@app.route('/api/categories', methods=['POST'])
def create_category():
    """Create a new category"""
    data = request.json
    with get_session(session_factory) as session:
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'error': 'Category name is required'}), 400

        # Check if category already exists
        existing = session.query(Category).filter(Category.name == name).first()
        if existing:
            return jsonify({'error': 'Category already exists'}), 409

        category = Category(name=name)
        session.add(category)
        session.commit()

        result = serialize_category(category)
        return jsonify(result), 201

@app.route('/api/categories/<int:category_id>', methods=['GET'])
def get_category(category_id):
    """Get single category with its playlists"""
    from sqlalchemy.orm import joinedload
    with get_session(session_factory) as session:
        category = session.query(Category).options(
            joinedload(Category.playlists).joinedload(Playlist.playlist_videos)
        ).filter(Category.id == category_id).first()

        if not category:
            return jsonify({'error': 'Category not found'}), 404

        playlists = [serialize_playlist(p) for p in category.playlists]
        result = serialize_category(category)
        result['playlists'] = playlists

        return jsonify(result)

@app.route('/api/categories/<int:category_id>', methods=['PATCH'])
def update_category(category_id):
    """Rename a category"""
    data = request.json
    with get_session(session_factory) as session:
        category = session.query(Category).filter(Category.id == category_id).first()
        if not category:
            return jsonify({'error': 'Category not found'}), 404

        if 'name' in data:
            new_name = data['name'].strip()
            if not new_name:
                return jsonify({'error': 'Category name is required'}), 400

            # Check if new name already exists
            existing = session.query(Category).filter(
                Category.name == new_name,
                Category.id != category_id
            ).first()
            if existing:
                return jsonify({'error': 'Category name already exists'}), 409

            category.name = new_name

        session.commit()
        result = serialize_category(category)
        return jsonify(result)

@app.route('/api/categories/<int:category_id>', methods=['DELETE'])
@limiter.limit("20 per minute")
def delete_category(category_id):
    """Delete a category (playlists become uncategorized)"""
    with get_session(session_factory) as session:
        category = session.query(Category).filter(Category.id == category_id).first()

        if not category:
            return jsonify({'error': 'Category not found'}), 404

        # Set all playlists in this category to NULL (uncategorized)
        for playlist in category.playlists:
            playlist.category_id = None

        session.delete(category)
        session.commit()
        return '', 204

@app.route('/api/playlists/bulk-category', methods=['PATCH'])
def bulk_assign_category():
    """Assign multiple playlists to a category"""
    data = request.json
    with get_session(session_factory) as session:
        playlist_ids = data.get('playlist_ids', [])
        category_id = data.get('category_id')  # Can be None to uncategorize

        if not playlist_ids or not isinstance(playlist_ids, list):
            return jsonify({'error': 'playlist_ids array is required'}), 400

        # If category_id is provided, verify it exists
        if category_id is not None:
            category = session.query(Category).filter(Category.id == category_id).first()
            if not category:
                return jsonify({'error': 'Category not found'}), 404

        # Update all playlists
        updated_count = 0
        for playlist_id in playlist_ids:
            playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()
            if playlist:
                playlist.category_id = category_id
                updated_count += 1

        session.commit()

        return jsonify({
            'updated_count': updated_count,
            'total_requested': len(playlist_ids)
        })

# ==================== PLAYLIST ENDPOINTS ====================

@app.route('/api/playlists', methods=['GET'])
def get_playlists():
    from sqlalchemy.orm import joinedload
    with get_session(session_factory) as session:
        channel_id = request.args.get('channel_id', type=int)

        query = session.query(Playlist).options(
            joinedload(Playlist.category),
            joinedload(Playlist.playlist_videos)
        )
        if channel_id:
            query = query.filter(Playlist.channel_id == channel_id)

        playlists = query.all()
        result = [serialize_playlist(p) for p in playlists]

        return jsonify(result)

@app.route('/api/playlists', methods=['POST'])
def create_playlist():
    data = request.json
    with get_session(session_factory) as session:
        playlist = Playlist(
            name=data['name'],
            channel_id=data.get('channel_id')
        )
        session.add(playlist)
        session.commit()

        result = serialize_playlist(playlist)

        return jsonify(result), 201

@app.route('/api/playlists/<int:playlist_id>', methods=['GET'])
def get_playlist(playlist_id):
    from sqlalchemy.orm import joinedload
    with get_session(session_factory) as session:
        playlist = session.query(Playlist).options(joinedload(Playlist.category)).filter(Playlist.id == playlist_id).first()

        if not playlist:
            return jsonify({'error': 'Playlist not found'}), 404

        videos = [serialize_video(pv.video) for pv in playlist.playlist_videos]
        result = serialize_playlist(playlist)
        result['videos'] = videos

        return jsonify(result)

@app.route('/api/playlists/<int:playlist_id>', methods=['PATCH'])
def update_playlist(playlist_id):
    data = request.json
    with get_session(session_factory) as session:
        playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()
        if not playlist:
            return jsonify({'error': 'Playlist not found'}), 404

        if 'name' in data:
            playlist.name = data['name']

        if 'category_id' in data:
            # Allow setting to None to uncategorize
            playlist.category_id = data['category_id']

        session.commit()
        result = serialize_playlist(playlist)

        return jsonify(result)

@app.route('/api/playlists/<int:playlist_id>', methods=['DELETE'])
@limiter.limit("20 per minute")
def delete_playlist(playlist_id):
    with get_session(session_factory) as session:
        playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()

        if not playlist:
            return jsonify({'error': 'Playlist not found'}), 404

        session.delete(playlist)
        session.commit()

        return '', 204

@app.route('/api/playlists/<int:playlist_id>/videos', methods=['POST'])
def add_video_to_playlist(playlist_id):
    data = request.json
    with get_session(session_factory) as session:
        playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()
        if not playlist:
            return jsonify({'error': 'Playlist not found'}), 404

        video_id = data['video_id']

        # Check if already added
        existing = session.query(PlaylistVideo).filter(
            PlaylistVideo.playlist_id == playlist_id,
            PlaylistVideo.video_id == video_id
        ).first()

        if existing:
            return jsonify({'error': 'Video already in playlist'}), 400

        pv = PlaylistVideo(playlist_id=playlist_id, video_id=video_id)
        session.add(pv)
        session.commit()

        return jsonify({'success': True}), 201

@app.route('/api/playlists/<int:playlist_id>/videos/bulk', methods=['POST'])
def add_videos_to_playlist_bulk(playlist_id):
    """Add multiple videos to a playlist in a single transaction"""
    data = request.json
    with get_session(session_factory) as session:
        video_ids = data.get('video_ids', [])

        if not video_ids:
            return jsonify({'error': 'video_ids array is required'}), 400

        if not isinstance(video_ids, list):
            return jsonify({'error': 'video_ids must be an array'}), 400

        # Check playlist exists
        playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()
        if not playlist:
            return jsonify({'error': 'Playlist not found'}), 404

        logger.debug(f"Bulk add to playlist '{playlist.name}' (ID: {playlist_id}): {len(video_ids)} videos")

        added_count = 0
        skipped_count = 0
        skipped_videos = []

        for video_id in video_ids:
            # Check if already in playlist
            existing = session.query(PlaylistVideo).filter(
                PlaylistVideo.playlist_id == playlist_id,
                PlaylistVideo.video_id == video_id
            ).first()

            if existing:
                logger.debug(f"Bulk add: Skipping video ID {video_id} - already in playlist")
                skipped_count += 1
                continue

            # Get video for logging
            video = session.query(Video).filter(Video.id == video_id).first()
            if not video:
                logger.debug(f"Bulk add: Skipping non-existent video ID: {video_id}")
                skipped_count += 1
                continue

            # Add to playlist
            pv = PlaylistVideo(playlist_id=playlist_id, video_id=video_id)
            session.add(pv)
            added_count += 1
            logger.debug(f"Bulk add: Added video '{video.title}' (ID: {video_id}) to playlist")

        session.commit()
        logger.info(f"Bulk add to playlist completed: {added_count} added, {skipped_count} skipped")

        response = {
            'added_count': added_count,
            'skipped_count': skipped_count,
            'total_requested': len(video_ids)
        }

        return jsonify(response), 201

@app.route('/api/playlists/<int:playlist_id>/videos/<int:video_id>', methods=['DELETE'])
@limiter.limit("20 per minute")
def remove_video_from_playlist(playlist_id, video_id):
    with get_session(session_factory) as session:
        pv = session.query(PlaylistVideo).filter(
            PlaylistVideo.playlist_id == playlist_id,
            PlaylistVideo.video_id == video_id
        ).first()

        if not pv:
            return jsonify({'error': 'Video not in playlist'}), 404

        session.delete(pv)
        session.commit()

        return '', 204

# Queue
@app.route('/api/queue', methods=['GET'])
def get_queue():
    with get_session(session_factory) as session:
        # Query for queue items with videos that are queued or downloading
        items = session.query(QueueItem).join(Video).filter(
            Video.status.in_(['queued', 'downloading'])
        ).order_by(QueueItem.queue_position).all()
        queue_items = [serialize_queue_item(item) for item in items]

        # Find currently downloading item for detailed progress
        current_download = None
        for item in queue_items:
            if item['video'] and item['video'].get('status') == 'downloading':
                current_download = {
                    'video': item['video'],  # Include full video object
                    'progress_pct': item['progress_pct'],
                    'speed_bps': item['speed_bps'],
                    'eta_seconds': item['eta_seconds'],
                    'total_bytes': item.get('total_bytes', 0)
                }
                break

        # Get auto-refresh status
        auto_refresh_enabled = settings_manager.get_bool('auto_refresh_enabled')
        is_auto_refreshing = scheduler.is_running() if hasattr(scheduler, 'is_running') else False
        last_auto_refresh = scheduler.last_run if hasattr(scheduler, 'last_run') else None

        # Get delay info from download worker
        delay_info = download_worker.delay_info if hasattr(download_worker, 'delay_info') else None

        # Get paused state from download worker
        is_paused = download_worker.paused if hasattr(download_worker, 'paused') else False

        # Get rate limit message from download worker
        rate_limit_message = download_worker.rate_limit_message if hasattr(download_worker, 'rate_limit_message') else None

        return jsonify({
            'queue_items': queue_items,
            'current_download': current_download,
            'current_operation': current_operation,
            'delay_info': delay_info,
            'is_paused': is_paused,
            'is_auto_refreshing': is_auto_refreshing,
            'last_auto_refresh': last_auto_refresh.isoformat() if last_auto_refresh else None,
            'auto_refresh_enabled': auto_refresh_enabled,
            'rate_limit_message': rate_limit_message
        })

@app.route('/api/queue', methods=['POST'])
def add_to_queue():
    data = request.json
    with get_session(session_factory) as session:
        video_id = data['video_id']

        # Get video
        video = session.query(Video).filter(Video.id == video_id).first()
        if not video:
            logger.debug(f"Add to queue requested for non-existent video ID: {video_id}")
            return jsonify({'error': 'Video not found'}), 404

        # Check if already in queue (video status is queued or downloading)
        if video.status in ['queued', 'downloading']:
            logger.debug(f"Video '{video.title}' (ID: {video_id}) already in queue with status: {video.status}")
            return jsonify({'error': 'Video already in queue'}), 400

        # Set video status to queued and create queue item
        video.status = 'queued'
        # Get max queue position and add to bottom
        max_pos = session.query(func.max(QueueItem.queue_position)).scalar() or 0
        item = QueueItem(video_id=video_id, queue_position=max_pos + 1)
        session.add(item)
        session.commit()

        logger.debug(f"Added video '{video.title}' (ID: {video_id}) to queue at position {max_pos + 1}")

        result = serialize_queue_item(item)

        # Auto-resume the download worker when adding to queue
        # This ensures downloads start immediately when user adds videos
        if download_worker.paused:
            download_worker.resume()
            logger.info("Auto-resumed download worker after adding video to queue")

        return jsonify(result), 201

@app.route('/api/queue/bulk', methods=['POST'])
def add_to_queue_bulk():
    """Add multiple videos to queue in a single transaction"""
    data = request.json
    with get_session(session_factory) as session:
        video_ids = data.get('video_ids', [])

        if not video_ids:
            return jsonify({'error': 'video_ids array is required'}), 400

        if not isinstance(video_ids, list):
            return jsonify({'error': 'video_ids must be an array'}), 400

        logger.debug(f"Bulk add to queue requested for {len(video_ids)} videos")

        # Get max queue position once
        max_pos = session.query(func.max(QueueItem.queue_position)).scalar() or 0

        added_count = 0
        skipped_count = 0
        skipped_videos = []

        for video_id in video_ids:
            # Get video
            video = session.query(Video).filter(Video.id == video_id).first()
            if not video:
                logger.debug(f"Bulk add: Skipping non-existent video ID: {video_id}")
                skipped_count += 1
                continue

            # Skip if already in queue
            if video.status in ['queued', 'downloading']:
                logger.debug(f"Bulk add: Skipping video '{video.title}' (ID: {video_id}) - already in queue")
                skipped_videos.append(video.title)
                skipped_count += 1
                continue

            # Add to queue
            video.status = 'queued'
            max_pos += 1
            item = QueueItem(video_id=video_id, queue_position=max_pos)
            session.add(item)
            added_count += 1
            logger.debug(f"Bulk add: Added video '{video.title}' (ID: {video_id}) to queue at position {max_pos}")

        session.commit()
        logger.info(f"Bulk add to queue completed: {added_count} added, {skipped_count} skipped")

        # Auto-resume the download worker when adding to queue
        if added_count > 0 and download_worker.paused:
            download_worker.resume()
            logger.info("Auto-resumed download worker after bulk add to queue")

        response = {
            'added_count': added_count,
            'skipped_count': skipped_count,
            'total_requested': len(video_ids)
        }

        if skipped_videos:
            response['skipped_videos'] = skipped_videos[:10]  # Limit to first 10 for readability

        return jsonify(response), 201

@app.route('/api/queue/pause', methods=['POST'])
def pause_queue():
    download_worker.pause()
    return jsonify({'status': 'paused'})

@app.route('/api/queue/resume', methods=['POST'])
def resume_queue():
    download_worker.resume()
    return jsonify({'status': 'resumed'})

@app.route('/api/queue/cancel-current', methods=['POST'])
def cancel_current_download():
    download_worker.cancel_current()
    return jsonify({'status': 'cancelled'})

@app.route('/api/queue/<int:item_id>', methods=['DELETE'])
@limiter.limit("20 per minute")
def remove_from_queue(item_id):
    with get_session(session_factory) as session:
        item = session.query(QueueItem).filter(QueueItem.id == item_id).first()

        if not item:
            return jsonify({'error': 'Queue item not found'}), 404

        # Get the video
        video = session.query(Video).filter(Video.id == item.video_id).first()

        # Cannot remove if currently downloading
        if video and video.status == 'downloading':
            return jsonify({'error': 'Cannot remove item currently downloading'}), 400

        # Reset video status back to discovered
        if video and video.status in ['queued', 'downloading']:
            video.status = 'discovered'

        session.delete(item)
        session.commit()

        return '', 204

@app.route('/api/queue/reorder', methods=['POST'])
def reorder_queue():
    data = request.json
    with get_session(session_factory) as session:
        item_id = data.get('item_id')
        new_position = data.get('new_position')

        if not item_id or not new_position:
            return jsonify({'error': 'item_id and new_position are required'}), 400

        # Get the item to move
        item = session.query(QueueItem).filter(QueueItem.id == item_id).first()
        if not item:
            return jsonify({'error': 'Queue item not found'}), 404

        # Check if item is currently downloading (cannot reorder)
        video = session.query(Video).filter(Video.id == item.video_id).first()
        if video and video.status == 'downloading':
            return jsonify({'error': 'Cannot reorder currently downloading item'}), 400

        old_position = item.queue_position

        # Only reorder if position is actually changing
        if old_position == new_position:
            return jsonify({'message': 'Position unchanged'}), 200

        # Shift affected items based on move direction
        if new_position < old_position:
            # Moving UP: shift items [new_pos...old_pos-1] down by 1
            items_to_shift = session.query(QueueItem).filter(
                QueueItem.queue_position >= new_position,
                QueueItem.queue_position < old_position,
                QueueItem.id != item_id
            ).all()
            for shift_item in items_to_shift:
                shift_item.queue_position += 1
        else:
            # Moving DOWN: shift items [old_pos+1...new_pos] up by 1
            items_to_shift = session.query(QueueItem).filter(
                QueueItem.queue_position > old_position,
                QueueItem.queue_position <= new_position,
                QueueItem.id != item_id
            ).all()
            for shift_item in items_to_shift:
                shift_item.queue_position -= 1

        # Set new position for the moved item
        item.queue_position = new_position
        session.commit()

        # Return updated queue
        items = session.query(QueueItem).join(Video).filter(
            Video.status.in_(['queued', 'downloading'])
        ).order_by(QueueItem.queue_position).all()
        queue_items = [serialize_queue_item(queue_item) for queue_item in items]

        return jsonify({'queue_items': queue_items})

@app.route('/api/queue/move-to-top', methods=['POST'])
def move_to_top():
    data = request.json
    with get_session(session_factory) as session:
        item_id = data.get('item_id')

        if not item_id:
            return jsonify({'error': 'item_id is required'}), 400

        # Get the item to move
        item = session.query(QueueItem).filter(QueueItem.id == item_id).first()
        if not item:
            return jsonify({'error': 'Queue item not found'}), 404

        # Check if item is currently downloading (cannot reorder)
        video = session.query(Video).filter(Video.id == item.video_id).first()
        if video and video.status == 'downloading':
            return jsonify({'error': 'Cannot reorder currently downloading item'}), 400

        old_position = item.queue_position

        # If already at position 1, no change needed
        if old_position == 1:
            return jsonify({'message': 'Already at top'}), 200

        # Shift all items from position 1 to old_position-1 down by 1
        items_to_shift = session.query(QueueItem).filter(
            QueueItem.queue_position >= 1,
            QueueItem.queue_position < old_position,
            QueueItem.id != item_id
        ).all()
        for shift_item in items_to_shift:
            shift_item.queue_position += 1

        # Move item to position 1
        item.queue_position = 1
        session.commit()

        # Return updated queue
        items = session.query(QueueItem).join(Video).filter(
            Video.status.in_(['queued', 'downloading'])
        ).order_by(QueueItem.queue_position).all()
        queue_items = [serialize_queue_item(queue_item) for queue_item in items]

        return jsonify({'queue_items': queue_items})

@app.route('/api/queue/move-to-bottom', methods=['POST'])
def move_to_bottom():
    data = request.json
    with get_session(session_factory) as session:
        item_id = data.get('item_id')

        if not item_id:
            return jsonify({'error': 'item_id is required'}), 400

        # Get the item to move
        item = session.query(QueueItem).filter(QueueItem.id == item_id).first()
        if not item:
            return jsonify({'error': 'Queue item not found'}), 404

        # Check if item is currently downloading (cannot reorder)
        video = session.query(Video).filter(Video.id == item.video_id).first()
        if video and video.status == 'downloading':
            return jsonify({'error': 'Cannot reorder currently downloading item'}), 400

        old_position = item.queue_position

        # Find max position
        max_position = session.query(func.max(QueueItem.queue_position)).scalar() or 1

        # If already at bottom, no change needed
        if old_position == max_position:
            return jsonify({'message': 'Already at bottom'}), 200

        # Shift all items from old_position+1 to max_position up by 1
        items_to_shift = session.query(QueueItem).filter(
            QueueItem.queue_position > old_position,
            QueueItem.queue_position <= max_position,
            QueueItem.id != item_id
        ).all()
        for shift_item in items_to_shift:
            shift_item.queue_position -= 1

        # Move item to bottom (max position)
        item.queue_position = max_position
        session.commit()

        # Return updated queue
        items = session.query(QueueItem).join(Video).filter(
            Video.status.in_(['queued', 'downloading'])
        ).order_by(QueueItem.queue_position).all()
        queue_items = [serialize_queue_item(queue_item) for queue_item in items]

        return jsonify({'queue_items': queue_items}), 200

@app.route('/api/queue/clear', methods=['POST'])
@limiter.limit("10 per minute")
def clear_queue():
    """Remove all pending queue items (keep downloading item)"""
    with get_session(session_factory) as session:
        # Delete all queue items with status 'queued' (not 'downloading')
        deleted_count = session.query(QueueItem).join(Video).filter(
            Video.status == 'queued'
        ).delete(synchronize_session=False)

        # Also set the corresponding videos back to 'discovered' status
        session.query(Video).filter(
            Video.status == 'queued'
        ).update({'status': 'discovered'}, synchronize_session=False)

        session.commit()

        # Return updated queue
        items = session.query(QueueItem).join(Video).filter(
            Video.status.in_(['queued', 'downloading'])
        ).order_by(QueueItem.queue_position).all()
        queue_items = [serialize_queue_item(queue_item) for queue_item in items]

        return jsonify({
            'message': f'Cleared {deleted_count} items from queue',
            'queue_items': queue_items
        }), 200

# Settings
@app.route('/api/settings', methods=['GET'])
def get_settings():
    with get_session(session_factory) as session:
        settings = session.query(Setting).all()
        result = {s.key: s.value for s in settings}

        return jsonify(result)

@app.route('/api/settings', methods=['PATCH'])
def update_settings():
    data = request.json

    # Track which scheduler actions need to be taken AFTER commit
    needs_enable = False
    needs_disable = False
    needs_reschedule = False

    with get_session(session_factory) as session:
        for key, value in data.items():
            # Handle log level changes separately (update_log_level manages its own DB session)
            if key == 'log_level':
                logging_config.update_log_level(value)
                continue

            settings_manager.set(key, value)

            # Track auto-refresh toggle (execute AFTER commit)
            if key == 'auto_refresh_enabled':
                if value == 'true':
                    needs_enable = True
                else:
                    needs_disable = True

            # Track auto-refresh time change (execute AFTER commit)
            if key == 'auto_refresh_time':
                needs_reschedule = True

    # Now execute scheduler actions with committed values
    if needs_enable:
        scheduler.enable()
    elif needs_disable:
        scheduler.disable()

    if needs_reschedule:
        scheduler.reschedule()

    return jsonify({'success': True})

# Authentication endpoints
@app.route('/api/auth/check-first-run', methods=['GET'])
def check_first_run():
    """Check if this is the first run (setup needed)"""
    is_first_run = settings_manager.get_bool('first_run')
    return jsonify({'first_run': is_first_run})

@app.route('/api/auth/check', methods=['GET'])
def check_auth():
    """Check if user is authenticated"""
    is_auth = is_authenticated()
    logger.debug(f"Auth check - Session authenticated: {is_auth}, Session data: {dict(session)}")
    return jsonify({'authenticated': is_auth})

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login with username and password"""
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    remember_me = data.get('remember_me', False)

    logger.info(f"Login attempt - Username: {username}, Remember Me: {remember_me}")

    if not username or not password:
        logger.warning("Login failed - Missing username or password")
        return jsonify({'error': 'Username and password are required'}), 400

    # Get stored credentials for comparison
    stored_username, stored_password_hash = get_stored_credentials()
    logger.info(f"Stored username: {stored_username}, Checking password match...")

    if check_auth_credentials(username, password):
        session['authenticated'] = True
        session.permanent = True

        # Set session lifetime based on "Remember Me" checkbox
        if remember_me:
            # 1 year session
            app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=365)
            logger.info(f"✓ Login successful for user: {username} (1 year session)")
        else:
            # 90 days session (default)
            app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=90)
            logger.info(f"✓ Login successful for user: {username} (90 day session)")

        return jsonify({'success': True, 'message': 'Login successful'})
    else:
        logger.warning(f"✗ Login failed - Invalid credentials for user: {username}")
        return jsonify({'error': 'Invalid username or password'}), 401

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout current user"""
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out successfully'})

@app.route('/api/auth/setup', methods=['POST'])
def setup_auth():
    """Complete first-run setup with new credentials"""
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400

    if len(password) < 3:
        return jsonify({'error': 'Password must be at least 3 characters'}), 400

    with get_session(session_factory) as session:
        # Update username
        settings_manager.set('auth_username', username)

        # Update password hash
        password_hash = generate_password_hash(password)
        settings_manager.set('auth_password_hash', password_hash)

        # Mark first run as complete
        settings_manager.set('first_run', 'false')

        # Don't auto-login - redirect to login page
        logger.info(f"Authentication setup completed for user: {username}")
        return jsonify({'success': True, 'message': 'Credentials saved successfully. Please log in.'})

@app.route('/api/auth/change', methods=['POST'])
def change_auth():
    """Change username/password (requires current password)"""
    data = request.json
    current_password = data.get('current_password', '').strip()
    new_username = data.get('new_username', '').strip()
    new_password = data.get('new_password', '').strip()

    if not current_password:
        return jsonify({'error': 'Current password is required'}), 400

    if not new_username or not new_password:
        return jsonify({'error': 'New username and password are required'}), 400

    if len(new_username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400

    if len(new_password) < 3:
        return jsonify({'error': 'Password must be at least 3 characters'}), 400

    # Verify current password
    stored_username, stored_password_hash = get_stored_credentials()
    if not check_password_hash(stored_password_hash, current_password):
        return jsonify({'error': 'Current password is incorrect'}), 401

    try:
        # Update username
        settings_manager.set('auth_username', new_username)

        # Update password hash
        new_password_hash = generate_password_hash(new_password)
        settings_manager.set('auth_password_hash', new_password_hash)

        # Keep user logged in with new credentials
        session['authenticated'] = True

        logger.info(f"Credentials changed for user: {new_username}")
        return jsonify({'success': True, 'message': 'Credentials updated successfully'})
    except Exception as e:
        logger.error(f"Error changing credentials: {str(e)}")
        return jsonify({'error': 'Failed to update credentials'}), 500

@app.route('/api/logs', methods=['GET'])
def get_logs():
    """Get the last N lines from the log file"""
    try:
        lines = int(request.args.get('lines', 500))  # Default to last 500 lines
        log_file = 'logs/app.log'

        if not os.path.exists(log_file):
            return jsonify({'logs': [], 'message': 'Log file not found'})

        # Read last N lines efficiently
        with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
            # Read all lines and get the last N
            all_lines = f.readlines()
            last_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines

        return jsonify({'logs': last_lines, 'total_lines': len(all_lines)})
    except Exception as e:
        logger.error(f'Error reading logs: {str(e)}', exc_info=True)
        return jsonify({'error': 'An error occurred while reading the logs'}), 500

# Serve video files
@app.route('/api/media/<path:filename>')
def serve_media(filename):
    """Serve media files with path traversal protection"""
    # Validate and sanitize the path to prevent directory traversal
    safe_path = safe_join('downloads', filename)
    if safe_path is None or not os.path.exists(safe_path):
        logger.warning(f"Attempted to access invalid or non-existent file: {filename}")
        return jsonify({'error': 'File not found'}), 404

    # Additional check: ensure the resolved path is actually within downloads directory
    downloads_abs = os.path.abspath('downloads')
    file_abs = os.path.abspath(safe_path)
    if not file_abs.startswith(downloads_abs):
        logger.warning(f"Path traversal attempt blocked: {filename}")
        return jsonify({'error': 'Access denied'}), 403

    return send_from_directory('downloads', filename)

# Serve React app
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    # FORCE DEBUG MODE OFF - Triple protection:
    # 1. Environment variables set to production at startup
    # 2. app.debug and app.config['DEBUG'] set to False
    # 3. Explicit debug=False and use_reloader=False here
    # This prevents auto-restart which would bypass the lock file
    port = int(os.environ.get('PORT', 4099))
    app.run(
        debug=False,              # Never enable debug mode
        use_reloader=False,       # Never auto-reload on file changes
        host='0.0.0.0',
        port=port,
        threaded=True             # Handle multiple requests efficiently
    )

