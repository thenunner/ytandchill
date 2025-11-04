import logging
import logging.handlers
import os
from models import init_db, Setting

# Define custom API log level (between DEBUG=10 and INFO=20)
# This allows filtering API calls separately from regular INFO messages
API_LEVEL = 15
logging.addLevelName(API_LEVEL, 'API')

def api(self, message, *args, **kwargs):
    """Log API GET requests at API level"""
    if self.isEnabledFor(API_LEVEL):
        self._log(API_LEVEL, message, args, **kwargs)

# Add the API method to the Logger class
logging.Logger.api = api


# Logging directory
LOG_DIR = 'logs'
os.makedirs(LOG_DIR, exist_ok=True)

# Log file configuration
LOG_FILE = os.path.join(LOG_DIR, 'app.log')
MAX_BYTES = 50 * 1024 * 1024  # 50 MB
BACKUP_COUNT = 2  # 3 files total (current + 2 backups)

# Default logging level
DEFAULT_LOG_LEVEL = 'INFO'

def get_log_level_from_db():
    """Get the logging level from the database."""
    try:
        engine, Session = init_db()
        session = Session()
        setting = session.query(Setting).filter(Setting.key == 'log_level').first()
        session.close()

        if setting and setting.value:
            return setting.value.upper()
    except Exception as e:
        print(f'Failed to get log level from database: {e}')

    return DEFAULT_LOG_LEVEL

def set_log_level_in_db(level):
    """Set the logging level in the database."""
    try:
        engine, Session = init_db()
        session = Session()

        setting = session.query(Setting).filter(Setting.key == 'log_level').first()
        if setting:
            setting.value = level.upper()
        else:
            setting = Setting(key='log_level', value=level.upper())
            session.add(setting)

        session.commit()
        session.close()
        return True
    except Exception as e:
        print(f'Failed to set log level in database: {e}')
        return False

def setup_logging():
    """Configure logging with rotating file handler."""
    # Get log level from database
    log_level_str = get_log_level_from_db()

    # Handle custom API level
    if log_level_str == 'API':
        log_level = API_LEVEL
    else:
        log_level = getattr(logging, log_level_str, logging.INFO)

    # Create rotating file handler
    file_handler = logging.handlers.RotatingFileHandler(
        LOG_FILE,
        maxBytes=MAX_BYTES,
        backupCount=BACKUP_COUNT,
        encoding='utf-8'
    )

    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Remove existing handlers to avoid duplicates
    root_logger.handlers = []

    # Add file handler
    root_logger.addHandler(file_handler)

    # Also add console handler for development
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    return root_logger

def update_log_level(level):
    """Update the logging level at runtime."""
    level_str = level.upper()

    # Handle custom API level
    if level_str == 'API':
        log_level = API_LEVEL
    else:
        log_level = getattr(logging, level_str, logging.INFO)

    # Update database
    if set_log_level_in_db(level_str):
        # Update runtime logging level
        root_logger = logging.getLogger()
        root_logger.setLevel(log_level)
        return True

    return False

# Initialize logging when module is imported
logger = setup_logging()
