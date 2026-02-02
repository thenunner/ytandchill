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
    """Serve media files with range request support via Flask's send_file.

    Uses Flask/Werkzeug's native range request handling which leverages
    OS-level sendfile() for much faster large file transfers.
    """
    downloads_folder = get_downloads_folder()

    # Convert URL forward slashes to OS path separator
    filename_normalized = filename.replace('/', os.sep)
    safe_path = os.path.normpath(os.path.join(downloads_folder, filename_normalized))

    # Security check
    downloads_abs = os.path.normpath(os.path.abspath(downloads_folder))
    file_abs = os.path.normpath(os.path.abspath(safe_path))

    if not file_abs.startswith(downloads_abs + os.sep) and file_abs != downloads_abs:
        logger.warning(f"Path traversal attempt blocked: {filename}")
        return jsonify({'error': 'Access denied'}), 403

    if not os.path.exists(file_abs):
        logger.warning(f"File not found: {file_abs}")
        return jsonify({'error': 'File not found'}), 404

    mime_type, _ = mimetypes.guess_type(file_abs)
    if not mime_type:
        mime_type = 'video/mp4'

    # Let Flask handle range requests natively (uses sendfile for speed)
    response = send_file(
        file_abs,
        mimetype=mime_type,
        conditional=True  # Enables range requests + ETag/If-Modified-Since
    )

    # Add CORS and cache headers
    response.headers['Accept-Ranges'] = 'bytes'
    response.headers['Access-Control-Allow-Origin'] = '*'

    if mime_type.startswith('image/'):
        response.headers['Cache-Control'] = 'public, max-age=604800'  # 1 week
    else:
        response.headers['Cache-Control'] = 'public, max-age=86400'  # 1 day

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

                if thumb_path and os.path.exists(thumb_path):
                    try:
                        with open(thumb_path, 'rb') as f:
                            encoded = base64.b64encode(f.read()).decode('utf-8')
                            result[video.id] = f'data:image/jpeg;base64,{encoded}'
                    except Exception as e:
                        logger.debug(f"Failed to read thumbnail {thumb_path}: {e}")

        # Batch query channels
        if channel_ids:
            channels = session.query(Channel).filter(Channel.id.in_(channel_ids)).all()

            for channel in channels:
                if channel.thumbnail:
                    # Channel thumbnails stored as relative path like "thumbnails/UCxxx.jpg"
                    thumb_path = os.path.join(downloads_folder, channel.thumbnail.replace('\\', '/'))

                    if os.path.exists(thumb_path):
                        try:
                            with open(thumb_path, 'rb') as f:
                                encoded = base64.b64encode(f.read()).decode('utf-8')
                                result[f'channel_{channel.id}'] = f'data:image/jpeg;base64,{encoded}'
                        except Exception as e:
                            logger.debug(f"Failed to read channel thumbnail {thumb_path}: {e}")

    return jsonify(result)
