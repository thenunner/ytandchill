from flask import Flask, request, jsonify, send_from_directory, send_file, Response, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import secrets
from datetime import datetime, timezone
import os
import yt_dlp
import subprocess
from models import init_db, Channel, Video, Playlist, PlaylistVideo, QueueItem, Setting
from download_worker import DownloadWorker
from scheduler import AutoRefreshScheduler
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import logging_config
import logging
import atexit
from sqlalchemy.orm import joinedload
from sqlalchemy import func
from utils import parse_iso8601_duration
from werkzeug.security import check_password_hash, generate_password_hash, safe_join
from functools import wraps

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
def get_youtube_api_key(session):
    """Get YouTube API key from settings"""
    setting = session.query(Setting).filter(Setting.key == 'youtube_api_key').first()
    return setting.value if setting and setting.value else None

def resolve_channel_id_from_url(youtube, url):
    """Resolve channel ID from various YouTube URL formats using Data API"""
    # Extract handle or channel ID from URL
    if 'youtube.com/@' in url:
        handle = url.split('/@')[1].split('/')[0].split('?')[0]
        # Search for channel by handle
        search_response = youtube.search().list(
            part='snippet',
            q=handle,
            type='channel',
            maxResults=1
        ).execute()
        if search_response.get('items'):
            return search_response['items'][0]['snippet']['channelId']
    elif 'youtube.com/channel/' in url:
        return url.split('/channel/')[1].split('/')[0].split('?')[0]
    elif 'youtube.com/c/' in url:
        custom_url = url.split('/c/')[1].split('/')[0].split('?')[0]
        search_response = youtube.search().list(
            part='snippet',
            q=custom_url,
            type='channel',
            maxResults=1
        ).execute()
        if search_response.get('items'):
            return search_response['items'][0]['snippet']['channelId']
    return None

def get_channel_info(youtube, channel_id):
    """Get channel metadata using Data API"""
    response = youtube.channels().list(
        part='snippet,contentDetails,statistics',
        id=channel_id
    ).execute()

    if not response.get('items'):
        return None

    channel_data = response['items'][0]
    return {
        'id': channel_id,
        'title': channel_data['snippet']['title'],
        'thumbnail': channel_data['snippet']['thumbnails'].get('high', {}).get('url'),
        'uploads_playlist': channel_data['contentDetails']['relatedPlaylists']['uploads']
    }

def scan_channel_videos(youtube, channel_id, max_results=50):
    """Scan channel videos using Data API (fast and reliable)"""
    try:
        # First get channel info to find uploads playlist
        channel_info = get_channel_info(youtube, channel_id)
        if not channel_info:
            print(f"ERROR: Could not get channel info for {channel_id}")
            return []

        uploads_playlist_id = channel_info['uploads_playlist']
        print(f"Scanning uploads playlist: {uploads_playlist_id}")
        videos = []
        next_page_token = None

        while len(videos) < max_results:
            # Get videos from uploads playlist
            playlist_response = youtube.playlistItems().list(
                part='snippet,contentDetails',
                playlistId=uploads_playlist_id,
                maxResults=min(50, max_results - len(videos)),
                pageToken=next_page_token
            ).execute()

            video_ids = [item['contentDetails']['videoId'] for item in playlist_response.get('items', [])]
            print(f"Found {len(video_ids)} video IDs in this page")

            if video_ids:
                # Get detailed video info (including duration)
                videos_response = youtube.videos().list(
                    part='snippet,contentDetails,statistics',
                    id=','.join(video_ids)
                ).execute()

                for video in videos_response.get('items', []):
                    # Parse ISO 8601 duration (PT1H2M10S -> seconds)
                    # Skip videos without duration (deleted, private, etc)
                    if 'duration' not in video.get('contentDetails', {}):
                        print(f"Skipping video {video['id']}: no duration (possibly deleted/private)")
                        continue

                    duration_str = video['contentDetails']['duration']
                    duration_sec = parse_iso8601_duration(duration_str)

                    # Skip videos under 2 minutes (120 seconds)
                    # This filters out YouTube Shorts and very short videos
                    if duration_sec < 120:
                        print(f"Skipping video {video['id']}: duration {duration_sec}s (<2 min)")
                        continue

                    videos.append({
                        'id': video['id'],
                        'title': video['snippet']['title'],
                        'duration_sec': duration_sec,
                        'upload_date': video['snippet']['publishedAt'][:10].replace('-', ''),
                        'thumbnail': video['snippet']['thumbnails'].get('high', {}).get('url')
                    })

            next_page_token = playlist_response.get('nextPageToken')
            if not next_page_token:
                break

        print(f"Total videos scanned: {len(videos)}")
        return videos
    except Exception as e:
        print(f"ERROR in scan_channel_videos: {e}")
        import traceback
        traceback.print_exc()
        return []

