"""
Settings and Authentication Routes

Handles:
- GET/PATCH /api/settings
- GET /api/health
- GET /api/logs
- /api/auth/* endpoints
"""

from flask import Blueprint, jsonify, request, session, current_app
from datetime import timedelta
from werkzeug.security import generate_password_hash, check_password_hash
import subprocess
import shutil
import os
import logging
import requests
import yt_dlp
from database import Setting, Video, get_session
from utils import update_log_level, get_stored_credentials, check_auth_credentials

logger = logging.getLogger(__name__)

# Create Blueprint
settings_bp = Blueprint('settings', __name__)

# Module-level references to shared dependencies (set by init_settings_routes)
_session_factory = None
_settings_manager = None
_scheduler = None
_download_worker = None


def init_settings_routes(session_factory, settings_manager, scheduler, download_worker):
    """Initialize the settings routes with required dependencies."""
    global _session_factory, _settings_manager, _scheduler, _download_worker
    _session_factory = session_factory
    _settings_manager = settings_manager
    _scheduler = scheduler
    _download_worker = download_worker


# =============================================================================
# Update Check Function
# =============================================================================

def check_for_app_update():
    """
    Check GitHub for the latest version and store it in settings.
    Called at the end of scan operations (auto-scan, channel scan, import, URL scan).
    Returns the latest version string or None on error.
    """
    try:
        response = requests.get(
            'https://api.github.com/repos/thenunner/ytandchill/releases/latest',
            timeout=10,
            headers={'Accept': 'application/vnd.github.v3+json'}
        )
        if response.status_code == 200:
            data = response.json()
            tag_name = data.get('tag_name', '')
            # Remove leading 'v' if present
            latest_version = tag_name.lstrip('v') if tag_name else None
            if latest_version:
                _settings_manager.set('latest_version', latest_version)
                logger.debug(f"Update check: latest version is {latest_version}")
                return latest_version
    except requests.RequestException as e:
        logger.debug(f"Update check failed: {e}")
    except Exception as e:
        logger.debug(f"Update check error: {e}")
    return None


# =============================================================================
# Authentication Helper Functions
# =============================================================================
# get_stored_credentials and check_auth_credentials moved to utils.py to avoid duplication

def is_authenticated():
    """Check if user is logged in via session"""
    return session.get('authenticated', False)


# =============================================================================
# Settings Endpoints
# =============================================================================

@settings_bp.route('/api/settings', methods=['GET'])
def get_settings():
    with get_session(_session_factory) as db_session:
        settings = db_session.query(Setting).all()
        result = {s.key: s.value for s in settings}
        return jsonify(result)


@settings_bp.route('/api/settings', methods=['PATCH'])
def update_settings():
    data = request.json

    # Track which scheduler actions need to be taken AFTER commit
    needs_enable = False
    needs_disable = False
    needs_reschedule = False

    with get_session(_session_factory) as db_session:
        for key, value in data.items():
            # Handle log level changes separately (update_log_level manages its own DB session)
            if key == 'log_level':
                update_log_level(value)
                continue

            # Check if auto-refresh settings changed BEFORE updating
            if key == 'auto_refresh_enabled':
                current = _settings_manager.get('auto_refresh_enabled', 'false')
                if value != current:
                    if value == 'true':
                        needs_enable = True
                    else:
                        needs_disable = True

            if key == 'auto_refresh_time':
                current = _settings_manager.get('auto_refresh_time')
                if value != current:
                    needs_reschedule = True

            # Check if auto_refresh_config changed (new multi-scan system)
            if key == 'auto_refresh_config':
                current = _settings_manager.get('auto_refresh_config')
                if value != current:
                    needs_reschedule = True

            _settings_manager.set(key, value)

    # Now execute scheduler actions with committed values
    if needs_enable:
        _scheduler.enable()
    elif needs_disable:
        _scheduler.disable()

    # Only reschedule if time changed but we didn't just enable (enable already uses new time)
    if needs_reschedule and not needs_enable:
        _scheduler.reschedule()

    return jsonify({'success': True})


