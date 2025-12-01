"""
Media Routes

Handles:
- GET /api/media/<path:filename> - Serve video/media files
"""

from flask import Blueprint, jsonify, send_from_directory
from werkzeug.utils import safe_join
import logging
import os

logger = logging.getLogger(__name__)

# Create Blueprint
media_bp = Blueprint('media', __name__)


# =============================================================================
# Media Endpoints
# =============================================================================

@media_bp.route('/api/media/<path:filename>')
def serve_media(filename):
    """Serve media files with path traversal protection and HTTP range request support"""
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

    # Enable HTTP 206 Partial Content support for fast video seeking
    return send_from_directory('downloads', filename, conditional=True)
