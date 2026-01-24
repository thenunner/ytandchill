from flask import Flask, request, jsonify, send_from_directory, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import secrets
from datetime import datetime, timezone, timedelta
import os
import yt_dlp
from database import init_db, Channel, Video, Playlist, PlaylistVideo, QueueItem, Setting, Category, ChannelCategory, get_session
from downloader import DownloadWorker
from scheduler import AutoRefreshScheduler
from events import queue_events
from routes import register_blueprints
from scanner import scan_channel_videos, scan_channel_videos_full, scan_channel_shorts
from youtube_api import fetch_video_dates, scan_channel_videos_api
import logging
import atexit
from sqlalchemy.orm import joinedload
from sqlalchemy import func
from utils import parse_iso8601_duration, download_thumbnail, get_random_video_thumbnail, update_log_level, get_stored_credentials, check_auth_credentials, makedirs_777
from werkzeug.security import check_password_hash, generate_password_hash, safe_join
import threading
from queue import Queue

# Get logger for this module
logger = logging.getLogger(__name__)

# FORCE DISABLE DEBUG MODE - No matter what environment variables say
os.environ['FLASK_ENV'] = 'production'
os.environ['FLASK_DEBUG'] = '0'

# Lock file to prevent multiple instances - uses ATOMIC file locking
# Put lock file in data dir to keep project root clean
data_dir = os.environ.get('DATA_DIR', 'data')
os.makedirs(data_dir, exist_ok=True)
LOCK_FILE = os.path.join(data_dir, 'app.lock')
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
                except OSError:
                    pass
            if os.path.exists(LOCK_FILE):
                try:
                    os.remove(LOCK_FILE)
                except OSError:
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

# Determine static folder path - different for Docker vs local dev vs native Windows
# Flask resolves relative paths from app.py location, so we use absolute paths
# In Docker: /app/dist
# In local dev from backend/: ../frontend/dist
# In native Windows from project root: frontend/dist
if os.path.exists('dist'):
    static_folder = os.path.abspath('dist')  # Docker
elif os.path.exists('frontend/dist'):
    static_folder = os.path.abspath('frontend/dist')  # Running from project root (native Windows)
else:
    static_folder = os.path.abspath('../frontend/dist')  # Running from backend folder (local dev)
logger.debug(f"Static folder: {static_folder}")
app = Flask(__name__, static_folder=static_folder)

# Session configuration
app.config['SECRET_KEY'] = get_or_create_secret_key()
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 7776000  # 90 days (default without "Remember Me")

# File upload configuration - allow large video files (50GB max)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024 * 1024  # 50GB

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
logging.getLogger('apscheduler').setLevel(logging.WARNING)  # Quiet APScheduler's verbose job logging

# Initialize rate limiter
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per minute"],  # General rate limit for all endpoints
    storage_uri="memory://"
)

# Exempt media routes from rate limiting (they just serve local files)
@limiter.request_filter
def exempt_media_routes():
    """Skip rate limiting for media file requests."""
    return request.path.startswith('/api/media/')

# Authentication helper functions
# Auth helper functions moved to utils.py to avoid duplication

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

    # Allow media files without auth (video/thumbnail serving)
    # Video elements don't handle 401 responses gracefully - they trigger browser auth prompts
    if request.path.startswith('/api/media/'):
        return None

    # Allow SSE stream without auth - EventSource triggers browser auth popup on 401
    if request.path == '/api/queue/stream':
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

        # Set status bar message using batch label for context
        set_operation('scanning', f"Scanning: {batch_label}")

        return True

