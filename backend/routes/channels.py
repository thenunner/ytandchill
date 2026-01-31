"""
Channels Routes

Handles:
- GET/POST /api/channels - List/create channels
- PATCH/DELETE /api/channels/<id> - Update/delete channel
- POST /api/channels/<id>/scan - Queue channel scan
- GET/POST /api/channel-categories - List/create channel categories
- PATCH/DELETE /api/channel-categories/<id> - Update/delete channel category
"""

from flask import Blueprint, jsonify, request
from datetime import datetime, timezone
from sqlalchemy.orm import joinedload
import logging
import os

from database import Channel, Video, Playlist, ChannelCategory, get_session
from utils import download_thumbnail, sanitize_folder_name
from scanner import resolve_channel_from_url, get_channel_info
from youtube_api import fetch_channel_thumbnail
from events import queue_events

logger = logging.getLogger(__name__)

# Create Blueprint
channels_bp = Blueprint('channels', __name__)

# Module-level references to shared dependencies
_session_factory = None
_limiter = None
_serialize_channel = None
_set_operation = None
_clear_operation = None
_queue_channel_scan = None
_settings_manager = None


def init_channels_routes(session_factory, limiter, serialize_channel,
                         set_operation, clear_operation, queue_channel_scan,
                         settings_manager=None):
    """Initialize the channels routes with required dependencies."""
    global _session_factory, _limiter, _serialize_channel
    global _set_operation, _clear_operation, _queue_channel_scan, _settings_manager
    _session_factory = session_factory
    _limiter = limiter
    _serialize_channel = serialize_channel
    _set_operation = set_operation
    _clear_operation = clear_operation
    _queue_channel_scan = queue_channel_scan
    _settings_manager = settings_manager


# =============================================================================
# Channel Endpoints
# =============================================================================

@channels_bp.route('/api/channels', methods=['GET'])
def get_channels():
    with get_session(_session_factory) as session:
        # Filter out soft-deleted channels - eager load videos to avoid N+1 queries
        channels = session.query(Channel).options(joinedload(Channel.videos)).filter(Channel.deleted_at.is_(None)).all()
        result = [_serialize_channel(c) for c in channels]
        return jsonify(result)