# Initialize database BEFORE Flask app so we can load secret key from DB
engine, Session = init_db()
session_factory = Session

def get_or_create_secret_key():
    """Get or create persistent secret key from database"""
    session = session_factory()
    try:
        # Check if secret_key exists in database
        secret_key_setting = session.query(Setting).filter(Setting.key == 'secret_key').first()

        if secret_key_setting and secret_key_setting.value:
            # Use existing secret key
            return secret_key_setting.value
        else:
            # Generate new secret key and save to database
            new_secret_key = secrets.token_hex(32)
            if secret_key_setting:
                secret_key_setting.value = new_secret_key
            else:
                secret_key_setting = Setting(key='secret_key', value=new_secret_key)
                session.add(secret_key_setting)
            session.commit()
            return new_secret_key
    finally:
        session.close()

# Determine static folder path - different for Docker vs local dev
# In Docker: /app/dist, In local dev: ../frontend/dist
static_folder = 'dist' if os.path.exists('dist') else '../frontend/dist'
app = Flask(__name__, static_folder=static_folder)

# Session configuration
app.config['SECRET_KEY'] = get_or_create_secret_key()
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 86400  # 24 hours

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
    session = session_factory()
    try:
        username_setting = session.query(Setting).filter_by(key='auth_username').first()
        password_setting = session.query(Setting).filter_by(key='auth_password_hash').first()

        username = username_setting.value if username_setting else 'admin'
        password_hash = password_setting.value if password_setting else generate_password_hash('admin')

        return username, password_hash
    finally:
        session.close()

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
download_worker = DownloadWorker(session_factory, download_dir='downloads')
download_worker.start()

# Startup recovery: Reset any stuck 'downloading' videos to 'queued' and compact queue positions
def startup_recovery():
    session = session_factory()
    try:
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

        session.commit()
    finally:
        session.close()

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

# Initialize scheduler with operation tracking callbacks
scheduler = AutoRefreshScheduler(session_factory, set_operation, clear_operation)
scheduler.start()

# Initialize default settings
def init_settings():
    session = session_factory()
    defaults = {
        'auto_refresh_enabled': 'false',
        'download_quality': 'best',
        'concurrent_downloads': '1'
    }
    for key, value in defaults.items():
        existing = session.query(Setting).filter(Setting.key == key).first()
        if not existing:
            session.add(Setting(key=key, value=value))
    session.commit()
    session.close()

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
        'last_scan_at': channel.last_scan_at.isoformat() if channel.last_scan_at else None,
        'last_video_date': last_video_date,
        'created_at': channel.created_at.isoformat(),
        'updated_at': channel.updated_at.isoformat(),
        'video_count': discovered_count,
        'downloaded_count': downloaded_count,
        'ignored_count': ignored_count
    }

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

