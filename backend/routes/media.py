"""
Media Routes

Handles:
- GET /api/media/<path:filename> - Serve video/media files
- POST /api/thumbnails/batch - Batch fetch thumbnails as base64
"""

from flask import Blueprint, send_file, request, Response, jsonify
import logging
import os
import mimetypes
import base64

from database import Video, Channel, get_session

logger = logging.getLogger(__name__)

# Create Blueprint
media_bp = Blueprint('media', __name__)

# Module-level references to shared dependencies
_session_factory = None


def init_media_routes(session_factory):
    """Initialize the media routes with required dependencies."""
    global _session_factory
    _session_factory = session_factory


def get_downloads_folder():
    """Get the downloads folder path.

    Uses DOWNLOADS_DIR env var if set, otherwise defaults to 'downloads'.
    """
    return os.environ.get('DOWNLOADS_DIR', 'downloads')


# =============================================================================
# Media Endpoints
# =============================================================================

@media_bp.route('/api/media/<path:filename>')
@media_bp.route('/media/<path:filename>')
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

    # Get file stats for size, modification time, and ETag generation
    file_stat = os.stat(file_abs)
    file_size = file_stat.st_size
    file_mtime = int(file_stat.st_mtime)

    # Generate ETag from size and modification time (cache busting if file changes)
    etag = f'"{file_size}-{file_mtime}"'

    # Check If-None-Match header for cache validation
    if_none_match = request.headers.get('If-None-Match')
    if if_none_match and if_none_match == etag:
        # File hasn't changed - return 304 Not Modified
        return Response(status=304, headers={
            'ETag': etag,
            'Cache-Control': 'no-cache'
        })

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
        response.headers['ETag'] = etag

        # Add cache headers based on content type
        if mime_type and mime_type.startswith('image/'):
            if filename.startswith('thumbnails/'):
                # Channel thumbnails rarely change - cache for 1 week
                response.headers['Cache-Control'] = 'public, max-age=604800'
            else:
                # Video thumbnails - cache for 1 day
                response.headers['Cache-Control'] = 'public, max-age=86400'
        elif mime_type and mime_type.startswith('video/'):
            # Video files - always revalidate with ETag (handles re-downloads and SponsorBlock cuts)
            response.headers['Cache-Control'] = 'no-cache'

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
                chunk_size = 1048576  # 1MB chunks for faster video streaming
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
        response.headers['Cache-Control'] = 'no-cache'
        response.headers['ETag'] = etag
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
        response.headers['ETag'] = etag
        response.headers['Cache-Control'] = 'no-cache'
        return response


@media_bp.route('/api/thumbnails/batch', methods=['POST'])
def batch_thumbnails():
    """Return multiple thumbnails as base64 data URLs in one request.

    This reduces HTTP connections from N (one per thumbnail) to 1,
    preventing connection exhaustion on HTTP/1.1's 6-connection limit.

    Supports both video_ids and channel_ids in the request body.
    """
    data = request.json
    if not data:
        return jsonify({}), 200

    video_ids = data.get('video_ids', [])
    channel_ids = data.get('channel_ids', [])

    if not video_ids and not channel_ids:
        return jsonify({}), 200

    # Limit to prevent abuse (50 thumbnails * ~20KB = ~1MB response)
    video_ids = video_ids[:50]
    channel_ids = channel_ids[:50]

    result = {}
    downloads_folder = get_downloads_folder()
    downloads_abs = os.path.normpath(os.path.abspath(downloads_folder))

    def is_safe_path(path):
        """Validate path stays within downloads folder (path traversal protection)"""
        abs_path = os.path.normpath(os.path.abspath(path))
        return abs_path.startswith(downloads_abs + os.sep) or abs_path == downloads_abs

    with get_session(_session_factory) as session:
        # Batch query videos
        if video_ids:
            videos = session.query(Video).filter(Video.id.in_(video_ids)).all()

            for video in videos:
                thumb_path = None

                # Determine thumbnail path based on thumb_url or construct from channel/yt_id
                if video.thumb_url:
                    if video.thumb_url.startswith('http'):
                        # External URL - skip, let browser fetch directly
                        continue
                    else:
                        # Local path - normalize and construct full path
                        relative_path = video.thumb_url.replace('/api/media/', '').replace('\\', '/')
                        thumb_path = os.path.join(downloads_folder, relative_path)
                elif video.channel and video.yt_id:
                    # Construct from channel folder + video ID
                    thumb_path = os.path.join(downloads_folder, video.channel.folder_name, f"{video.yt_id}.jpg")

                if thumb_path and is_safe_path(thumb_path) and os.path.exists(thumb_path):
                    try:
                        with open(thumb_path, 'rb') as f:
                            encoded = base64.b64encode(f.read()).decode('utf-8')
                            result[video.id] = f'data:image/jpeg;base64,{encoded}'
                    except Exception as e:
                        logger.debug(f"Failed to read thumbnail {thumb_path}: {e}")
                elif thumb_path and not is_safe_path(thumb_path):
                    logger.warning(f"Path traversal blocked in batch thumbnail: {thumb_path}")

        # Batch query channels
        if channel_ids:
            channels = session.query(Channel).filter(Channel.id.in_(channel_ids)).all()

            for channel in channels:
                if channel.thumbnail:
                    # Channel thumbnails stored as relative path like "thumbnails/UCxxx.jpg"
                    thumb_path = os.path.join(downloads_folder, channel.thumbnail.replace('\\', '/'))

                    if is_safe_path(thumb_path) and os.path.exists(thumb_path):
                        try:
                            with open(thumb_path, 'rb') as f:
                                encoded = base64.b64encode(f.read()).decode('utf-8')
                                result[f'channel_{channel.id}'] = f'data:image/jpeg;base64,{encoded}'
                        except Exception as e:
                            logger.debug(f"Failed to read channel thumbnail {thumb_path}: {e}")
                    elif not is_safe_path(thumb_path):
                        logger.warning(f"Path traversal blocked in batch channel thumbnail: {thumb_path}")

    return jsonify(result)
