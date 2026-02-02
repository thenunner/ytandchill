"""
Backend API Routes

This package contains all Flask Blueprint route modules.
Each module handles a specific domain of the API.
"""

from .settings import settings_bp, init_settings_routes
from .queue import queue_bp, init_queue_routes
from .video_tools import video_tools_bp, init_video_tools_routes
from .media import media_bp, init_media_routes
from .videos import videos_bp, init_videos_routes
from .library import library_bp, init_library_routes
from .channels import channels_bp, init_channels_routes
from .import_videos import import_bp, init_import_routes


def register_blueprints(app, session_factory, settings_manager, scheduler, download_worker,
                        limiter=None, serialize_queue_item=None, get_current_operation=None,
                        serialize_video=None, set_operation=None,
                        clear_operation=None, parse_iso8601_duration=None,
                        serialize_category=None, serialize_playlist=None,
                        serialize_channel=None, queue_channel_scan=None):
    """
    Register all blueprints with the Flask app.

    Args:
        app: Flask application instance
        session_factory: SQLAlchemy session factory
        settings_manager: SettingsManager instance
        scheduler: AutoRefreshScheduler instance
        download_worker: DownloadWorker instance
        limiter: Flask-Limiter instance (for rate limiting)
        serialize_queue_item: Function to serialize queue items
        get_current_operation: Function to get current operation status
        serialize_video: Function to serialize video objects
        set_operation: Function to set current operation status
        clear_operation: Function to clear current operation status
        parse_iso8601_duration: Function to parse ISO 8601 duration strings
        serialize_category: Function to serialize category objects
        serialize_playlist: Function to serialize playlist objects
        serialize_channel: Function to serialize channel objects
        queue_channel_scan: Function to queue a channel scan
    """
    # Initialize and register settings blueprint
    init_settings_routes(session_factory, settings_manager, scheduler, download_worker)
    app.register_blueprint(settings_bp)

    # Initialize and register queue blueprint
    if serialize_queue_item and get_current_operation:
        init_queue_routes(session_factory, settings_manager, scheduler, download_worker,
                         limiter, serialize_queue_item, get_current_operation, serialize_channel)
        app.register_blueprint(queue_bp)

    # Initialize and register video_tools blueprint (video CRUD operations)
    if serialize_video:
        init_video_tools_routes(session_factory, limiter, serialize_video)
        app.register_blueprint(video_tools_bp)

    # Initialize and register media blueprint
    init_media_routes(session_factory)
    app.register_blueprint(media_bp)

    # Initialize and register videos blueprint (YouTube import - Videos tab)
    if set_operation and clear_operation and parse_iso8601_duration:
        init_videos_routes(session_factory, download_worker,
                          set_operation, clear_operation, parse_iso8601_duration,
                          settings_manager)
        app.register_blueprint(videos_bp)

    # Initialize and register library blueprint (playlists and categories)
    if serialize_category and serialize_playlist and serialize_video:
        init_library_routes(session_factory, limiter, serialize_category, serialize_playlist, serialize_video)
        app.register_blueprint(library_bp)

    # Initialize and register channels blueprint
    if serialize_channel and queue_channel_scan:
        init_channels_routes(session_factory, limiter, serialize_channel,
                            set_operation, clear_operation, queue_channel_scan,
                            settings_manager)
        app.register_blueprint(channels_bp)

    # Initialize and register import blueprint
    init_import_routes(session_factory, settings_manager)
    app.register_blueprint(import_bp)