def release_scan_batch_lock():
    """Release the batch scan lock and check for pending auto-scan."""
    global scan_batch_in_progress, scan_pending_auto_scan, scan_batch_stats, scan_batch_label
    with scan_batch_lock:
        if scan_batch_in_progress:
            scan_batch_in_progress = False

            # Log completion message if any channels were scanned
            if scan_batch_stats['channels'] > 0:
                new = scan_batch_stats['new']
                ignored = scan_batch_stats['ignored']
                auto_queued = scan_batch_stats['auto_queued']

                # Get total channels scanned
                channels_scanned = scan_batch_stats['channels']

                # Format the batch completion message
                if new == 0 and ignored == 0 and auto_queued == 0:
                    completion_msg = f"Scanned {channels_scanned} {'channel' if channels_scanned == 1 else 'channels'}. No new videos found"
                else:
                    parts = []
                    if new > 0:
                        parts.append(f"{new} new {'video' if new == 1 else 'videos'}")
                    if ignored > 0:
                        parts.append(f"{ignored} ignored")
                    if auto_queued > 0:
                        parts.append(f"{auto_queued} auto-queued")
                    completion_msg = f"Scanned {channels_scanned} {'channel' if channels_scanned == 1 else 'channels'}. {', '.join(parts)}"

                # Set completion message in status bar
                set_operation('scan_complete', completion_msg)
                logger.info(completion_msg)

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
            except Exception:
                # Timeout (queue.Empty) - no job available, continue loop
                # Just reset counters if queue is empty (completion message already set)
                if scan_queue.empty():
                    scan_total_channels = 0
                    scan_current_channel = 0
                continue

            channel_id = scan_job['channel_id']
            force_full = scan_job.get('force_full', False)

            # Increment current channel counter
            scan_current_channel += 1

            # Log batch start on first channel
            if scan_current_channel == 1:
                logger.info(f"Starting {scan_batch_label}")

            logger.debug(f"Scan worker: Processing scan for channel ID {channel_id} ({scan_current_channel}/{scan_total_channels})")

            # Process the scan in a new session
            try:
                with get_session(session_factory) as session:
                    channel = session.query(Channel).filter(Channel.id == channel_id).first()
                    if not channel:
                        logger.warning(f"Scan worker: Channel {channel_id} not found")
                        scan_queue.task_done()
                        continue

                    # Update status bar to show current channel being scanned
                    if scan_total_channels > 0:
                        progress_pct = int(((scan_current_channel - 1) / scan_total_channels) * 100)
                        set_operation('scanning', f"Scanning: {channel.title}", progress=progress_pct)

                    # Execute the scan logic with progress info
                    result = _execute_channel_scan(session, channel, force_full, scan_current_channel, scan_total_channels)

                    # Accumulate batch statistics
                    global scan_batch_stats
                    scan_batch_stats['new'] += result.get('new_videos', 0)
                    scan_batch_stats['ignored'] += result.get('ignored_videos', 0)
                    scan_batch_stats['auto_queued'] += result.get('auto_queued', 0)
                    scan_batch_stats['channels'] += 1

                    logger.debug(f"Scan worker: Completed scan for channel '{channel.title}'")

                    # Check if this was the last channel - set completion message immediately
                    if scan_queue.empty() and scan_batch_in_progress:
                        logger.debug(f"Last channel completed, setting completion message immediately")
                        should_trigger_auto_scan = release_scan_batch_lock()
                        # Reset counters now that batch is complete
                        scan_total_channels = 0
                        scan_current_channel = 0
                        if should_trigger_auto_scan:
                            logger.debug("Scan worker: Triggering pending auto-scan")
                            scheduler.scan_all_channels()

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
            logger.info(f"Startup recovery: Reset {len(stuck_videos)} stuck 'downloading' videos to 'queued'")

        # Compact queue positions to sequential order [1, 2, 3, ...]
        queue_items = session.query(QueueItem).order_by(QueueItem.queue_position.nullslast(), QueueItem.created_at).all()
        if queue_items:
            for idx, item in enumerate(queue_items, start=1):
                item.queue_position = idx
            logger.info(f"Startup recovery: Compacted {len(queue_items)} queue positions")

startup_recovery()

# Global operation tracking (for status bar updates) - Must be defined before scheduler
current_operation = {
    'type': None,  # 'scanning', 'adding_channel', 'auto_refresh'
    'message': None,
    'channel_id': None,
    'progress': 0
}

def set_operation(op_type, message, channel_id=None, progress=0):
    """Update current operation status and broadcast via SSE"""
    global current_operation
    current_operation = {
        'type': op_type,
        'message': message,
        'channel_id': channel_id,
        'progress': progress,
        'timestamp': datetime.utcnow().isoformat()
    }
    # Broadcast update to SSE clients immediately
    queue_events.emit('queue:changed')

def clear_operation():
    """Clear current operation status and broadcast via SSE"""
    global current_operation
    logger.debug(f"[STATUS BAR] Clearing operation (was: {current_operation.get('type')} - {current_operation.get('message')})")
    current_operation = {
        'type': None,
        'message': None,
        'channel_id': None,
        'progress': 0,
        'timestamp': None
    }
    # Broadcast update to SSE clients immediately
    queue_events.emit('queue:changed')

def get_current_operation():
    """Get the current operation status (for use by blueprints)"""
    return current_operation