@channels_bp.route('/api/channels', methods=['POST'])
def create_channel():
    data = request.json

    if not data or 'url' not in data:
        return jsonify({'error': 'URL is required'}), 400

    try:
        _set_operation('adding_channel', 'Fetching channel information...')

        # Resolve channel from URL using yt-dlp
        channel_info = resolve_channel_from_url(data['url'])

        if not channel_info:
            _clear_operation()
            return jsonify({'error': 'Could not resolve channel from URL'}), 400

        channel_id = channel_info['id']

        with get_session(_session_factory) as session:
            # Check if already exists
            existing = session.query(Channel).filter(Channel.yt_id == channel_id).first()
            if existing:
                # If soft-deleted, restore it and queue a full scan
                if existing.deleted_at is not None:
                    existing.deleted_at = None
                    # Update duration filters if provided
                    existing.min_minutes = data.get('min_minutes', 0)
                    existing.max_minutes = data.get('max_minutes', 0)

                    # Refresh channel info and thumbnail
                    try:
                        restored_info = get_channel_info(f'https://youtube.com/channel/{existing.yt_id}')
                        if restored_info:
                            existing.title = restored_info['title']

                            # Delete old thumbnail file first to ensure fresh download
                            if existing.thumbnail:
                                downloads_dir = os.environ.get('DOWNLOADS_DIR', 'downloads')
                                old_thumb_path = os.path.join(downloads_dir, existing.thumbnail)
                                if os.path.exists(old_thumb_path):
                                    try:
                                        os.remove(old_thumb_path)
                                        logger.debug(f"Deleted old thumbnail: {old_thumb_path}")
                                    except Exception as e:
                                        logger.warning(f"Could not delete old thumbnail: {e}")

                            # Try to get thumbnail from YouTube API first
                            thumbnail_url = None
                            if _settings_manager:
                                api_key = _settings_manager.get('youtube_api_key')
                                if api_key:
                                    api_thumbnail = fetch_channel_thumbnail(existing.yt_id, api_key)
                                    if api_thumbnail:
                                        thumbnail_url = api_thumbnail
                                        logger.info(f"Got channel avatar from YouTube API for {existing.yt_id}")

                            # Fall back to yt-dlp thumbnail
                            if not thumbnail_url and restored_info.get('thumbnail'):
                                thumbnail_url = restored_info['thumbnail']
                                logger.debug(f"Using yt-dlp thumbnail for {existing.yt_id}")

                            # Re-download thumbnail
                            if thumbnail_url:
                                thumbnail_filename = f"{existing.yt_id}.jpg"
                                downloads_dir = os.environ.get('DOWNLOADS_DIR', 'downloads')
                                local_file_path = os.path.join(downloads_dir, 'thumbnails', thumbnail_filename)
                                if download_thumbnail(thumbnail_url, local_file_path):
                                    existing.thumbnail = os.path.join('thumbnails', thumbnail_filename)
                                    logger.info(f"Re-downloaded thumbnail for restored channel: {existing.title}")
                    except Exception as e:
                        logger.warning(f"Could not refresh channel info during restore: {e}")

                    session.commit()

                    # Queue a full scan to rediscover videos
                    _queue_channel_scan(existing.id, force_full=True, is_batch_start=True, batch_label=existing.title)
                    logger.info(f"Restored soft-deleted channel: {existing.title} (ID: {existing.id}) and queued full scan")

                    # Don't clear_operation - let scan completion set scan_complete status
                    return jsonify({
                        'id': existing.id,
                        'yt_id': existing.yt_id,
                        'title': existing.title,
                        'restored': True,
                        'scan_result': {'status': 'queued'}
                    }), 200
                else:
                    _clear_operation()
                    return jsonify({'error': 'Channel already exists'}), 400

            # channel_info already populated from resolve_channel_from_url above

            # Create folder name (Windows-safe)
            folder_name = sanitize_folder_name(channel_info['title'])

            # Try to get channel avatar from YouTube API first (higher quality)
            thumbnail_url = None
            if _settings_manager:
                api_key = _settings_manager.get('youtube_api_key')
                if api_key:
                    api_thumbnail = fetch_channel_thumbnail(channel_id, api_key)
                    if api_thumbnail:
                        thumbnail_url = api_thumbnail
                        logger.debug(f'Got channel thumbnail from YouTube API for {channel_id}')

            # Fall back to yt-dlp thumbnail if API didn't provide one
            if not thumbnail_url and channel_info.get('thumbnail'):
                thumbnail_url = channel_info['thumbnail']
                logger.debug(f'Using yt-dlp thumbnail for {channel_id}')

            # Download channel thumbnail locally
            thumbnail_path = None
            if thumbnail_url:
                thumbnail_filename = f"{channel_id}.jpg"
                downloads_dir = os.environ.get('DOWNLOADS_DIR', 'downloads')
                local_file_path = os.path.join(downloads_dir, 'thumbnails', thumbnail_filename)
                if download_thumbnail(thumbnail_url, local_file_path):
                    # Store relative path (without 'downloads/' prefix) since media endpoint serves from downloads/
                    thumbnail_path = os.path.join('thumbnails', thumbnail_filename)
                    logger.debug(f'Downloaded channel thumbnail for {channel_id}')

            channel = Channel(
                yt_id=channel_id,
                title=channel_info['title'],
                thumbnail=thumbnail_path,  # Store local path instead of YouTube URL
                folder_name=folder_name,
                min_minutes=data.get('min_minutes', 0),
                max_minutes=data.get('max_minutes', 0)
            )
            session.add(channel)
            session.commit()

            # Queue initial full scan of the channel (runs in background)
            # force_full=True ensures we get the entire channel history
            # is_batch_start=True ensures scan_complete is set when done
            _queue_channel_scan(channel.id, force_full=True, is_batch_start=True, batch_label=channel.title)
            logger.info(f"Queued initial full scan for new channel: {channel.title} (ID: {channel.id})")

            # Don't clear_operation - let scan completion set scan_complete status
            result = _serialize_channel(channel)
            result['scan_result'] = {
                'message': 'Initial scan queued',
                'status': 'queued'
            }
            return jsonify(result), 201

    except Exception as e:
        _clear_operation()
        logger.error(f'Error adding channel: {str(e)}', exc_info=True)
        return jsonify({'error': 'An error occurred while adding the channel'}), 500


