"""
Media Routes

Handles:
- GET /api/media/<path:filename> - Serve video/media files
"""

from flask import Blueprint, jsonify, send_from_directory, request, Response
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
    """Serve media files with path traversal protection and HTTP range request support for iOS"""
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

    # Get file size
    file_size = os.path.getsize(safe_path)

    # Check if this is a range request (required for iOS video playback)
    range_header = request.headers.get('Range', None)

    if not range_header:
        # No range request - send full file with Accept-Ranges header for iOS
        response = send_from_directory('downloads', filename, conditional=True)
        response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Content-Length'] = str(file_size)
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
        response = Response(generate(), 206, mimetype='video/mp4')
        response.headers['Content-Range'] = f'bytes {start}-{end}/{file_size}'
        response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Content-Length'] = str(length)
        response.headers['Cache-Control'] = 'public, max-age=3600'
        response.headers['Connection'] = 'keep-alive'

        logger.info(f"Serving range: {filename} bytes {start}-{end}/{file_size}")
        return response

    except Exception as e:
        logger.error(f"Error handling range request for {filename}: {e}")
        # Fallback to regular send if range parsing fails
        return send_from_directory('downloads', filename, conditional=True)