def serialize_playlist(playlist):
    import random

    # Get a random video thumbnail if playlist has videos
    thumbnail = None
    if playlist.playlist_videos:
        random_video = random.choice(playlist.playlist_videos).video
        if random_video:
            thumbnail = random_video.thumb_url

    return {
        'id': playlist.id,
        'channel_id': playlist.channel_id,
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
    session = get_db()
    auto_refresh_setting = session.query(Setting).filter(Setting.key == 'auto_refresh_enabled').first()
    auto_refresh_enabled = auto_refresh_setting.value == 'true' if auto_refresh_setting else False
    auto_refresh_time_setting = session.query(Setting).filter(Setting.key == 'auto_refresh_time').first()
    auto_refresh_time = auto_refresh_time_setting.value if auto_refresh_time_setting else '03:00'
    session.close()
    
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
    session = get_db()
    channels = session.query(Channel).all()
    result = [serialize_channel(c) for c in channels]
    session.close()
    return jsonify(result)

@app.route('/api/channels', methods=['POST'])
def create_channel():
    data = request.json
    session = get_db()

    try:
        set_operation('adding_channel', 'Fetching channel information...')

        # Get YouTube API key
        api_key = get_youtube_api_key(session)
        if not api_key:
            clear_operation()
            return jsonify({'error': 'YouTube API key not configured. Please add it in Settings.'}), 400

        # Build YouTube API client
        youtube = build('youtube', 'v3', developerKey=api_key)

        # Resolve channel ID from URL
        channel_id = resolve_channel_id_from_url(youtube, data['url'])
        if not channel_id:
            clear_operation()
            return jsonify({'error': 'Could not resolve channel ID from URL'}), 400

        # Check if already exists
        existing = session.query(Channel).filter(Channel.yt_id == channel_id).first()
        if existing:
            clear_operation()
            return jsonify({'error': 'Channel already exists'}), 400

        # Get channel info
        channel_info = get_channel_info(youtube, channel_id)
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

        # Auto-scan the channel after creation using YouTube Data API
        set_operation('scanning', f'Scanning {channel_info["title"]} for videos...', channel_id=channel.id)
        new_count = 0
        ignored_count = 0

        try:
            # Scan ALL videos on initial channel creation (999999 = no practical limit)
            # This ensures we get the entire channel history, not just recent videos
            videos = scan_channel_videos(youtube, channel_id, max_results=999999)

            for video_data in videos:
                # Check if video already exists
                existing_video = session.query(Video).filter(Video.yt_id == video_data['id']).first()
                if existing_video:
                    continue

                duration_min = video_data['duration_sec'] / 60

                # Determine status based on duration filters
                status = 'discovered'
                if channel.min_minutes > 0 and duration_min < channel.min_minutes:
                    status = 'ignored'
                elif channel.max_minutes > 0 and duration_min > channel.max_minutes:
                    status = 'ignored'

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

                if status == 'ignored':
                    ignored_count += 1
                else:
                    new_count += 1

            channel.last_scan_at = datetime.now(timezone.utc)
            session.commit()

        except HttpError as api_error:
            print(f"YouTube API error during scan: {api_error}")
            # Don't fail channel creation if scan fails
        except Exception as scan_error:
            print(f"Initial scan error: {scan_error}")
            # Don't fail channel creation if scan fails

        clear_operation()
        result = serialize_channel(channel)
        result['scan_result'] = {
            'new_videos': new_count,
            'ignored_videos': ignored_count
        }
        return jsonify(result), 201

    except HttpError as api_error:
        session.rollback()
        clear_operation()
        logger.error(f'YouTube API error while adding channel: {api_error}', exc_info=True)
        return jsonify({'error': 'Failed to add channel due to YouTube API error'}), 500
    except Exception as e:
        session.rollback()
        clear_operation()
        logger.error(f'Error adding channel: {str(e)}', exc_info=True)
        return jsonify({'error': 'An error occurred while adding the channel'}), 500
    finally:
        session.close()

@app.route('/api/channels/<int:channel_id>', methods=['PATCH'])
def update_channel(channel_id):
    data = request.json
    session = get_db()
    
    channel = session.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        session.close()
        return jsonify({'error': 'Channel not found'}), 404
    
    if 'min_minutes' in data:
        channel.min_minutes = int(data['min_minutes'] or 0)
    if 'max_minutes' in data:
        channel.max_minutes = int(data['max_minutes'] or 0)
    if 'folder_name' in data:
        channel.folder_name = data['folder_name']

    channel.updated_at = datetime.now(timezone.utc)
    session.commit()
    
    result = serialize_channel(channel)
    session.close()
    return jsonify(result)

@app.route('/api/channels/<int:channel_id>', methods=['DELETE'])
@limiter.limit("20 per minute")
def delete_channel(channel_id):
    session = get_db()
    channel = session.query(Channel).filter(Channel.id == channel_id).first()
    
    if not channel:
        session.close()
        return jsonify({'error': 'Channel not found'}), 404
    
    session.delete(channel)
    session.commit()
    session.close()
    
    return '', 204

@app.route('/api/channels/<int:channel_id>/scan', methods=['POST'])
def scan_channel(channel_id):
    session = get_db()
    channel = session.query(Channel).filter(Channel.id == channel_id).first()

    if not channel:
        session.close()
        logger.debug(f"Scan requested for non-existent channel ID: {channel_id}")
        return jsonify({'error': 'Channel not found'}), 404

    try:
        # Check if this is a full rescan (get all videos, not just new ones)
        data = request.get_json() or {}
        force_full = data.get('force_full', False)

        scan_type = "full" if force_full else "incremental"
        logger.debug(f"Starting {scan_type} scan for channel: {channel.title} (ID: {channel.id})")
        set_operation('scanning', f'{scan_type.capitalize()} scan: {channel.title}...', channel_id=channel.id)

        # Get YouTube API key
        api_key = get_youtube_api_key(session)
        if not api_key:
            logger.debug("YouTube API key not configured")
            clear_operation()
            return jsonify({'error': 'YouTube API key not configured. Please add it in Settings.'}), 400

        # Build YouTube API client
        logger.debug(f"Building YouTube API client for channel: {channel.title}")
        youtube = build('youtube', 'v3', developerKey=api_key)

        # Scan videos using YouTube Data API
        # For full scan, get ALL videos (999999 effectively means no limit)
        # For incremental, just get recent 50
        max_results = 999999 if force_full else 50
        logger.debug(f"Fetching up to {max_results} videos for channel: {channel.title}")
        videos = scan_channel_videos(youtube, channel.yt_id, max_results=max_results)
        logger.debug(f"Found {len(videos)} total videos from YouTube API for channel: {channel.title}")

        new_count = 0
        ignored_count = 0
        existing_count = 0
        latest_upload_date = None

        logger.debug(f"Processing videos for channel: {channel.title}")
        for video_data in videos:
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
                continue

            duration_min = video_data['duration_sec'] / 60

            # Determine status based on duration filters
            status = 'discovered'
            if channel.min_minutes > 0 and duration_min < channel.min_minutes:
                status = 'ignored'
                logger.debug(f"Video '{video_data['title']}' ignored: {duration_min:.1f}m < {channel.min_minutes}m minimum")
            elif channel.max_minutes > 0 and duration_min > channel.max_minutes:
                status = 'ignored'
                logger.debug(f"Video '{video_data['title']}' ignored: {duration_min:.1f}m > {channel.max_minutes}m maximum")
            else:
                logger.debug(f"Video '{video_data['title']}' discovered: {duration_min:.1f}m duration")

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

        session.commit()
        logger.debug(f"Scan complete for channel: {channel.title}")

        clear_operation()
        return jsonify({
            'new_videos': new_count,
            'ignored_videos': ignored_count
        })

    except HttpError as api_error:
        session.rollback()
        clear_operation()
        logger.error(f'YouTube API error while scanning channel: {api_error}', exc_info=True)
        return jsonify({'error': 'Failed to scan channel due to YouTube API error'}), 500
    except Exception as e:
        session.rollback()
        clear_operation()
        logger.error(f'Error scanning channel: {str(e)}', exc_info=True)
        return jsonify({'error': 'An error occurred while scanning the channel'}), 500
    finally:
        session.close()

# Videos
@app.route('/api/videos', methods=['GET'])
def get_videos():
    session = get_db()

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
    session.close()

    return jsonify(result)

@app.route('/api/videos/<int:video_id>', methods=['GET'])
def get_video(video_id):
    session = get_db()
    video = session.query(Video).filter(Video.id == video_id).first()
    
    if not video:
        session.close()
        return jsonify({'error': 'Video not found'}), 404
    
    result = serialize_video(video)
    session.close()
    return jsonify(result)

@app.route('/api/videos/<int:video_id>', methods=['PATCH'])
def update_video(video_id):
    data = request.json
    session = get_db()

    video = session.query(Video).filter(Video.id == video_id).first()
    if not video:
        session.close()
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
    session.close()

    return jsonify(result)

@app.route('/api/videos/<int:video_id>', methods=['DELETE'])
@limiter.limit("20 per minute")
def delete_video(video_id):
    import os
    session = get_db()

    video = session.query(Video).filter(Video.id == video_id).first()
    if not video:
        session.close()
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

    # Delete video from database (cascade will remove playlist entries, queue items, etc.)
    session.delete(video)
    session.commit()
    session.close()

    return '', 204

@app.route('/api/videos/bulk', methods=['PATCH'])
def bulk_update_videos():
    data = request.json
    video_ids = data.get('video_ids', [])
    updates = data.get('updates', {})
    
    session = get_db()
    videos = session.query(Video).filter(Video.id.in_(video_ids)).all()
    
    for video in videos:
        if 'watched' in updates:
            video.watched = updates['watched']
        if 'status' in updates:
            video.status = updates['status']

    session.commit()
    session.close()
    
    return jsonify({'updated': len(videos)})

# Playlists
@app.route('/api/playlists', methods=['GET'])
def get_playlists():
    session = get_db()
    channel_id = request.args.get('channel_id', type=int)
    
    query = session.query(Playlist)
    if channel_id:
        query = query.filter(Playlist.channel_id == channel_id)
    
    playlists = query.all()
    result = [serialize_playlist(p) for p in playlists]
    session.close()
    
    return jsonify(result)

@app.route('/api/playlists', methods=['POST'])
def create_playlist():
    data = request.json
    session = get_db()
    
    playlist = Playlist(
        name=data['name'],
        channel_id=data.get('channel_id')
    )
    session.add(playlist)
    session.commit()
    
    result = serialize_playlist(playlist)
    session.close()
    
    return jsonify(result), 201

@app.route('/api/playlists/<int:playlist_id>', methods=['GET'])
def get_playlist(playlist_id):
    session = get_db()
    playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()
    
    if not playlist:
        session.close()
        return jsonify({'error': 'Playlist not found'}), 404
    
    videos = [serialize_video(pv.video) for pv in playlist.playlist_videos]
    result = serialize_playlist(playlist)
    result['videos'] = videos
    
    session.close()
    return jsonify(result)

@app.route('/api/playlists/<int:playlist_id>', methods=['PATCH'])
def update_playlist(playlist_id):
    data = request.json
    session = get_db()

    playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        session.close()
        return jsonify({'error': 'Playlist not found'}), 404

    if 'name' in data:
        playlist.name = data['name']

    session.commit()
    result = serialize_playlist(playlist)
    session.close()

    return jsonify(result)

@app.route('/api/playlists/<int:playlist_id>', methods=['DELETE'])
@limiter.limit("20 per minute")
def delete_playlist(playlist_id):
    session = get_db()
    playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()

    if not playlist:
        session.close()
        return jsonify({'error': 'Playlist not found'}), 404

    session.delete(playlist)
    session.commit()
    session.close()

    return '', 204

@app.route('/api/playlists/<int:playlist_id>/videos', methods=['POST'])
def add_video_to_playlist(playlist_id):
    data = request.json
    session = get_db()
    
    playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        session.close()
        return jsonify({'error': 'Playlist not found'}), 404
    
    video_id = data['video_id']
    
    # Check if already added
    existing = session.query(PlaylistVideo).filter(
        PlaylistVideo.playlist_id == playlist_id,
        PlaylistVideo.video_id == video_id
    ).first()
    
    if existing:
        session.close()
        return jsonify({'error': 'Video already in playlist'}), 400
    
    pv = PlaylistVideo(playlist_id=playlist_id, video_id=video_id)
    session.add(pv)
    session.commit()
    session.close()
    
    return jsonify({'success': True}), 201

@app.route('/api/playlists/<int:playlist_id>/videos/<int:video_id>', methods=['DELETE'])
@limiter.limit("20 per minute")
def remove_video_from_playlist(playlist_id, video_id):
    session = get_db()
    
    pv = session.query(PlaylistVideo).filter(
        PlaylistVideo.playlist_id == playlist_id,
        PlaylistVideo.video_id == video_id
    ).first()
    
    if not pv:
        session.close()
        return jsonify({'error': 'Video not in playlist'}), 404
    
    session.delete(pv)
    session.commit()
    session.close()
    
    return '', 204

# Queue
@app.route('/api/queue', methods=['GET'])
def get_queue():
    session = get_db()
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
    auto_refresh_enabled = session.query(Setting).filter(Setting.key == 'auto_refresh_enabled').first()
    is_auto_refreshing = scheduler.is_running() if hasattr(scheduler, 'is_running') else False
    last_auto_refresh = scheduler.last_run if hasattr(scheduler, 'last_run') else None

    # Get delay info from download worker
    delay_info = download_worker.delay_info if hasattr(download_worker, 'delay_info') else None

    # Get paused state from download worker
    is_paused = download_worker.paused if hasattr(download_worker, 'paused') else False

    session.close()

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
        'auto_refresh_enabled': auto_refresh_enabled.value == 'true' if auto_refresh_enabled else False,
        'rate_limit_message': rate_limit_message
    })