@channels_bp.route('/api/channels/<int:channel_id>', methods=['PATCH'])
def update_channel(channel_id):
    data = request.json

    with get_session(_session_factory) as session:
        channel = session.query(Channel).filter(Channel.id == channel_id).first()
        if not channel:
            return jsonify({'error': 'Channel not found'}), 404

        if 'min_minutes' in data:
            old_min = channel.min_minutes
            channel.min_minutes = int(data['min_minutes'] or 0)
            if channel.min_minutes != old_min:
                logger.info(f"Duration filter updated for '{channel.title}': min_minutes {old_min} -> {channel.min_minutes}")
        if 'max_minutes' in data:
            old_max = channel.max_minutes
            channel.max_minutes = int(data['max_minutes'] or 0)
            if channel.max_minutes != old_max:
                logger.info(f"Duration filter updated for '{channel.title}': max_minutes {old_max} -> {channel.max_minutes}")
        if 'auto_download' in data:
            old_value = channel.auto_download
            channel.auto_download = bool(data['auto_download'])
            if channel.auto_download != old_value:
                if channel.auto_download:
                    logger.info(f"Auto-download enabled for channel '{channel.title}'")
                else:
                    logger.info(f"Auto-download disabled for channel '{channel.title}'")
        if 'folder_name' in data:
            channel.folder_name = data['folder_name']
        if 'category_id' in data:
            # Allow None to uncategorize
            new_category_id = data['category_id']
            if new_category_id is not None:
                # Verify category exists
                category = session.query(ChannelCategory).filter(ChannelCategory.id == new_category_id).first()
                if not category:
                    return jsonify({'error': 'Category not found'}), 404
            channel.category_id = new_category_id

        channel.updated_at = datetime.now(timezone.utc)
        session.commit()

        result = _serialize_channel(channel)
        return jsonify(result)


@channels_bp.route('/api/channels/<int:channel_id>', methods=['DELETE'])
def delete_channel(channel_id):
    with get_session(_session_factory) as session:
        channel = session.query(Channel).filter(Channel.id == channel_id).first()

        if not channel:
            return jsonify({'error': 'Channel not found'}), 404

        # Soft delete: mark channel as deleted instead of removing
        # Keep all videos (discovered, ignored, library) to preserve user's work
        # Videos will be re-matched when channel is re-added
        channel.deleted_at = datetime.now(timezone.utc)

        # Also clean up any channel-specific playlists
        session.query(Playlist).filter(Playlist.channel_id == channel_id).delete()

        session.commit()

        return '', 204


@channels_bp.route('/api/channels/<int:channel_id>/visited', methods=['POST'])
def mark_channel_visited(channel_id):
    """Mark channel as visited (for new videos badge in Library)"""
    with get_session(_session_factory) as session:
        channel = session.query(Channel).filter(Channel.id == channel_id).first()

        if not channel:
            return jsonify({'error': 'Channel not found'}), 404

        channel.last_visited_at = datetime.now(timezone.utc)
        session.commit()

        # Emit SSE event to sync all browser tabs
        queue_events.emit('channels:changed')

        return jsonify({'success': True})


