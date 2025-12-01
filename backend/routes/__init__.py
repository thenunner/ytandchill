"""
Backend API Routes

This package contains all Flask Blueprint route modules.
Each module handles a specific domain of the API.
"""

from .settings import settings_bp, init_settings_routes
from .queue import queue_bp, init_queue_routes
from .videos import videos_bp, init_videos_routes

# Future blueprints:
# from .channels import channels_bp, init_channels_routes
# from .library import library_bp, init_library_routes
# from .media import media_bp, init_media_routes


def register_blueprints(app, session_factory, settings_manager, scheduler, download_worker,
                        limiter=None, serialize_queue_item=None, get_current_operation=None,
                        serialize_video=None):
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
    """
    # Initialize and register settings blueprint
    init_settings_routes(session_factory, settings_manager, scheduler, download_worker)
    app.register_blueprint(settings_bp)

    # Initialize and register queue blueprint
    if serialize_queue_item and get_current_operation:
        init_queue_routes(session_factory, settings_manager, scheduler, download_worker,
                         limiter, serialize_queue_item, get_current_operation)
        app.register_blueprint(queue_bp)

    # Initialize and register videos blueprint
    if serialize_video:
        init_videos_routes(session_factory, limiter, serialize_video)
        app.register_blueprint(videos_bp)