@app.route('/api/queue', methods=['POST'])
def add_to_queue():
    data = request.json
    session = get_db()

    video_id = data['video_id']

    # Get video
    video = session.query(Video).filter(Video.id == video_id).first()
    if not video:
        session.close()
        logger.debug(f"Add to queue requested for non-existent video ID: {video_id}")
        return jsonify({'error': 'Video not found'}), 404

    # Check if already in queue (video status is queued or downloading)
    if video.status in ['queued', 'downloading']:
        session.close()
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
    session.close()

    # Auto-resume the download worker when adding to queue
    # This ensures downloads start immediately when user adds videos
    if download_worker.paused:
        download_worker.resume()
        logger.info("Auto-resumed download worker after adding video to queue")

    return jsonify(result), 201

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
    session = get_db()
    item = session.query(QueueItem).filter(QueueItem.id == item_id).first()

    if not item:
        session.close()
        return jsonify({'error': 'Queue item not found'}), 404

    # Get the video
    video = session.query(Video).filter(Video.id == item.video_id).first()

    # Cannot remove if currently downloading
    if video and video.status == 'downloading':
        session.close()
        return jsonify({'error': 'Cannot remove item currently downloading'}), 400

    # Reset video status back to discovered
    if video and video.status in ['queued', 'downloading']:
        video.status = 'discovered'

    session.delete(item)
    session.commit()
    session.close()

    return '', 204