@settings_bp.route('/api/settings/discoveries-flag', methods=['GET'])
def get_discoveries_flag():
    """Check if there are new discoveries that need user attention"""
    flag = _settings_manager.get('new_discoveries_flag', 'false')
    return jsonify({'new_discoveries': flag == 'true'})


@settings_bp.route('/api/settings/discoveries-flag', methods=['DELETE'])
def clear_discoveries_flag():
    """Clear the new discoveries notification flag"""
    _settings_manager.set('new_discoveries_flag', 'false')
    return jsonify({'status': 'ok'})


def _embed_date_metadata(file_path, upload_date):
    """Embed upload date into video file metadata using ffmpeg.

    Args:
        file_path: Path to video file
        upload_date: Date in YYYYMMDD format

    Returns:
        True if successful, False otherwise
    """
    if not file_path or not os.path.exists(file_path):
        return False

    # Convert YYYYMMDD to YYYY-MM-DD for metadata
    try:
        formatted_date = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"
    except (IndexError, TypeError):
        return False

    # Find ffmpeg
    ffmpeg_path = shutil.which('ffmpeg') or shutil.which('ffmpeg.exe')
    if not ffmpeg_path:
        logger.warning("ffmpeg not found, cannot embed metadata")
        return False

    # Create temp output path
    base, ext = os.path.splitext(file_path)
    temp_path = f"{base}_temp{ext}"

    try:
        # On Windows, prevent console window from appearing
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE

        # Use ffmpeg to copy streams and add date metadata
        result = subprocess.run([
            ffmpeg_path, '-y',
            '-i', file_path,
            '-c', 'copy',  # Copy streams without re-encoding
            '-metadata', f'date={formatted_date}',
            '-metadata', f'creation_time={formatted_date}T00:00:00Z',
            temp_path
        ], capture_output=True, timeout=120, startupinfo=startupinfo)

        if result.returncode == 0 and os.path.exists(temp_path):
            # Replace original with updated file
            os.replace(temp_path, file_path)
            return True
        else:
            logger.warning(f"ffmpeg metadata embed failed: {result.stderr.decode()[:200]}")
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return False

    except subprocess.TimeoutExpired:
        logger.warning(f"ffmpeg timeout embedding metadata for {file_path}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return False
    except Exception as e:
        logger.warning(f"Failed to embed metadata: {e}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return False


@settings_bp.route('/api/settings/fix-upload-dates', methods=['POST'])
def fix_upload_dates():
    """Fetch missing upload_date for all library videos and embed in file metadata."""
    global _session_factory

    updated_count = 0
    skipped_count = 0
    failed_count = 0

    with get_session(_session_factory) as session:
        # Get all library videos missing upload_date
        videos = session.query(Video).filter(
            Video.status == 'library',
            (Video.upload_date == None) | (Video.upload_date == '')
        ).all()

        total = len(videos)
        logger.info(f"Fixing upload dates for {total} videos")

        for video in videos:
            if not video.yt_id:
                skipped_count += 1
                continue

            try:
                # Fetch metadata from YouTube
                ydl_opts = {
                    'quiet': True,
                    'no_warnings': True,
                    'noplaylist': True,
                }

                # Add cookies if available
                cookies_path = os.path.join(os.environ.get('DATA_DIR', '/appdata/data'), 'backend', 'cookies.txt')
                if os.path.exists(cookies_path) and os.path.getsize(cookies_path) > 0:
                    ydl_opts['cookiefile'] = cookies_path

                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    url = f'https://youtube.com/watch?v={video.yt_id}'
                    data = ydl.extract_info(url, download=False)

                    if data and data.get('upload_date'):
                        upload_date = data['upload_date']

                        # Update database
                        video.upload_date = upload_date
                        session.commit()

                        # Embed in file metadata
                        if video.file_path and os.path.exists(video.file_path):
                            if _embed_date_metadata(video.file_path, upload_date):
                                logger.info(f"Updated upload_date for {video.yt_id}: {upload_date} (DB + file)")
                            else:
                                logger.info(f"Updated upload_date for {video.yt_id}: {upload_date} (DB only)")
                        else:
                            logger.info(f"Updated upload_date for {video.yt_id}: {upload_date} (DB only, file not found)")

                        updated_count += 1
                    else:
                        skipped_count += 1

            except Exception as e:
                logger.warning(f"Failed to fetch upload_date for {video.yt_id}: {e}")
                failed_count += 1

    return jsonify({
        'success': True,
        'updated': updated_count,
        'skipped': skipped_count,
        'failed': failed_count,
        'total': total if 'total' in dir() else 0,
    })


# =============================================================================
# Health & Logs Endpoints
# =============================================================================

def detect_server_platform():
    """Detect the server's platform (docker, windows, or linux).

    Returns the platform where the server is actually running,
    not the client's browser platform.
    """
    # Check for Docker container (presence of /.dockerenv or cgroup info)
    if os.path.exists('/.dockerenv'):
        return 'docker'
    try:
        with open('/proc/1/cgroup', 'r') as f:
            if 'docker' in f.read():
                return 'docker'
    except (FileNotFoundError, PermissionError):
        pass

    # Check for Windows
    if os.name == 'nt':
        return 'windows'

    # Default to Linux
    return 'linux'


@settings_bp.route('/api/health', methods=['GET'])
def health_check():
    # Detect server platform
    server_platform = detect_server_platform()

    # Check ffmpeg (cross-platform)
    ffmpeg_available = False
    ffmpeg_path = shutil.which('ffmpeg') or shutil.which('ffmpeg.exe')
    if ffmpeg_path:
        try:
            # On Windows, prevent console window from appearing
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = subprocess.SW_HIDE

            result = subprocess.run([ffmpeg_path, '-version'], capture_output=True, timeout=5, startupinfo=startupinfo)
            ffmpeg_available = result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass

    # Check yt-dlp version
    ytdlp_version = yt_dlp.version.__version__

    # Check auto-refresh status
    auto_refresh_enabled = _settings_manager.get_bool('auto_refresh_enabled')
    auto_refresh_time = _settings_manager.get('auto_refresh_time', '03:00')

    # Check cookies.txt (in backend folder)
    cookies_path = os.path.join(os.path.dirname(__file__), '..', 'cookies.txt')
    cookies_available = os.path.exists(cookies_path)

    # Check Firefox profile availability at /firefox_profile mount
    firefox_profile_path = '/firefox_profile'
    firefox_profile_mounted = os.path.exists(firefox_profile_path)

    # Check if Firefox profile has YouTube cookies
    firefox_has_cookies = False
    if firefox_profile_mounted:
        try:
            # Look for profiles.ini to find default profile
            profiles_ini = os.path.join(firefox_profile_path, 'profiles.ini')
            if os.path.exists(profiles_ini):
                # Check for any .default or .default-release profile
                for profile_dir in os.listdir(firefox_profile_path):
                    if profile_dir.endswith('.default') or profile_dir.endswith('.default-release'):
                        profile_path = os.path.join(firefox_profile_path, profile_dir)
                        cookies_db = os.path.join(profile_path, 'cookies.sqlite')
                        if os.path.exists(cookies_db) and os.path.getsize(cookies_db) > 0:
                            firefox_has_cookies = True
                            break
        except Exception as e:
            logger.debug(f'Error checking Firefox cookies: {e}')

    # Calculate total storage size of downloads directory
    total_storage_bytes = 0
    downloads_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'downloads')
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
    worker_alive = _download_worker.running and _download_worker.thread and _download_worker.thread.is_alive()

    # If worker flag says running but thread is dead, restart it
    if _download_worker.running and (not _download_worker.thread or not _download_worker.thread.is_alive()):
        logger.warning('Worker thread is dead but flag says running - restarting worker')
        _download_worker.running = False
        _download_worker.start()
        worker_alive = True

    # Calculate database size
    db_size = 0
    # Database path relative to backend directory
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'youtube_downloader.db')
    if os.path.exists(db_path):
        try:
            db_size = os.path.getsize(db_path)
        except (OSError, FileNotFoundError):
            pass
    database_size = format_bytes(db_size)

    # Get latest version from settings (populated by scan operations)
    latest_version = _settings_manager.get('latest_version')

    return jsonify({
        'status': 'ok',
        'server_platform': server_platform,
        'ffmpeg_available': ffmpeg_available,
        'ytdlp_version': ytdlp_version,
        'auto_refresh_enabled': auto_refresh_enabled,
        'auto_refresh_time': auto_refresh_time,
        'download_worker_running': worker_alive,
        'cookies_available': cookies_available,
        'firefox_profile_mounted': firefox_profile_mounted,
        'firefox_has_cookies': firefox_has_cookies,
        'total_storage': total_storage,
        'database_size': database_size,
        'latest_version': latest_version
    })


