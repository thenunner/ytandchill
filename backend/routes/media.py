"""
Media Routes

Handles:
- GET /api/media/<path:filename> - Serve video/media files
"""

from flask import Blueprint, send_from_directory, request, Response, jsonify
from werkzeug.utils import safe_join
import logging
import os
import mimetypes

logger = logging.getLogger(__name__)

# Create Blueprint
media_bp = Blueprint('media', __name__)


def get_downloads_folder():
    """Get the downloads folder path.

    Uses DOWNLOADS_DIR env var if set, otherwise defaults to 'downloads'.
    """
    return os.environ.get('DOWNLOADS_DIR', 'downloads')


# =============================================================================
# Media Endpoints
# =============================================================================

@media_bp.route('/api/media/<path:filename>')
def serve_media(filename):
    """Serve media files with path traversal protection and HTTP range request support for iOS"""
    downloads_folder = get_downloads_folder()

    # Validate and sanitize the path to prevent directory traversal
    safe_path = safe_join(downloads_folder, filename)
    if safe_path is None:
        logger.warning(f"Invalid path rejected by safe_join: {filename}")
        return jsonify({'error': 'File not found'}), 404

    # Normalize paths for consistent comparison (handles Windows backslashes)
    downloads_abs = os.path.normpath(os.path.abspath(downloads_folder))
    file_abs = os.path.normpath(os.path.abspath(safe_path))

    # Additional check: ensure the resolved path is actually within downloads directory
    if not file_abs.startswith(downloads_abs + os.sep) and file_abs != downloads_abs:
        logger.warning(f"Path traversal attempt blocked: {filename}")
        return jsonify({'error': 'Access denied'}), 403

    if not os.path.exists(safe_path):
        logger.warning(f"File not found: {safe_path}")
        return jsonify({'error': 'File not found'}), 404

    # Get file size and MIME type
    file_size = os.path.getsize(safe_path)
    mime_type, _ = mimetypes.guess_type(safe_path)
    if not mime_type:
        mime_type = 'video/mp4'  # Default fallback

    # Check if this is a range request (required for iOS video playback)
    range_header = request.headers.get('Range', None)

    if not range_header:
        # No range request - send full file with Accept-Ranges header for iOS
        response = send_from_directory(downloads_folder, filename, conditional=True, mimetype=mime_type)
        response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Content-Length'] = str(file_size)
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response

    # Parse range header (e.g., "bytes=0-1023")
    try:
        byte_range = range_header.replace('bytes=', '').split('-')
        start = int(byte_range[0]) if byte_range[0] else 0
        end = int(byte_range[1]) if len(byte_range) > 1 and byte_range[1] else file_size - 1

        # Ensure end doesn't exceed file size
        end = min(end, file_size - 1)
        length = end - start + 1

        # Generator function to stream file in chunks
        def generate():
            with open(safe_path, 'rb') as f:
                f.seek(start)
                remaining = length
                chunk_size = 8192  # 8KB chunks
                while remaining > 0:
                    chunk = f.read(min(chunk_size, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        # Create 206 Partial Content response with streaming
        response = Response(generate(), 206, mimetype=mime_type)
        response.headers['Content-Range'] = f'bytes {start}-{end}/{file_size}'
        response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Content-Length'] = str(length)
        response.headers['Content-Type'] = mime_type
        response.headers['Cache-Control'] = 'public, max-age=3600'
        # Connection header removed - WSGI servers (Waitress) manage this automatically per PEP 3333
        response.headers['Access-Control-Allow-Origin'] = '*'

        logger.info(f"Serving range: {filename} ({mime_type}) bytes {start}-{end}/{file_size}")
        return response

    except Exception as e:
        logger.error(f"Error handling range request for {filename}: {e}")
        # Fallback to regular send if range parsing fails
        response = send_from_directory(downloads_folder, filename, conditional=True, mimetype=mime_type)
        response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response