@channels_bp.route('/api/channels/<int:channel_id>/favorite', methods=['POST'])
def toggle_channel_favorite(channel_id):
    """Toggle favorite status for a channel"""
    with get_session(_session_factory) as session:
        channel = session.query(Channel).filter(Channel.id == channel_id).first()

        if not channel:
            return jsonify({'error': 'Channel not found'}), 404

        if channel.deleted_at is not None:
            return jsonify({'error': 'Cannot favorite deleted channel'}), 400

        # Toggle the favorite status
        channel.is_favorite = not channel.is_favorite
        session.commit()

        logger.info(f"Channel '{channel.title}' favorite toggled to {channel.is_favorite}")

        # Emit SSE event to sync all browser tabs
        queue_events.emit('channels:changed')

        return jsonify({
            'success': True,
            'is_favorite': channel.is_favorite
        })


@channels_bp.route('/api/channels/favorites', methods=['GET'])
def get_favorite_channels():
    """Get all favorite channels for sidebar (optimized).

    Uses SQL aggregation instead of loading all videos for better performance.

    Sorting priority:
    1. Channels with new (unwatched) videos first
    2. Then by total library video count (most videos first)
    """
    from sqlalchemy import func, case

    with get_session(_session_factory) as session:
        # Subquery for video counts using SQL aggregation
        video_counts = session.query(
            Video.channel_id,
            func.count(case((Video.status == 'library', 1))).label('downloaded_count'),
            func.count(case((
                (Video.status == 'library') &
                (Video.downloaded_at > Channel.last_visited_at),
                1
            ))).label('new_video_count')
        ).join(Channel).group_by(Video.channel_id).subquery()

        # Get favorite channels with counts
        channels = session.query(
            Channel,
            func.coalesce(video_counts.c.downloaded_count, 0).label('downloaded_count'),
            func.coalesce(video_counts.c.new_video_count, 0).label('new_video_count')
        ).outerjoin(
            video_counts, Channel.id == video_counts.c.channel_id
        ).filter(
            Channel.is_favorite == True,
            Channel.deleted_at.is_(None)
        ).all()

        result = []
        for channel, downloaded_count, new_video_count in channels:
            # Convert thumbnail path to URL
            thumbnail_url = None
            if channel.thumbnail:
                if channel.thumbnail.startswith('http'):
                    thumbnail_url = channel.thumbnail
                else:
                    normalized_path = channel.thumbnail.replace('\\', '/')
                    thumbnail_url = f"/api/media/{normalized_path}"

            # If never visited, all downloaded videos are "new"
            if channel.last_visited_at is None:
                new_video_count = downloaded_count

            result.append({
                'id': channel.id,
                'title': channel.title,
                'thumbnail': thumbnail_url,
                'downloaded_count': downloaded_count,
                'has_new_videos': new_video_count > 0
            })

        # Sort: channels with new videos first, then by downloaded_count (most videos)
        result.sort(key=lambda c: (
            -1 if c.get('has_new_videos', False) else 0,
            -c.get('downloaded_count', 0),
            c.get('title', '').lower()
        ))

        return jsonify(result)


@channels_bp.route('/api/channels/favorites/videos', methods=['GET'])
def get_favorite_videos():
    """Get all videos from favorite channels for Favs screen"""
    # Optional channel filter
    channel_id = request.args.get('channel_id', type=int)

    with get_session(_session_factory) as session:
        # Build query for videos from favorite channels
        query = session.query(Video).join(Channel).filter(
            Channel.is_favorite == True,
            Channel.deleted_at.is_(None),
            Video.status == 'library'
        )

        # Apply channel filter if provided
        if channel_id:
            query = query.filter(Video.channel_id == channel_id)

        # Order by downloaded_at descending (newest first)
        videos = query.order_by(Video.downloaded_at.desc()).all()

        # Serialize videos
        result = []
        for video in videos:
            channel = video.channel

            # Convert thumb_url to proper URL (same logic as serialize_video in app.py)
            thumb_url = None
            if video.thumb_url:
                if video.thumb_url.startswith('http'):
                    thumb_url = video.thumb_url
                else:
                    normalized_path = video.thumb_url.replace('\\', '/')
                    thumb_url = f"/api/media/{normalized_path}"

            result.append({
                'id': video.id,
                'yt_id': video.yt_id,
                'title': video.title,
                'status': video.status,
                'duration_sec': video.duration_sec,
                'thumb_url': thumb_url,
                'file_path': video.file_path,
                'file_size_bytes': video.file_size_bytes,
                'downloaded_at': video.downloaded_at.isoformat() if video.downloaded_at else None,
                'upload_date': video.upload_date,
                'watched': video.watched,
                'channel': {
                    'id': channel.id,
                    'title': channel.title,
                    'thumbnail': channel.thumbnail
                } if channel else None
            })

        return jsonify(result)