@settings_bp.route('/api/logs', methods=['GET'])
def get_logs():
    """Get the last N lines from the log file"""
    try:
        lines = int(request.args.get('lines', 500))
        log_file = 'logs/app.log'

        if not os.path.exists(log_file):
            return jsonify({'logs': [], 'message': 'Log file not found'})

        with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
            all_lines = f.readlines()
            last_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines

        return jsonify({'logs': last_lines, 'total_lines': len(all_lines)})
    except Exception as e:
        logger.error(f'Error reading logs: {str(e)}', exc_info=True)
        return jsonify({'error': 'An error occurred while reading the logs'}), 500


# =============================================================================
# Authentication Endpoints
# =============================================================================

@settings_bp.route('/api/auth/check-first-run', methods=['GET'])
def check_first_run():
    """Check if this is the first run (setup needed)"""
    is_first_run = _settings_manager.get_bool('first_run')
    return jsonify({'first_run': is_first_run})


@settings_bp.route('/api/auth/check', methods=['GET'])
def check_auth():
    """Check if user is authenticated"""
    is_auth = is_authenticated()
    logger.debug(f"Auth check - Session authenticated: {is_auth}, Session data: {dict(session)}")
    return jsonify({'authenticated': is_auth})


@settings_bp.route('/api/auth/login', methods=['POST'])
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
    stored_username, stored_password_hash = get_stored_credentials(_settings_manager)
    logger.info(f"Stored username: {stored_username}, Checking password match...")

    if check_auth_credentials(_settings_manager, username, password):
        session['authenticated'] = True
        session.permanent = True

        # Set session lifetime based on "Remember Me" checkbox
        if remember_me:
            # 1 year session
            current_app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=365)
            logger.info(f"✓ Login successful for user: {username} (1 year session)")
        else:
            # 90 days session (default)
            current_app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=90)
            logger.info(f"✓ Login successful for user: {username} (90 day session)")

        return jsonify({'success': True, 'message': 'Login successful'})
    else:
        logger.warning(f"✗ Login failed - Invalid credentials for user: {username}")
        return jsonify({'error': 'Invalid username or password'}), 401


