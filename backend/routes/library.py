"""
Library Routes

Handles:
- GET/POST /api/categories - List/create playlist categories
- GET/PATCH/DELETE /api/categories/<id> - Single category operations
- PATCH /api/playlists/bulk-category - Bulk assign playlists to category
- GET/POST /api/playlists - List/create playlists
- GET/PATCH/DELETE /api/playlists/<id> - Single playlist operations
- POST /api/playlists/<id>/videos - Add video to playlist
- POST /api/playlists/<id>/videos/bulk - Add multiple videos to playlist
- DELETE /api/playlists/<id>/videos/<video_id> - Remove video from playlist
"""

from flask import Blueprint, jsonify, request
from sqlalchemy.orm import joinedload
import logging

from database import Category, Playlist, PlaylistVideo, Video, get_session

logger = logging.getLogger(__name__)

# Create Blueprint
library_bp = Blueprint('library', __name__)

# Module-level references to shared dependencies
_session_factory = None
_limiter = None
_serialize_category = None
_serialize_playlist = None
_serialize_video = None


def init_library_routes(session_factory, limiter, serialize_category, serialize_playlist, serialize_video):
    """Initialize the library routes with required dependencies."""
    global _session_factory, _limiter, _serialize_category, _serialize_playlist, _serialize_video
    _session_factory = session_factory
    _limiter = limiter
    _serialize_category = serialize_category
    _serialize_playlist = serialize_playlist
    _serialize_video = serialize_video


# =============================================================================
# Category Endpoints (Playlist Categories)
# =============================================================================

@library_bp.route('/api/categories', methods=['GET'])
def get_categories():
    """List all categories with playlist counts"""
    with get_session(_session_factory) as session:
        categories = session.query(Category).options(
            joinedload(Category.playlists).joinedload(Playlist.playlist_videos)
        ).order_by(Category.name).all()
        result = [_serialize_category(c) for c in categories]
        return jsonify(result)


@library_bp.route('/api/categories', methods=['POST'])
def create_category():
    """Create a new category"""
    data = request.json
    with get_session(_session_factory) as session:
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'error': 'Category name is required'}), 400

        # Check if category already exists
        existing = session.query(Category).filter(Category.name == name).first()
        if existing:
            return jsonify({'error': 'Category already exists'}), 409

        category = Category(name=name)
        session.add(category)
        session.commit()

        result = _serialize_category(category)
        return jsonify(result), 201


@library_bp.route('/api/categories/<int:category_id>', methods=['GET'])
def get_category(category_id):
    """Get single category with its playlists"""
    with get_session(_session_factory) as session:
        category = session.query(Category).options(
            joinedload(Category.playlists).joinedload(Playlist.playlist_videos)
        ).filter(Category.id == category_id).first()

        if not category:
            return jsonify({'error': 'Category not found'}), 404

        playlists = [_serialize_playlist(p) for p in category.playlists]
        result = _serialize_category(category)
        result['playlists'] = playlists

        return jsonify(result)


@library_bp.route('/api/categories/<int:category_id>', methods=['PATCH'])
def update_category(category_id):
    """Rename a category"""
    data = request.json
    with get_session(_session_factory) as session:
        category = session.query(Category).filter(Category.id == category_id).first()
        if not category:
            return jsonify({'error': 'Category not found'}), 404

        if 'name' in data:
            new_name = data['name'].strip()
            if not new_name:
                return jsonify({'error': 'Category name is required'}), 400

            # Check if new name already exists
            existing = session.query(Category).filter(
                Category.name == new_name,
                Category.id != category_id
            ).first()
            if existing:
                return jsonify({'error': 'Category name already exists'}), 409

            category.name = new_name

        session.commit()
        result = _serialize_category(category)
        return jsonify(result)


@library_bp.route('/api/categories/<int:category_id>', methods=['DELETE'])
def delete_category(category_id):
    """Delete a category (playlists become uncategorized)"""
    with get_session(_session_factory) as session:
        category = session.query(Category).filter(Category.id == category_id).first()

        if not category:
            return jsonify({'error': 'Category not found'}), 404

        # Set all playlists in this category to NULL (uncategorized)
        for playlist in category.playlists:
            playlist.category_id = None

        session.delete(category)
        session.commit()
        return '', 204


@library_bp.route('/api/playlists/bulk-category', methods=['PATCH'])
def bulk_assign_category():
    """Assign multiple playlists to a category"""
    data = request.json
    with get_session(_session_factory) as session:
        playlist_ids = data.get('playlist_ids', [])
        category_id = data.get('category_id')  # Can be None to uncategorize

        if not playlist_ids or not isinstance(playlist_ids, list):
            return jsonify({'error': 'playlist_ids array is required'}), 400

        # If category_id is provided, verify it exists
        if category_id is not None:
            category = session.query(Category).filter(Category.id == category_id).first()
            if not category:
                return jsonify({'error': 'Category not found'}), 404

        # Update all playlists
        updated_count = 0
        for playlist_id in playlist_ids:
            playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()
            if playlist:
                playlist.category_id = category_id
                updated_count += 1

        session.commit()

        return jsonify({
            'updated_count': updated_count,
            'total_requested': len(playlist_ids)
        })


# =============================================================================
# Playlist Endpoints
# =============================================================================

