"""
Shared utility functions and logging configuration for the YouTube downloader backend.
"""

import logging
import logging.handlers
import os
import random
import re
import time
import threading
import urllib.request
from database import init_db, Setting
from werkzeug.security import check_password_hash, generate_password_hash


# =============================================================================
# Helper Functions
# =============================================================================

logger = logging.getLogger(__name__)


def sanitize_folder_name(name, max_length=50):
    """Sanitize a string for use as a folder name on all platforms.

    Handles Windows-invalid characters: < > : " / \\ | ? *
    Also handles spaces and truncates to max_length.

    Args:
        name: The folder name to sanitize
        max_length: Maximum length of the result (default 50)

    Returns:
        str: Sanitized folder name safe for Windows and Unix
    """
    if not name:
        return 'unknown'
    # Replace Windows-invalid characters and common separators
    sanitized = re.sub(r'[<>:"/\\|?*]', '_', name)
    # Replace spaces with underscores
    sanitized = sanitized.replace(' ', '_')
    # Collapse multiple underscores
    sanitized = re.sub(r'_+', '_', sanitized)
    # Strip leading/trailing underscores
    sanitized = sanitized.strip('_')
    # Truncate to max length
    return sanitized[:max_length] if sanitized else 'unknown'


def makedirs_777(path):
    """Create directory with 777 permissions for remote access.

    Args:
        path: Directory path to create
    """
    os.makedirs(path, exist_ok=True)
    try:
        os.chmod(path, 0o777)
    except OSError as e:
        logger.debug(f"Could not set 777 permissions on {path}: {e}")


def parse_iso8601_duration(duration):
    """
    Parse ISO 8601 duration string (e.g., PT1H2M10S) to total seconds.

    Args:
        duration: ISO 8601 duration string (e.g., "PT1H2M10S", "PT30M", "PT45S")

    Returns:
        int: Total duration in seconds
    """
    pattern = r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?'
    match = re.match(pattern, duration)
    if not match:
        return 0

    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)

    return hours * 3600 + minutes * 60 + seconds


def download_thumbnail(url, save_path):
    """
    Download a thumbnail from URL to local path.

    Args:
        url: URL of the thumbnail to download
        save_path: Local file path to save the thumbnail

    Returns:
        bool: True if download succeeded, False otherwise
    """
    if not url:
        return False
    try:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        urllib.request.urlretrieve(url, save_path)
        return True
    except Exception:
        return False


def ensure_channel_thumbnail(channel_id, downloads_folder):
    """
    Ensure channel thumbnail exists, downloading if necessary.

    Args:
        channel_id: YouTube channel ID (e.g., 'UC0QuCui5pNF9k9fiNXkqn_w')
        downloads_folder: Base downloads folder path

    Returns:
        str or None: Relative thumbnail path (e.g., 'thumbnails/UC...jpg') if exists/downloaded, None otherwise
    """
    thumb_filename = f"{channel_id}.jpg"
    thumb_path = os.path.join(downloads_folder, 'thumbnails', thumb_filename)
    relative_path = os.path.join('thumbnails', thumb_filename)

    # Already exists
    if os.path.exists(thumb_path):
        return relative_path

    # Get real channel thumbnail URL via yt-dlp
    try:
        from scanner import get_channel_info
        channel_url = f"https://youtube.com/channel/{channel_id}"
        channel_info = get_channel_info(channel_url)
        if channel_info and channel_info.get('thumbnail'):
            if download_thumbnail(channel_info['thumbnail'], thumb_path):
                return relative_path
    except Exception as e:
        logger.debug(f"Failed to fetch channel thumbnail for {channel_id}: {e}")

    return None


def get_random_video_thumbnail(playlist_videos):
    """
    Get a random thumbnail URL from a list of playlist videos.

    Args:
        playlist_videos: List of PlaylistVideo objects

    Returns:
        str or None: Thumbnail URL of a random video, or None if no videos
    """
    if not playlist_videos:
        return None
    random_video = random.choice(playlist_videos).video
    return random_video.thumb_url if random_video else None


# =============================================================================
# Authentication Helpers
# =============================================================================

def get_stored_credentials(settings_manager):
    """Get stored username and password hash from database"""
    username = settings_manager.get('auth_username', 'admin')
    password_hash = settings_manager.get('auth_password_hash', generate_password_hash('admin'))
    return username, password_hash


def check_auth_credentials(settings_manager, username, password):
    """Validate username and password against stored credentials"""
    stored_username, stored_password_hash = get_stored_credentials(settings_manager)
    return username == stored_username and check_password_hash(stored_password_hash, password)


# =============================================================================
# Settings Manager
# =============================================================================