@settings_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout current user"""
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out successfully'})


@settings_bp.route('/api/auth/setup', methods=['POST'])
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

    with get_session(_session_factory) as db_session:
        # Update username
        _settings_manager.set('auth_username', username)

        # Update password hash
        password_hash = generate_password_hash(password)
        _settings_manager.set('auth_password_hash', password_hash)

        # Mark first run as complete
        _settings_manager.set('first_run', 'false')

        # Don't auto-login - redirect to login page
        logger.info(f"Authentication setup completed for user: {username}")
        return jsonify({'success': True, 'message': 'Credentials saved successfully. Please log in.'})


@settings_bp.route('/api/auth/change', methods=['POST'])
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
    stored_username, stored_password_hash = get_stored_credentials(_settings_manager)
    if not check_password_hash(stored_password_hash, current_password):
        return jsonify({'error': 'Current password is incorrect'}), 401

    try:
        # Update username
        _settings_manager.set('auth_username', new_username)

        # Update password hash
        new_password_hash = generate_password_hash(new_password)
        _settings_manager.set('auth_password_hash', new_password_hash)

        # Keep user logged in with new credentials
        session['authenticated'] = True

        logger.info(f"Credentials changed for user: {new_username}")
        return jsonify({'success': True, 'message': 'Credentials updated successfully'})
    except Exception as e:
        logger.error(f"Error changing credentials: {str(e)}")
        return jsonify({'error': 'Failed to update credentials'}), 500


# =============================================================================
# Queue Database Repair
# =============================================================================

@settings_bp.route('/api/stats', methods=['GET'])
def get_stats():
    """Get video stats (excluding Singles channel from discovered/ignored)"""
    from database import Video, Channel

    with get_session(_session_factory) as session:
        try:
            # Calculate stats excluding Singles
            discovered_count = session.query(Video).join(Channel).filter(
                Video.status == 'discovered',
                Channel.deleted_at.is_(None),
                Channel.yt_id != '__singles__'
            ).count()

            ignored_count = session.query(Video).join(Channel).filter(
                Video.status.in_(['ignored', 'geoblocked']),
                Channel.deleted_at.is_(None),
                Channel.yt_id != '__singles__'
            ).count()

            library_count = session.query(Video).filter(
                Video.status == 'library'
            ).count()

            return jsonify({
                'discovered': discovered_count,
                'ignored': ignored_count,
                'library': library_count
            })

        except Exception as e:
            logger.error(f"Error fetching stats: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500


@settings_bp.route('/api/queue/check-orphaned', methods=['GET'])
def check_orphaned():
    """Recalculate stats, auto-clean orphaned queue items, and return cleanup options"""
    from database import Video, QueueItem, Channel, Setting

    with get_session(_session_factory) as session:
        try:
            # Recalculate and update stats (always on button click)
            # Exclude Singles channel from discovered/ignored counts (one-off grabs, not subscriptions)
            discovered_count = session.query(Video).join(Channel).filter(
                Video.status == 'discovered',
                Channel.deleted_at.is_(None),
                Channel.yt_id != '__singles__'  # Exclude Singles channel
            ).count()

            ignored_count = session.query(Video).join(Channel).filter(
                Video.status.in_(['ignored', 'geoblocked']),
                Channel.deleted_at.is_(None),
                Channel.yt_id != '__singles__'  # Exclude Singles channel
            ).count()

            library_count = session.query(Video).filter(
                Video.status == 'library'
            ).count()

            # Update stored stats
            stats_updated = []
            for key, value in [
                ('discovered_total', str(discovered_count)),
                ('ignored_total', str(ignored_count)),
                ('library_total', str(library_count))
            ]:
                setting = session.query(Setting).filter(Setting.key == key).first()
                if setting:
                    if setting.value != value:
                        old_value = setting.value
                        setting.value = value
                        stats_updated.append(f"{key}: {old_value} → {value}")
                else:
                    setting = Setting(key=key, value=value)
                    session.add(setting)
                    stats_updated.append(f"{key}: created with value {value}")

            # Auto-clean orphaned queue items (silently)
            orphaned = session.query(QueueItem, Video).join(Video).filter(
                ~Video.status.in_(['queued', 'downloading'])
            ).all()

            orphaned_cleaned = 0
            for qi, v in orphaned:
                logger.info(f"Auto-cleaning orphaned QueueItem {qi.id} for video {v.yt_id} (status: {v.status})")
                session.delete(qi)
                orphaned_cleaned += 1

            # Get videos not found on YouTube
            not_found_videos = session.query(Video).filter(
                Video.status == 'not_found'
            ).all()

            not_found_list = [{
                'id': v.id,
                'yt_id': v.yt_id,
                'title': v.title,
                'channel_name': v.channel.title if v.channel else 'Unknown'
            } for v in not_found_videos]

            # Get deleted channels with no library videos
            from sqlalchemy import func, case
            deleted_channels = session.query(
                Channel.id,
                Channel.title,
                func.count(Video.id).label('video_count')
            ).outerjoin(Video).filter(
                Channel.deleted_at.isnot(None)
            ).group_by(Channel.id).having(
                func.coalesce(func.sum(case((Video.status == 'library', 1), else_=0)), 0) == 0
            ).all()

            deletable_channels = [{
                'id': ch.id,
                'title': ch.title,
                'video_count': ch.video_count
            } for ch in deleted_channels]

            session.commit()

            if stats_updated:
                logger.info(f"Stats updated: {', '.join(stats_updated)}")
            if orphaned_cleaned > 0:
                logger.info(f"Auto-cleaned {orphaned_cleaned} orphaned queue items")

            return jsonify({
                'stats': {
                    'discovered': discovered_count,
                    'ignored': ignored_count,
                    'library': library_count
                },
                'stats_updated': stats_updated,
                'orphaned_cleaned': orphaned_cleaned,
                'not_found_videos': not_found_list,
                'deletable_channels': deletable_channels
            })

        except Exception as e:
            session.rollback()
            logger.error(f"Error in queue/DB repair check: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500


@settings_bp.route('/api/queue/remove-not-found', methods=['POST'])
def remove_not_found_videos():
    """Remove selected videos that were not found on YouTube"""
    from database import Video

    data = request.json
    video_ids = data.get('video_ids', [])

    if not video_ids:
        return jsonify({'error': 'No video IDs provided'}), 400

    with get_session(_session_factory) as session:
        try:
            removed_count = 0
            for video_id in video_ids:
                video = session.query(Video).filter(Video.id == video_id).first()
                if video and video.status == 'not_found':
                    logger.info(f"Removing not found video: {video.title} (yt_id: {video.yt_id})")
                    session.delete(video)
                    removed_count += 1

            session.commit()
            logger.info(f"Removed {removed_count} not found videos")

            return jsonify({
                'removed': removed_count
            })

        except Exception as e:
            session.rollback()
            logger.error(f"Error removing not found videos: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500


@settings_bp.route('/api/queue/purge-channels', methods=['POST'])
def purge_deleted_channels():
    """Permanently delete selected soft-deleted channels and all their videos"""
    from database import Channel, Video, Playlist, PlaylistVideo

    data = request.json
    channel_ids = data.get('channel_ids', [])

    if not channel_ids:
        return jsonify({'error': 'No channel IDs provided'}), 400

    with get_session(_session_factory) as session:
        try:
            purged_count = 0
            total_videos_removed = 0

            for channel_id in channel_ids:
                channel = session.query(Channel).filter(Channel.id == channel_id).first()
                if not channel or channel.deleted_at is None:
                    continue

                # Verify channel has no library videos (safety check)
                library_count = session.query(Video).filter(
                    Video.channel_id == channel_id,
                    Video.status == 'library'
                ).count()

                if library_count > 0:
                    logger.warning(f"Skipping channel {channel.title} - has {library_count} library videos")
                    continue

                # Count videos before deletion
                video_count = session.query(Video).filter(Video.channel_id == channel_id).count()

                # Delete all videos for this channel
                session.query(Video).filter(Video.channel_id == channel_id).delete()

                # Delete playlists
                session.query(Playlist).filter(Playlist.channel_id == channel_id).delete()

                # Delete channel folder if it exists (no library videos = safe to delete)
                folder_deleted = False
                if channel.folder_name:
                    import shutil
                    downloads_dir = os.environ.get('DOWNLOADS_DIR', 'downloads')
                    channel_folder = os.path.join(downloads_dir, channel.folder_name)
                    if os.path.exists(channel_folder) and os.path.isdir(channel_folder):
                        shutil.rmtree(channel_folder)
                        folder_deleted = True
                        logger.info(f"Deleted channel folder: {channel_folder}")

                # Delete the channel
                session.delete(channel)

                logger.info(f"Purged channel: {channel.title} ({video_count} videos, folder_deleted={folder_deleted})")
                purged_count += 1
                total_videos_removed += video_count

            session.commit()
            logger.info(f"Purged {purged_count} channels, removed {total_videos_removed} total videos")

            return jsonify({
                'purged_channels': purged_count,
                'videos_removed': total_videos_removed
            })

        except Exception as e:
            session.rollback()
            logger.error(f"Error purging channels: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500


