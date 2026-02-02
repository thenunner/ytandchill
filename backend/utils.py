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


def ensure_channel_thumbnail(channel_id, downloads_folder, api_key=None):
    """
    Ensure channel thumbnail exists, downloading if necessary.

    Uses YouTube API if api_key provided (fast), otherwise falls back to yt-dlp.

    Args:
        channel_id: YouTube channel ID (e.g., 'UC0QuCui5pNF9k9fiNXkqn_w')
        downloads_folder: Base downloads folder path
        api_key: Optional YouTube API key for faster fetching

    Returns:
        str or None: Relative thumbnail path (e.g., 'thumbnails/UC...jpg') if exists/downloaded, None otherwise
    """
    # Skip placeholder/special channel IDs that aren't real YouTube channels
    if not channel_id or channel_id.startswith('__') or channel_id == 'singles':
        return None

    thumb_filename = f"{channel_id}.jpg"
    thumb_path = os.path.join(downloads_folder, 'thumbnails', thumb_filename)
    relative_path = os.path.join('thumbnails', thumb_filename)

    # Already exists
    if os.path.exists(thumb_path):
        return relative_path

    thumb_url = None

    # Try YouTube API first (fast)
    if api_key:
        try:
            from youtube_api import fetch_channel_thumbnail
            thumb_url = fetch_channel_thumbnail(channel_id, api_key)
            if thumb_url:
                logger.info(f"Found channel thumbnail via API for {channel_id}")
        except Exception as e:
            logger.warning(f"API fetch failed for channel {channel_id}: {e}")

    # Fall back to yt-dlp if no API key or API failed
    if not thumb_url:
        try:
            from scanner import get_channel_info
            channel_url = f"https://youtube.com/channel/{channel_id}"
            channel_info = get_channel_info(channel_url)
            if channel_info and channel_info.get('thumbnail'):
                thumb_url = channel_info['thumbnail']
                logger.info(f"Found channel thumbnail via yt-dlp for {channel_id}")
        except Exception as e:
            logger.warning(f"yt-dlp fetch failed for channel {channel_id}: {e}")

    # Download the thumbnail if we found a URL
    if thumb_url:
        if download_thumbnail(thumb_url, thumb_path):
            logger.info(f"Downloaded channel thumbnail to {thumb_path}")
            return relative_path
        else:
            logger.warning(f"Failed to download channel thumbnail from {thumb_url}")
    else:
        logger.warning(f"No thumbnail found for channel {channel_id}")

    return None


def get_random_video_thumbnail(playlist_videos):
    """
    Get a random thumbnail URL from a list of playlist videos.

    This function properly converts local thumbnail paths to API URLs,
    using the same logic as serialize_video.

    Args:
        playlist_videos: List of PlaylistVideo objects

    Returns:
        str or None: Thumbnail URL of a random video, or None if no videos
    """
    if not playlist_videos:
        return None

    random_pv = random.choice(playlist_videos)
    video = random_pv.video
    if not video:
        return None

    # Convert local thumbnail path to URL, or construct from folder if not set
    # (same logic as serialize_video)
    if video.thumb_url:
        if video.thumb_url.startswith('http'):
            # YouTube URL - keep as fallback
            return video.thumb_url
        else:
            # Local path - convert to API URL
            normalized_path = video.thumb_url.replace('\\', '/')
            return f"/api/media/{normalized_path}"
    elif video.channel and video.yt_id:
        # Construct local path from channel folder and video ID
        folder = video.channel.folder_name
        local_path = f"{folder}/{video.yt_id}.jpg"
        return f"/api/media/{local_path}"

    return None


# =============================================================================
# SSL Certificate Generation
# =============================================================================

def ensure_ssl_certs(cert_dir='data/certs'):
    """Auto-generate self-signed SSL certs if they don't exist.

    Creates a self-signed certificate valid for 10 years with localhost
    and 127.0.0.1 as Subject Alternative Names.

    Args:
        cert_dir: Directory to store certificates (default: data/certs)

    Returns:
        tuple: (cert_path, key_path) as strings, or (None, None) if generation fails
    """
    from pathlib import Path

    cert_path = Path(cert_dir) / 'localhost.pem'
    key_path = Path(cert_dir) / 'localhost-key.pem'

    # Return existing certs if they exist
    if cert_path.exists() and key_path.exists():
        logger.info(f"Using existing SSL certificates from {cert_dir}")
        return str(cert_path), str(key_path)

    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from datetime import datetime, timedelta
        import ipaddress

        # Ensure directory exists
        Path(cert_dir).mkdir(parents=True, exist_ok=True)

        # Generate RSA private key
        key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048
        )

        # Build certificate subject/issuer
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, 'YT and Chill'),
            x509.NameAttribute(NameOID.COMMON_NAME, 'localhost'),
        ])

        # Subject Alternative Names for localhost access
        san_list = [
            x509.DNSName('localhost'),
            x509.IPAddress(ipaddress.IPv4Address('127.0.0.1')),
        ]

        # Build the certificate
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.utcnow())
            .not_valid_after(datetime.utcnow() + timedelta(days=365 * 10))  # 10 years
            .add_extension(
                x509.SubjectAlternativeName(san_list),
                critical=False
            )
            .add_extension(
                x509.BasicConstraints(ca=False, path_length=None),
                critical=True
            )
            .sign(key, hashes.SHA256())
        )

        # Write private key
        with open(key_path, 'wb') as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption()
            ))

        # Write certificate
        with open(cert_path, 'wb') as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))

        logger.info(f"Generated self-signed SSL certificates in {cert_dir}")
        logger.info("Note: Browser will show a security warning - click 'Advanced' -> 'Proceed' to accept")
        return str(cert_path), str(key_path)

    except ImportError:
        logger.warning("cryptography package not installed - SSL cert generation unavailable")
        logger.warning("Install with: pip install cryptography")
        return None, None
    except Exception as e:
        logger.error(f"Failed to generate SSL certificates: {e}")
        return None, None


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
LOG_DIR = os.environ.get('LOGS_DIR', 'logs')
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