@app.route('/api/queue/reorder', methods=['POST'])
def reorder_queue():
    session = get_db()
    data = request.json
    item_id = data.get('item_id')
    new_position = data.get('new_position')

    if not item_id or not new_position:
        session.close()
        return jsonify({'error': 'item_id and new_position are required'}), 400

    # Get the item to move
    item = session.query(QueueItem).filter(QueueItem.id == item_id).first()
    if not item:
        session.close()
        return jsonify({'error': 'Queue item not found'}), 404

    # Check if item is currently downloading (cannot reorder)
    video = session.query(Video).filter(Video.id == item.video_id).first()
    if video and video.status == 'downloading':
        session.close()
        return jsonify({'error': 'Cannot reorder currently downloading item'}), 400

    old_position = item.queue_position

    # Only reorder if position is actually changing
    if old_position == new_position:
        session.close()
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
    session.close()

    return jsonify({'queue_items': queue_items}), 200

@app.route('/api/queue/clear', methods=['POST'])
@limiter.limit("10 per minute")
def clear_queue():
    """Remove all pending queue items (keep downloading item)"""
    session = get_db()
    try:
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
    except Exception as e:
        session.rollback()
        logger.error(f'Error clearing queue: {str(e)}', exc_info=True)
        return jsonify({'error': 'An error occurred while clearing the queue'}), 500
    finally:
        session.close()