# Initialize default settings
def init_settings():
    defaults = {
        'auto_refresh_enabled': 'false',
        'download_quality': 'best',
        'concurrent_downloads': '1',
        'default_playback_speed': '1'
    }
    for key, value in defaults.items():
        if not settings_manager.get(key):
            settings_manager.set(key, value)

init_settings()

# Helper functions
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
        'ignored_count': ignored_count,
        'category_id': channel.category_id,
        'category_name': channel.category.name if channel.category else None
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

    # Note: Per-channel status updates removed - too fast for frontend polling
    # Batch-level status is set when scan batch starts

    # Scan videos using yt-dlp
    # Strategy depends on scan type:
    #   - Full scan (new channel, scan all): Use flat-playlist (fast) + YouTube API for dates
    #   - Incremental scan (auto-scan, scan new): Use full extraction (slower but has upload_date)
    logger.debug(f"Scanning channel: {channel.title}")

    # Build channel URL from stored channel ID
    channel_url = f'https://youtube.com/channel/{channel.yt_id}'

    if force_full:
        # Full scan: Use fast flat-playlist, API will fill in dates later
        max_results = 999999
        logger.debug(f"Full scan using flat-playlist for {channel.title}")
        channel_info, videos, all_video_ids = scan_channel_videos(channel_url, max_results=max_results)
        use_api_for_dates = True
    else:
        # Incremental scan: Try YouTube API first (fast), fall back to yt-dlp
        auto_scan_enabled = settings_manager.get_bool('auto_refresh_enabled')
        max_results = 50 if auto_scan_enabled else 250

        api_key = settings_manager.get('youtube_api_key')
        if api_key:
            # Try YouTube API (much faster - ~1 second vs minutes)
            logger.debug(f"Incremental scan using YouTube API for {channel.title} (max: {max_results})")
            api_videos, api_error = scan_channel_videos_api(channel.yt_id, api_key, max_results=max_results)

            if api_videos and not api_error:
                # API success - use API results
                videos = api_videos
                all_video_ids = set(v['id'] for v in videos)
                channel_info = {'id': channel.yt_id, 'title': channel.title, 'thumbnail': None}
                use_api_for_dates = False  # API already has dates
                logger.info(f"YouTube API scan complete: {len(videos)} videos for {channel.title}")
            else:
                # API failed - fall back to yt-dlp
                logger.warning(f"YouTube API failed for {channel.title}: {api_error}, falling back to yt-dlp")
                channel_info, videos, all_video_ids = scan_channel_videos_full(channel_url, max_results=max_results)
                use_api_for_dates = False
        else:
            # No API key - use yt-dlp (slower)
            logger.debug(f"Incremental scan using yt-dlp for {channel.title} (no API key)")
            channel_info, videos, all_video_ids = scan_channel_videos_full(channel_url, max_results=max_results)
            use_api_for_dates = False

    logger.debug(f"Fetched up to {max_results} videos for channel: {channel.title}")

    if channel_info is None and len(all_video_ids) == 0:
        logger.error(f"Failed to scan channel: {channel.title}")
        clear_operation()
        raise ValueError(f"Failed to scan channel: {channel.title}")

    logger.debug(f"Found {len(videos)} total videos for channel: {channel.title}")

    # Scan channel's /shorts tab to identify shorts
    shorts_ids = scan_channel_shorts(channel.yt_id)
    logger.debug(f"Found {len(shorts_ids)} shorts for channel: {channel.title}")

    new_count = 0
    ignored_count = 0
    shorts_count = 0
    existing_count = 0
    auto_queued_count = 0
    latest_upload_date = None

    total_videos = len(videos)
    logger.debug(f"Processing {total_videos} videos for channel '{channel.title}'")

    for idx, video_data in enumerate(videos, 1):
        # Note: Per-video progress updates removed - too fast for frontend polling

        # Track the latest upload date found
        if video_data['upload_date']:
            upload_dt = datetime.strptime(video_data['upload_date'], '%Y%m%d')
            if latest_upload_date is None or upload_dt > latest_upload_date:
                latest_upload_date = upload_dt

        # Check if video already exists in database
        existing = session.query(Video).filter(Video.yt_id == video_data['id']).first()
        if existing:
            # Check if this is a short that wasn't previously marked as such
            if video_data['id'] in shorts_ids and existing.status != 'shorts':
                old_status = existing.status
                existing.status = 'shorts'
                shorts_count += 1
                logger.info(f"[{idx}/{total_videos}] Updated to shorts: '{video_data['title']}' (was: {old_status})")
            else:
                existing_count += 1
                logger.debug(f"[{idx}/{total_videos}] Already tracked: '{video_data['title']}'")
            continue

        # Log new video found
        logger.info(f"[{idx}/{total_videos}] New video found: '{video_data['title']}'")

        duration_min = video_data['duration_sec'] / 60

        # Determine status: check if it's a short first, then duration filters
        status = 'discovered'
        if video_data['id'] in shorts_ids:
            status = 'shorts'
            shorts_count += 1
            logger.debug(f"[{idx}/{total_videos}] Short: '{video_data['title']}'")
        elif channel.min_minutes > 0 and duration_min < channel.min_minutes:
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
        logger.debug(f"[{idx}/{total_videos}] Auto-queue check for '{video.title}': status={status}, auto_download={channel.auto_download}")
        if status == 'discovered' and channel.auto_download:
            video.status = 'queued'
            max_pos = session.query(func.max(QueueItem.queue_position)).scalar() or 0
            queue_item = QueueItem(video_id=video.id, queue_position=max_pos + 1, prior_status='discovered')
            session.add(queue_item)
            auto_queued_count += 1
            logger.info(f"[{idx}/{total_videos}] Auto-queued: '{video.title}' (position {max_pos + 1})")
        elif status == 'discovered' and not channel.auto_download:
            logger.debug(f"[{idx}/{total_videos}] NOT auto-queued (auto_download=False): '{video.title}'")

        if status == 'ignored':
            ignored_count += 1
        elif status != 'shorts':  # shorts already counted above
            new_count += 1

    logger.debug(f"Scan results for '{channel.title}': {new_count} new, {ignored_count} ignored, {shorts_count} shorts, {existing_count} already in database")

    # Fetch upload dates via YouTube API for videos missing them (only for full scans)
    # Always check for missing dates, even if no new videos found (existing videos may be missing dates)
    if use_api_for_dates:
        api_key = settings_manager.get('youtube_api_key')
        if api_key:
            # Find all videos for this channel that are missing upload_date
            videos_needing_dates = session.query(Video).filter(
                Video.channel_id == channel.id,
                Video.upload_date.is_(None)
            ).all()

            if videos_needing_dates:
                logger.info(f"Fetching upload dates for {len(videos_needing_dates)} videos via YouTube API")
                video_ids = [v.yt_id for v in videos_needing_dates]
                dates = fetch_video_dates(video_ids, api_key)

                updated_count = 0
                for video in videos_needing_dates:
                    if video.yt_id in dates:
                        video.upload_date = dates[video.yt_id]
                        updated_count += 1

                        # Update latest_upload_date if this is newer
                        upload_dt = datetime.strptime(dates[video.yt_id], '%Y%m%d')
                        if latest_upload_date is None or upload_dt > latest_upload_date:
                            latest_upload_date = upload_dt

                logger.info(f"Updated upload dates for {updated_count}/{len(videos_needing_dates)} videos")
        else:
            logger.debug("No YouTube API key configured, skipping date fetch")

    # Clean up videos removed from YouTube (only on full scans)
    not_found_count = 0
    if force_full:
        # Find all videos for this channel in DB
        db_videos = session.query(Video).filter(Video.channel_id == channel.id).all()

        # Mark videos not found in scan as 'not_found' (except library videos)
        # Uses all_video_ids which includes shorts, so we don't incorrectly mark shorts as not_found
        for db_video in db_videos:
            if db_video.yt_id not in all_video_ids and db_video.status != 'library':
                db_video.status = 'not_found'
                not_found_count += 1
                logger.info(f"Marked as not found (removed from YouTube): '{db_video.title}'")

        if not_found_count > 0:
            logger.info(f"Marked {not_found_count} video(s) as 'not_found' (removed from YouTube)")

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

    # Set flag to notify frontend about new discovered videos (trigger auto-sort)
    if new_count > 0:
        # Use existing session to avoid database locking issues
        setting = session.query(Setting).filter(Setting.key == 'new_discoveries_flag').first()
        if setting:
            setting.value = 'true'
        else:
            setting = Setting(key='new_discoveries_flag', value='true')
            session.add(setting)
        # Don't commit here - the outer context manager will handle it
        logger.debug(f"Set new_discoveries_flag due to {new_count} discovered videos")

    # Emit SSE event to refresh videos/channels in real-time
    if new_count > 0 or ignored_count > 0:
        queue_events.emit('video:changed')

    # Auto-resume the download worker if videos were auto-queued
    if auto_queued_count > 0 and download_worker.paused:
        download_worker.resume()
        logger.info(f"Auto-resumed download worker after auto-queueing {auto_queued_count} video(s) from scan")

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

    # Convert local thumbnail path to URL, or construct from folder if not set
    thumb_url = None
    if video.thumb_url:
        if video.thumb_url.startswith('http'):
            # YouTube URL - keep as fallback
            thumb_url = video.thumb_url
        else:
            # Local path - convert to API URL
            normalized_path = video.thumb_url.replace('\\', '/')
            thumb_url = f"/api/media/{normalized_path}"
    elif video.channel and video.yt_id:
        # Construct local path from channel folder and video ID
        folder = video.channel.folder_name
        local_path = f"{folder}/{video.yt_id}.jpg"
        thumb_url = f"/api/media/{local_path}"

    return {
        'id': video.id,
        'yt_id': video.yt_id,
        'channel_id': video.channel_id,
        'channel_title': video.channel.title if video.channel else None,
        'folder_name': video.channel.folder_name if video.channel else video.folder_name,  # Actual download folder
        'title': video.title,
        'duration_sec': video.duration_sec,
        'upload_date': video.upload_date,
        'thumb_url': thumb_url,
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
    import random
    playlist_count = len(category.playlists) if category.playlists else 0

    # Get a random playlist thumbnail if category has playlists
    thumbnail = None
    if category.playlists:
        playlists_with_videos = [p for p in category.playlists if p.playlist_videos]
        if playlists_with_videos:
            random_playlist = random.choice(playlists_with_videos)
            thumbnail = get_random_video_thumbnail(random_playlist.playlist_videos)

    return {
        'id': category.id,
        'name': category.name,
        'playlist_count': playlist_count,
        'thumbnail': thumbnail,
        'created_at': category.created_at.isoformat(),
        'updated_at': category.updated_at.isoformat()
    }

def serialize_playlist(playlist):
    # Get a random video thumbnail if playlist has videos
    thumbnail = get_random_video_thumbnail(playlist.playlist_videos)

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

# Register route blueprints (after serializers are defined)
register_blueprints(
    app, session_factory, settings_manager, scheduler, download_worker,
    limiter=limiter,
    serialize_queue_item=serialize_queue_item,
    get_current_operation=get_current_operation,
    serialize_video=serialize_video,
    set_operation=set_operation,
    clear_operation=clear_operation,
    parse_iso8601_duration=parse_iso8601_duration,
    serialize_category=serialize_category,
    serialize_playlist=serialize_playlist,
    serialize_channel=serialize_channel,
    queue_channel_scan=queue_channel_scan
)

# Operation status
@app.route('/api/operation/set', methods=['POST'])
def set_operation_status():
    """Set the current operation status"""
    data = request.get_json()
    op_type = data.get('type')
    message = data.get('message')

    if not op_type or not message:
        return jsonify({'error': 'type and message required'}), 400

    set_operation(op_type, message)
    return jsonify({'status': 'set'}), 200

@app.route('/api/operation/clear', methods=['POST'])
def clear_operation_status():
    """Clear the current operation status"""
    clear_operation()
    return jsonify({'status': 'cleared'}), 200

@app.route('/api/cookie-warning/clear', methods=['POST'])
def clear_cookie_warning():
    """Clear the cookie warning message"""
    if download_worker and hasattr(download_worker, 'cookie_warning_message'):
        download_worker.cookie_warning_message = None
        logger.debug("Cookie warning cleared")
    return jsonify({'status': 'cleared'}), 200

# Serve React app
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    from waitress import serve

    # Use Waitress production WSGI server instead of Flask dev server
    # Benefits: Better concurrency, proper thread pooling, handles byte-range requests well
    port = int(os.environ.get('PORT', 4099))

    # Ensure required directories exist with 777 permissions for remote access
    downloads_dir = os.environ.get('DOWNLOADS_DIR', 'downloads')
    makedirs_777(os.path.join(downloads_dir, 'imports'))
    makedirs_777(os.path.join(downloads_dir, 'thumbnails'))

    logger.info(f"Starting Waitress server on 0.0.0.0:{port}")
    print(f"\n🚀 Server started! Open in your browser:")
    print(f"   Local:   http://localhost:{port}")
    print(f"   Network: http://<your-ip>:{port}")
    print("")

    serve(
        app,
        host='0.0.0.0',
        port=port,
        threads=16,               # Increased for SSE connections + video streaming
        channel_timeout=600,      # 10 minute timeout for SSE and large videos
        cleanup_interval=30,      # Clean up inactive threads every 30s
        asyncore_use_poll=True    # Better performance on Linux
    )