@channels_bp.route('/api/channels/<int:channel_id>/refresh-thumbnail', methods=['POST'])
def refresh_channel_thumbnail(channel_id):
    """Refresh a channel's thumbnail from YouTube API"""
    with get_session(_session_factory) as session:
        channel = session.query(Channel).filter(Channel.id == channel_id).first()

        if not channel:
            return jsonify({'error': 'Channel not found'}), 404

        if channel.deleted_at is not None:
            return jsonify({'error': 'Cannot refresh deleted channel'}), 400

        # Delete old thumbnail file
        downloads_dir = os.environ.get('DOWNLOADS_DIR', 'downloads')
        if channel.thumbnail:
            old_thumb_path = os.path.join(downloads_dir, channel.thumbnail)
            if os.path.exists(old_thumb_path):
                try:
                    os.remove(old_thumb_path)
                    logger.debug(f"Deleted old thumbnail: {old_thumb_path}")
                except Exception as e:
                    logger.warning(f"Could not delete old thumbnail: {e}")

        # Try to get thumbnail from YouTube API first
        thumbnail_url = None
        if _settings_manager:
            api_key = _settings_manager.get('youtube_api_key')
            if api_key:
                api_thumbnail = fetch_channel_thumbnail(channel.yt_id, api_key)
                if api_thumbnail:
                    thumbnail_url = api_thumbnail

        # Fall back to yt-dlp if API didn't provide one
        if not thumbnail_url:
            channel_info = get_channel_info(f'https://youtube.com/channel/{channel.yt_id}')
            if channel_info and channel_info.get('thumbnail'):
                thumbnail_url = channel_info['thumbnail']

        # Download new thumbnail
        if thumbnail_url:
            thumbnail_filename = f"{channel.yt_id}.jpg"
            local_file_path = os.path.join(downloads_dir, 'thumbnails', thumbnail_filename)
            if download_thumbnail(thumbnail_url, local_file_path):
                channel.thumbnail = os.path.join('thumbnails', thumbnail_filename)
                session.commit()
                return jsonify({'success': True, 'thumbnail': channel.thumbnail}), 200

        return jsonify({'error': 'Could not fetch new thumbnail'}), 500