class SettingsManager:
    """
    Centralized settings manager with caching to reduce database queries.

    This manager provides a single interface for accessing application settings
    with automatic caching to minimize repeated database queries. Cache entries
    expire after a configurable TTL (default 5 seconds).

    Usage:
        settings = SettingsManager(session_factory)
        value = settings.get('some_key', default='fallback')
        enabled = settings.get_bool('auto_refresh_enabled')
        settings.set('some_key', 'new_value')
    """

    def __init__(self, session_factory, cache_ttl=5):
        self.session_factory = session_factory
        self.cache_ttl = cache_ttl
        self._cache = {}
        self._cache_time = {}
        self._lock = threading.Lock()

    def get(self, key, default=None):
        """Get setting value with caching."""
        with self._lock:
            if key in self._cache:
                if time.time() - self._cache_time[key] < self.cache_ttl:
                    return self._cache[key]

            session = self.session_factory()
            try:
                setting = session.query(Setting).filter(Setting.key == key).first()
                value = setting.value if setting else default
                self._cache[key] = value
                self._cache_time[key] = time.time()
                return value
            finally:
                session.close()

    def get_bool(self, key, default=False):
        """Get setting as boolean value."""
        value = self.get(key, 'true' if default else 'false')
        return value == 'true' if value is not None else default

    def get_int(self, key, default=0):
        """Get setting as integer value."""
        value = self.get(key, str(default))
        try:
            return int(value) if value is not None else default
        except (ValueError, TypeError):
            return default

    def set(self, key, value):
        """Set setting value and invalidate cache for this key."""
        session = self.session_factory()
        try:
            setting = session.query(Setting).filter(Setting.key == key).first()
            if setting:
                setting.value = str(value)
            else:
                setting = Setting(key=key, value=str(value))
                session.add(setting)
            session.commit()

            with self._lock:
                self._cache.pop(key, None)
                self._cache_time.pop(key, None)
        finally:
            session.close()

    def get_sponsorblock_categories(self):
        """Get list of enabled SponsorBlock categories."""
        categories = []
        if self.get_bool('sponsorblock_remove_sponsor'):
            categories.append('sponsor')
        if self.get_bool('sponsorblock_remove_selfpromo'):
            categories.append('selfpromo')
        if self.get_bool('sponsorblock_remove_interaction'):
            categories.append('interaction')
        return categories

    def invalidate(self, key=None):
        """Clear cache entries."""
        with self._lock:
            if key is None:
                self._cache.clear()
                self._cache_time.clear()
            else:
                self._cache.pop(key, None)
                self._cache_time.pop(key, None)


# =============================================================================
# Logging Configuration
# =============================================================================

# Custom API log level (between DEBUG=10 and INFO=20)
API_LEVEL = 15
logging.addLevelName(API_LEVEL, 'API')

def _api_log(self, message, *args, **kwargs):
    """Log API GET requests at API level."""
    if self.isEnabledFor(API_LEVEL):
        self._log(API_LEVEL, message, args, **kwargs)

logging.Logger.api = _api_log

# Logging configuration
LOG_DIR = 'logs'
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, 'app.log')
BACKUP_COUNT = 14  # Keep 2 weeks of daily logs
DEFAULT_LOG_LEVEL = 'INFO'

# Initialize settings manager for logging (uses its own DB session)
_engine, _Session = init_db()
_logging_settings = SettingsManager(_Session, cache_ttl=5)


def get_log_level_from_db():
    """Get the logging level from the database."""
    try:
        level = _logging_settings.get('log_level', DEFAULT_LOG_LEVEL)
        return level.upper() if level else DEFAULT_LOG_LEVEL
    except Exception as e:
        print(f'Failed to get log level from database: {e}')
        return DEFAULT_LOG_LEVEL


def set_log_level_in_db(level):
    """Set the logging level in the database."""
    try:
        _logging_settings.set('log_level', level.upper())
        return True
    except Exception as e:
        print(f'Failed to set log level in database: {e}')
        return False


def setup_logging():
    """Configure logging with rotating file handler."""
    log_level_str = get_log_level_from_db()

    if log_level_str == 'API':
        log_level = API_LEVEL
    else:
        log_level = getattr(logging, log_level_str, logging.INFO)

    file_handler = logging.handlers.TimedRotatingFileHandler(
        LOG_FILE,
        when='midnight',
        interval=1,
        backupCount=BACKUP_COUNT,
        encoding='utf-8'
    )

    formatter = logging.Formatter(
        '%(asctime)s - [%(levelname)s] - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers = []
    root_logger.addHandler(file_handler)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    return root_logger


def update_log_level(level):
    """Update the logging level at runtime."""
    level_str = level.upper()

    if level_str == 'API':
        log_level = API_LEVEL
    else:
        log_level = getattr(logging, level_str, logging.INFO)

    if set_log_level_in_db(level_str):
        root_logger = logging.getLogger()
        root_logger.setLevel(log_level)
        root_logger.info(f'Log level changed to {level_str}')
        return True
    return False


# Initialize logging when module is imported
logger = setup_logging()
