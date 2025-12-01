"""
Channels Routes

Handles:
- GET/POST /api/channels - List/create channels
- PATCH/DELETE /api/channels/<id> - Update/delete channel
- POST /api/channels/<id>/scan - Queue channel scan
- GET /api/channels/scan-status - Get scan queue status
- GET /api/channels/batch-scan-status - Get batch scan status
- GET/POST /api/channel-categories - List/create channel categories
- PATCH/DELETE /api/channel-categories/<id> - Update/delete channel category
"""

from flask import Blueprint, jsonify, request
from datetime import datetime, timezone
from googleapiclient.errors import HttpError
import logging
import os

from database import Channel, Video, Playlist, ChannelCategory, get_session
from utils import download_thumbnail

logger = logging.getLogger(__name__)

# Create Blueprint
channels_bp = Blueprint('channels', __name__)

# Module-level references to shared dependencies
_session_factory = None
_limiter = None
_serialize_channel = None
_get_youtube_client = None
_set_operation = None
_clear_operation = None
_queue_channel_scan = None
_get_scan_queue_status = None
_get_scan_globals = None  # Function to get scan worker globals


def init_channels_routes(session_factory, limiter, serialize_channel, get_youtube_client,
                         set_operation, clear_operation, queue_channel_scan,
                         get_scan_queue_status, get_scan_globals):
    """Initialize the channels routes with required dependencies."""
    global _session_factory, _limiter, _serialize_channel, _get_youtube_client
    global _set_operation, _clear_operation, _queue_channel_scan
    global _get_scan_queue_status, _get_scan_globals
    _session_factory = session_factory
    _limiter = limiter
    _serialize_channel = serialize_channel
    _get_youtube_client = get_youtube_client
    _set_operation = set_operation
    _clear_operation = clear_operation
    _queue_channel_scan = queue_channel_scan
    _get_scan_queue_status = get_scan_queue_status
    _get_scan_globals = get_scan_globals


# =============================================================================
# Channel Endpoints
# =============================================================================

@channels_bp.route('/api/channels', methods=['GET'])
def get_channels():
    with get_session(_session_factory) as session:
        # Filter out soft-deleted channels
        channels = session.query(Channel).filter(Channel.deleted_at.is_(None)).all()
        result = [_serialize_channel(c) for c in channels]
        return jsonify(result)


@channels_bp.route('/api/channels', methods=['POST'])
def create_channel():
    data = request.json

    try:
        _set_operation('adding_channel', 'Fetching channel information...')

        # Get YouTube API client
        try:
            youtube_client = _get_youtube_client()
        except ValueError as e:
            _clear_operation()
            return jsonify({'error': str(e)}), 400

        # Resolve channel ID from URL
        try:
            channel_id = youtube_client.resolve_channel_id_from_url(data['url'])
        except HttpError as e:
            _clear_operation()
            return jsonify({'error': f'YouTube API error: {e}'}), 500

        if not channel_id:
            _clear_operation()
            return jsonify({'error': 'Could not resolve channel ID from URL'}), 400

        with get_session(_session_factory) as session:
            # Check if already exists
            existing = session.query(Channel).filter(Channel.yt_id == channel_id).first()
            if existing:
                _clear_operation()
                return jsonify({'error': 'Channel already exists'}), 400

            # Get channel info
            try:
                channel_info = youtube_client.get_channel_info(channel_id)
            except HttpError as e:
                _clear_operation()
                return jsonify({'error': f'YouTube API error: {e}'}), 500

            if not channel_info:
                _clear_operation()
                return jsonify({'error': 'Could not fetch channel information'}), 400

            # Create folder name
            folder_name = channel_info['title'].replace(' ', '_').replace('/', '_')[:50]

            # Download channel thumbnail locally
            thumbnail_path = None
            if channel_info['thumbnail']:
                thumbnail_filename = f"{channel_id}.jpg"
                local_file_path = os.path.join('downloads', 'thumbnails', thumbnail_filename)
                if download_thumbnail(channel_info['thumbnail'], local_file_path):
                    # Store relative path (without 'downloads/' prefix) since media endpoint serves from downloads/
                    thumbnail_path = os.path.join('thumbnails', thumbnail_filename)
                    print(f'Downloaded channel thumbnail for {channel_id}')

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
            _queue_channel_scan(channel.id, force_full=True)
            logger.info(f"Queued initial full scan for new channel: {channel.title} (ID: {channel.id})")

            _clear_operation()
            result = _serialize_channel(channel)
            result['scan_result'] = {
                'message': 'Initial scan queued',
                'status': 'queued'
            }
            return jsonify(result), 201

    except HttpError as api_error:
        _clear_operation()
        logger.error(f'YouTube API error while adding channel: {api_error}', exc_info=True)
        return jsonify({'error': 'Failed to add channel due to YouTube API error'}), 500
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
        channel.deleted_at = datetime.now(timezone.utc)

        # Clean up non-library videos (discovered, ignored, queued, etc.)
        # but keep library videos so they remain in the user's library
        non_library_videos = session.query(Video).filter(
            Video.channel_id == channel_id,
            Video.status != 'library'
        ).all()

        for video in non_library_videos:
            session.delete(video)

        # Also clean up any channel-specific playlists
        session.query(Playlist).filter(Playlist.channel_id == channel_id).delete()

        return '', 204


@channels_bp.route('/api/channels/<int:channel_id>/scan', methods=['POST'])
def scan_channel(channel_id):
    """Queue a channel scan (runs in background)"""
    with get_session(_session_factory) as session:
        channel = session.query(Channel).filter(Channel.id == channel_id).first()

        if not channel:
            logger.debug(f"Scan requested for non-existent channel ID: {channel_id}")
            return jsonify({'error': 'Channel not found'}), 404

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


@channels_bp.route('/api/channels/scan-status', methods=['GET'])
def get_scan_status():
    """Get current scan queue status"""
    status = _get_scan_queue_status()
    return jsonify(status)


@channels_bp.route('/api/channels/batch-scan-status', methods=['GET'])
def get_batch_scan_status():
    """Check batch scan status and pending auto-scan"""
    scan_globals = _get_scan_globals()
    return jsonify({
        'batch_in_progress': scan_globals['batch_in_progress'],
        'auto_scan_pending': scan_globals['auto_scan_pending'],
        'queue_size': scan_globals['queue_size'],
        'current': scan_globals['current'],
        'total': scan_globals['total']
    })


# =============================================================================
# Channel Category Endpoints
# =============================================================================

@channels_bp.route('/api/channel-categories', methods=['GET'])
def get_channel_categories():
    """Get all channel categories"""
    with get_session(_session_factory) as session:
        categories = session.query(ChannelCategory).order_by(ChannelCategory.name).all()
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