@channels_bp.route('/api/channels/<int:channel_id>/scan', methods=['POST'])
def scan_channel(channel_id):
    """Queue a channel scan (runs in background)"""
    with get_session(_session_factory) as session:
        channel = session.query(Channel).filter(Channel.id == channel_id).first()

        if not channel:
            logger.debug(f"Scan requested for non-existent channel ID: {channel_id}")
            return jsonify({'error': 'Channel not found'}), 404

        # Prevent scanning deleted channels
        if channel.deleted_at is not None:
            logger.warning(f"Scan requested for deleted channel: {channel.title} (ID: {channel_id})")
            return jsonify({'error': 'Cannot scan deleted channel'}), 400

        # Get scan parameters
        data = request.get_json() or {}
        force_full = data.get('force_full', False)
        is_batch_start = data.get('is_batch_start', False)
        is_auto_scan = data.get('is_auto_scan', False)
        batch_label = data.get('batch_label', channel.title)

        # Try to queue the channel
        result = _queue_channel_scan(
            channel_id,
            force_full,
            is_batch_start=is_batch_start,
            is_auto_scan=is_auto_scan,
            batch_label=batch_label
        )

        scan_type = "full" if force_full else "incremental"

        if result == True:
            logger.debug(f"Queued {scan_type} scan for channel: {channel.title} (ID: {channel_id})")
            return jsonify({'status': 'queued', 'message': f'Scan queued for {channel.title}'}), 202
        elif result == 'pending':
            logger.debug(f"Auto-scan queued for later: {channel.title} (ID: {channel_id})")
            return jsonify({'status': 'auto_scan_pending', 'message': 'Auto-scan queued for after current batch'}), 202
        else:
            # result is False - batch in progress or already queued
            logger.debug(f"Scan rejected for channel {channel.title} (ID: {channel_id}) - batch in progress or already queued")
            return jsonify({'status': 'batch_in_progress', 'message': 'A scan is already running. Please wait.'}), 409


# =============================================================================
# Channel Category Endpoints
# =============================================================================

@channels_bp.route('/api/channel-categories', methods=['GET'])
def get_channel_categories():
    """Get all channel categories"""
    with get_session(_session_factory) as session:
        # Eager load channels to avoid N+1 queries
        categories = session.query(ChannelCategory).options(joinedload(ChannelCategory.channels)).order_by(ChannelCategory.name).all()
        result = [{
            'id': c.id,
            'name': c.name,
            'channel_count': len(c.channels),
            'created_at': c.created_at.isoformat() if c.created_at else None
        } for c in categories]
        return jsonify(result)


@channels_bp.route('/api/channel-categories', methods=['POST'])
def create_channel_category():
    """Create a new channel category"""
    data = request.json
    name = data.get('name', '').strip()

    if not name:
        return jsonify({'error': 'Category name is required'}), 400

    with get_session(_session_factory) as session:
        # Check if category already exists
        existing = session.query(ChannelCategory).filter(ChannelCategory.name == name).first()
        if existing:
            return jsonify({'error': 'A category with this name already exists'}), 400

        category = ChannelCategory(name=name)
        session.add(category)
        session.commit()

        return jsonify({
            'id': category.id,
            'name': category.name,
            'channel_count': 0,
            'created_at': category.created_at.isoformat() if category.created_at else None
        }), 201


@channels_bp.route('/api/channel-categories/<int:category_id>', methods=['PATCH'])
def update_channel_category(category_id):
    """Rename a channel category"""
    data = request.json
    with get_session(_session_factory) as session:
        category = session.query(ChannelCategory).filter(ChannelCategory.id == category_id).first()

        if not category:
            return jsonify({'error': 'Category not found'}), 404

        if 'name' in data:
            new_name = data['name'].strip()
            if not new_name:
                return jsonify({'error': 'Category name cannot be empty'}), 400

            # Check for duplicate name
            existing = session.query(ChannelCategory).filter(
                ChannelCategory.name == new_name,
                ChannelCategory.id != category_id
            ).first()
            if existing:
                return jsonify({'error': 'A category with this name already exists'}), 400

            category.name = new_name

        session.commit()

        return jsonify({
            'id': category.id,
            'name': category.name,
            'channel_count': len(category.channels),
            'created_at': category.created_at.isoformat() if category.created_at else None
        })


@channels_bp.route('/api/channel-categories/<int:category_id>', methods=['DELETE'])
def delete_channel_category(category_id):
    """Delete a channel category (channels become uncategorized)"""
    with get_session(_session_factory) as session:
        category = session.query(ChannelCategory).filter(ChannelCategory.id == category_id).first()

        if not category:
            return jsonify({'error': 'Category not found'}), 404

        # Set all channels in this category to NULL (uncategorized)
        for channel in category.channels:
            channel.category_id = None

        session.delete(category)
        session.commit()
        return '', 204
