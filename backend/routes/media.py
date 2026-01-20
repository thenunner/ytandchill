"""
Media Routes

Handles:
- GET /api/media/<path:filename> - Serve video/media files
"""

from flask import Blueprint, send_file, request, Response, jsonify
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

    # Convert URL forward slashes to OS path separator (important for Windows)
    filename_normalized = filename.replace('/', os.sep)

    # Build the full path manually to handle Windows paths correctly
    safe_path = os.path.normpath(os.path.join(downloads_folder, filename_normalized))

    # Normalize paths for consistent comparison
    downloads_abs = os.path.normpath(os.path.abspath(downloads_folder))
    file_abs = os.path.normpath(os.path.abspath(safe_path))

    logger.debug(f"Media request: filename={filename}, normalized={filename_normalized}")
    logger.debug(f"Paths: downloads_abs={downloads_abs}, file_abs={file_abs}")

    # Security check: ensure the resolved path is actually within downloads directory
    if not file_abs.startswith(downloads_abs + os.sep) and file_abs != downloads_abs:
        logger.warning(f"Path traversal attempt blocked: {filename}")
        return jsonify({'error': 'Access denied'}), 403

    if not os.path.exists(file_abs):
        logger.warning(f"File not found: {file_abs}")
        return jsonify({'error': 'File not found'}), 404

    # Get file size and MIME type
    file_size = os.path.getsize(file_abs)
    mime_type, _ = mimetypes.guess_type(file_abs)
    if not mime_type:
        mime_type = 'video/mp4'  # Default fallback

    # Check if this is a range request (required for iOS video playback)
    range_header = request.headers.get('Range', None)

    if not range_header:
        # No range request - send full file with Accept-Ranges header for iOS
        response = send_file(file_abs, mimetype=mime_type, conditional=True)
        response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Content-Length'] = str(file_size)
        response.headers['Access-Control-Allow-Origin'] = '*'

        # Add cache headers for images (thumbnails)
        if mime_type and mime_type.startswith('image/'):
            if filename.startswith('thumbnails/'):
                # Channel thumbnails rarely change - cache for 1 week
                response.headers['Cache-Control'] = 'public, max-age=604800'
            else:
                # Video thumbnails - cache for 1 day
                response.headers['Cache-Control'] = 'public, max-age=86400'

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
            with open(file_abs, 'rb') as f:
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
        response = send_file(file_abs, mimetype=mime_type, conditional=True)
        response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response