@library_bp.route('/api/playlists', methods=['GET'])
def get_playlists():
    with get_session(_session_factory) as session:
        channel_id = request.args.get('channel_id', type=int)

        query = session.query(Playlist).options(
            joinedload(Playlist.category),
            joinedload(Playlist.playlist_videos)
        )
        if channel_id:
            query = query.filter(Playlist.channel_id == channel_id)

        playlists = query.all()
        result = [_serialize_playlist(p) for p in playlists]

        return jsonify(result)


@library_bp.route('/api/playlists', methods=['POST'])
def create_playlist():
    data = request.json
    with get_session(_session_factory) as session:
        playlist = Playlist(
            name=data['name'],
            channel_id=data.get('channel_id')
        )
        session.add(playlist)
        session.commit()

        result = _serialize_playlist(playlist)

        return jsonify(result), 201


@library_bp.route('/api/playlists/<int:playlist_id>', methods=['GET'])
def get_playlist(playlist_id):
    with get_session(_session_factory) as session:
        playlist = session.query(Playlist).options(
            joinedload(Playlist.category),
            joinedload(Playlist.playlist_videos).joinedload(PlaylistVideo.video).joinedload(Video.playlist_videos).joinedload(PlaylistVideo.playlist)
        ).filter(Playlist.id == playlist_id).first()

        if not playlist:
            return jsonify({'error': 'Playlist not found'}), 404

        videos = [_serialize_video(pv.video) for pv in playlist.playlist_videos]
        result = _serialize_playlist(playlist)
        result['videos'] = videos

        return jsonify(result)


@library_bp.route('/api/playlists/<int:playlist_id>', methods=['PATCH'])
def update_playlist(playlist_id):
    data = request.json
    with get_session(_session_factory) as session:
        playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()
        if not playlist:
            return jsonify({'error': 'Playlist not found'}), 404

        if 'name' in data:
            playlist.name = data['name']

        if 'category_id' in data:
            # Allow setting to None to uncategorize
            playlist.category_id = data['category_id']

        session.commit()
        result = _serialize_playlist(playlist)

        return jsonify(result)


@library_bp.route('/api/playlists/<int:playlist_id>', methods=['DELETE'])
def delete_playlist(playlist_id):
    with get_session(_session_factory) as session:
        playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()

        if not playlist:
            return jsonify({'error': 'Playlist not found'}), 404

        session.delete(playlist)
        session.commit()

        return '', 204


@library_bp.route('/api/playlists/<int:playlist_id>/videos', methods=['POST'])
def add_video_to_playlist(playlist_id):
    data = request.json
    with get_session(_session_factory) as session:
        playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()
        if not playlist:
            return jsonify({'error': 'Playlist not found'}), 404

        video_id = data['video_id']

        # Check if already added
        existing = session.query(PlaylistVideo).filter(
            PlaylistVideo.playlist_id == playlist_id,
            PlaylistVideo.video_id == video_id
        ).first()

        if existing:
            return jsonify({'error': 'Video already in playlist'}), 400

        pv = PlaylistVideo(playlist_id=playlist_id, video_id=video_id)
        session.add(pv)
        session.commit()

        return jsonify({'success': True}), 201


@library_bp.route('/api/playlists/<int:playlist_id>/videos/bulk', methods=['POST'])
def add_videos_to_playlist_bulk(playlist_id):
    """Add multiple videos to a playlist in a single transaction"""
    data = request.json
    with get_session(_session_factory) as session:
        video_ids = data.get('video_ids', [])

        if not video_ids:
            return jsonify({'error': 'video_ids array is required'}), 400

        if not isinstance(video_ids, list):
            return jsonify({'error': 'video_ids must be an array'}), 400

        # Check playlist exists
        playlist = session.query(Playlist).filter(Playlist.id == playlist_id).first()
        if not playlist:
            return jsonify({'error': 'Playlist not found'}), 404

        logger.debug(f"Bulk add to playlist '{playlist.name}' (ID: {playlist_id}): {len(video_ids)} videos")

        added_count = 0
        skipped_count = 0

        for video_id in video_ids:
            # Check if already in playlist
            existing = session.query(PlaylistVideo).filter(
                PlaylistVideo.playlist_id == playlist_id,
                PlaylistVideo.video_id == video_id
            ).first()

            if existing:
                logger.debug(f"Bulk add: Skipping video ID {video_id} - already in playlist")
                skipped_count += 1
                continue

            # Get video for logging
            video = session.query(Video).filter(Video.id == video_id).first()
            if not video:
                logger.debug(f"Bulk add: Skipping non-existent video ID: {video_id}")
                skipped_count += 1
                continue

            # Add to playlist
            pv = PlaylistVideo(playlist_id=playlist_id, video_id=video_id)
            session.add(pv)
            added_count += 1
            logger.debug(f"Bulk add: Added video '{video.title}' (ID: {video_id}) to playlist")

        session.commit()
        logger.info(f"Bulk add to playlist completed: {added_count} added, {skipped_count} skipped")

        response = {
            'added_count': added_count,
            'skipped_count': skipped_count,
            'total_requested': len(video_ids)
        }

        return jsonify(response), 201


@library_bp.route('/api/playlists/<int:playlist_id>/videos/<int:video_id>', methods=['DELETE'])
def remove_video_from_playlist(playlist_id, video_id):
    with get_session(_session_factory) as session:
        pv = session.query(PlaylistVideo).filter(
            PlaylistVideo.playlist_id == playlist_id,
            PlaylistVideo.video_id == video_id
        ).first()

        if not pv:
            return jsonify({'error': 'Video not in playlist'}), 404

        session.delete(pv)
        session.commit()

        return '', 204
