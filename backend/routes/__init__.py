"""
Backend API Routes

This package contains all Flask Blueprint route modules.
Each module handles a specific domain of the API.
"""

from .settings import settings_bp, init_settings_routes

# Future blueprints:
# from .channels import channels_bp, init_channels_routes
# from .videos import videos_bp, init_videos_routes
# from .queue import queue_bp, init_queue_routes
# from .library import library_bp, init_library_routes
# from .media import media_bp, init_media_routes


def register_blueprints(app, session_factory, settings_manager, scheduler, download_worker):
    """
    Register all blueprints with the Flask app.

    Args:
        app: Flask application instance
        session_factory: SQLAlchemy session factory
        settings_manager: SettingsManager instance
        scheduler: AutoRefreshScheduler instance
        download_worker: DownloadWorker instance
    """
    # Initialize and register settings blueprint
    init_settings_routes(session_factory, settings_manager, scheduler, download_worker)
    app.register_blueprint(settings_bp)