# Settings
@app.route('/api/settings', methods=['GET'])
def get_settings():
    session = get_db()
    settings = session.query(Setting).all()
    result = {s.key: s.value for s in settings}
    session.close()
    
    return jsonify(result)

@app.route('/api/settings', methods=['PATCH'])
def update_settings():
    data = request.json
    session = get_db()

    for key, value in data.items():
        # Handle log level changes separately (update_log_level manages its own DB session)
        if key == 'log_level':
            logging_config.update_log_level(value)
            continue

        setting = session.query(Setting).filter(Setting.key == key).first()
        if setting:
            setting.value = value
        else:
            session.add(Setting(key=key, value=value))

        # Handle auto-refresh toggle
        if key == 'auto_refresh_enabled':
            if value == 'true':
                scheduler.enable()
            else:
                scheduler.disable()

    session.commit()
    session.close()

    return jsonify({'success': True})

# Authentication endpoints
@app.route('/api/auth/check-first-run', methods=['GET'])
def check_first_run():
    """Check if this is the first run (setup needed)"""
    db_session = get_db()
    try:
        first_run_setting = db_session.query(Setting).filter_by(key='first_run').first()
        is_first_run = first_run_setting and first_run_setting.value == 'true'
        return jsonify({'first_run': is_first_run})
    finally:
        db_session.close()

