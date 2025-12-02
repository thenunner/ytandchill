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
import os
import logging
import yt_dlp
from importlib.metadata import version as pkg_version

from database import Setting, get_session
from utils import update_log_level

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
# Authentication Helper Functions
# =============================================================================

def get_stored_credentials():
    """Get stored username and password hash from database"""
    username = _settings_manager.get('auth_username', 'admin')
    password_hash = _settings_manager.get('auth_password_hash', generate_password_hash('admin'))
    return username, password_hash


def check_auth_credentials(username, password):
    """Validate username and password against stored credentials"""
    stored_username, stored_password_hash = get_stored_credentials()
    return username == stored_username and check_password_hash(stored_password_hash, password)


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


# =============================================================================
# Health & Logs Endpoints
# =============================================================================

@settings_bp.route('/api/health', methods=['GET'])
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

    # Check google-api-python-client version
    try:
        google_api_version = pkg_version('google-api-python-client')
    except Exception:
        google_api_version = 'Unknown'

    # Check auto-refresh status
    auto_refresh_enabled = _settings_manager.get_bool('auto_refresh_enabled')
    auto_refresh_time = _settings_manager.get('auto_refresh_time', '03:00')

    # Check cookies.txt
    cookies_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'cookies.txt')
    cookies_available = os.path.exists(cookies_path)

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

    return jsonify({
        'status': 'ok',
        'ffmpeg_available': ffmpeg_available,
        'ytdlp_version': ytdlp_version,
        'google_api_version': google_api_version,
        'auto_refresh_enabled': auto_refresh_enabled,
        'auto_refresh_time': auto_refresh_time,
        'download_worker_running': worker_alive,
        'cookies_available': cookies_available,
        'total_storage': total_storage
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
    stored_username, stored_password_hash = get_stored_credentials()
    logger.info(f"Stored username: {stored_username}, Checking password match...")

    if check_auth_credentials(username, password):
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
    stored_username, stored_password_hash = get_stored_credentials()
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
