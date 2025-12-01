"""
Backend API Routes

This package contains all Flask Blueprint route modules.
Each module handles a specific domain of the API.
"""

from .settings import settings_bp, init_settings_routes
from .queue import queue_bp, init_queue_routes
from .video_tools import video_tools_bp, init_video_tools_routes
from .media import media_bp
from .videos import videos_bp, init_videos_routes

# Future blueprints:
# from .channels import channels_bp, init_channels_routes
# from .library import library_bp, init_library_routes


def register_blueprints(app, session_factory, settings_manager, scheduler, download_worker,
                        limiter=None, serialize_queue_item=None, get_current_operation=None,
                        serialize_video=None, get_youtube_client=None, set_operation=None,
                        clear_operation=None, parse_iso8601_duration=None):
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
        get_youtube_client: Function to get YouTube API client
        set_operation: Function to set current operation status
        clear_operation: Function to clear current operation status
        parse_iso8601_duration: Function to parse ISO 8601 duration strings
    """
    # Initialize and register settings blueprint
    init_settings_routes(session_factory, settings_manager, scheduler, download_worker)
    app.register_blueprint(settings_bp)

    # Initialize and register queue blueprint
    if serialize_queue_item and get_current_operation:
        init_queue_routes(session_factory, settings_manager, scheduler, download_worker,
                         limiter, serialize_queue_item, get_current_operation)
        app.register_blueprint(queue_bp)

    # Initialize and register video_tools blueprint (video CRUD operations)
    if serialize_video:
        init_video_tools_routes(session_factory, limiter, serialize_video)
        app.register_blueprint(video_tools_bp)

    # Register media blueprint (no init needed - stateless file serving)
    app.register_blueprint(media_bp)

    # Initialize and register videos blueprint (YouTube import - Videos tab)
    if get_youtube_client and set_operation and clear_operation and parse_iso8601_duration:
        init_videos_routes(session_factory, download_worker, get_youtube_client,
                          set_operation, clear_operation, parse_iso8601_duration)
        app.register_blueprint(videos_bp)