@app.route('/api/auth/check', methods=['GET'])
def check_auth():
    """Check if user is authenticated"""
    is_auth = is_authenticated()
    logger.info(f"Auth check - Session authenticated: {is_auth}, Session data: {dict(session)}")
    return jsonify({'authenticated': is_auth})

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login with username and password"""
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    logger.info(f"Login attempt - Username: {username}")

    if not username or not password:
        logger.warning("Login failed - Missing username or password")
        return jsonify({'error': 'Username and password are required'}), 400

    # Get stored credentials for comparison
    stored_username, stored_password_hash = get_stored_credentials()
    logger.info(f"Stored username: {stored_username}, Checking password match...")

    if check_auth_credentials(username, password):
        session['authenticated'] = True
        session.permanent = True
        logger.info(f"✓ Login successful for user: {username}")
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

    db_session = get_db()
    try:
        # Update username
        username_setting = db_session.query(Setting).filter_by(key='auth_username').first()
        if username_setting:
            username_setting.value = username
        else:
            db_session.add(Setting(key='auth_username', value=username))

        # Update password hash
        password_hash = generate_password_hash(password)
        password_setting = db_session.query(Setting).filter_by(key='auth_password_hash').first()
        if password_setting:
            password_setting.value = password_hash
        else:
            db_session.add(Setting(key='auth_password_hash', value=password_hash))

        # Mark first run as complete
        first_run_setting = db_session.query(Setting).filter_by(key='first_run').first()
        if first_run_setting:
            first_run_setting.value = 'false'
        else:
            db_session.add(Setting(key='first_run', value='false'))

        db_session.commit()

        # Don't auto-login - redirect to login page
        logger.info(f"Authentication setup completed for user: {username}")
        return jsonify({'success': True, 'message': 'Credentials saved successfully. Please log in.'})
    except Exception as e:
        db_session.rollback()
        logger.error(f"Error during auth setup: {str(e)}")
        return jsonify({'error': 'Failed to save credentials'}), 500
    finally:
        db_session.close()

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

    db_session = get_db()
    try:
        # Update username
        username_setting = db_session.query(Setting).filter_by(key='auth_username').first()
        if username_setting:
            username_setting.value = new_username
        else:
            db_session.add(Setting(key='auth_username', value=new_username))

        # Update password hash
        new_password_hash = generate_password_hash(new_password)
        password_setting = db_session.query(Setting).filter_by(key='auth_password_hash').first()
        if password_setting:
            password_setting.value = new_password_hash
        else:
            db_session.add(Setting(key='auth_password_hash', value=new_password_hash))

        db_session.commit()

        # Keep user logged in with new credentials
        session['authenticated'] = True

        logger.info(f"Credentials changed for user: {new_username}")
        return jsonify({'success': True, 'message': 'Credentials updated successfully'})
    except Exception as e:
        db_session.rollback()
        logger.error(f"Error changing credentials: {str(e)}")
        return jsonify({'error': 'Failed to update credentials'}), 500
    finally:
        db_session.close()

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

