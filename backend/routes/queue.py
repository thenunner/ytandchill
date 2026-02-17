"""
Queue Routes

Handles:
- GET/POST /api/queue
- GET /api/queue/stream (SSE)
- POST /api/queue/bulk
- POST /api/queue/pause, /resume, /cancel-current
- DELETE /api/queue/<id>
- POST /api/queue/reorder, /move-to-top, /move-to-bottom, /clear
"""

from flask import Blueprint, jsonify, request, Response
from sqlalchemy import func
from queue import Empty
import json
import logging

from database import Video, QueueItem, Channel, Setting, get_session
from events import queue_events
from sqlalchemy.orm import joinedload

logger = logging.getLogger(__name__)

# Create Blueprint
queue_bp = Blueprint('queue', __name__)

# Sensitive settings keys that should not be exposed via API
SENSITIVE_KEYS = {'auth_password_hash', 'youtube_api_key', 'secret_key'}

# Module-level references to shared dependencies
_session_factory = None
_settings_manager = None
_scheduler = None
_download_worker = None
_limiter = None
_serialize_queue_item = None
_get_current_operation = None
_serialize_channel = None


def init_queue_routes(session_factory, settings_manager, scheduler, download_worker, limiter, serialize_queue_item, get_current_operation, serialize_channel=None):
    """Initialize the queue routes with required dependencies."""
    global _session_factory, _settings_manager, _scheduler, _download_worker, _limiter, _serialize_queue_item, _get_current_operation, _serialize_channel
    _session_factory = session_factory
    _settings_manager = settings_manager
    _scheduler = scheduler
    _download_worker = download_worker
    _limiter = limiter
    _serialize_queue_item = serialize_queue_item
    _get_current_operation = get_current_operation
    _serialize_channel = serialize_channel


# =============================================================================
# Queue Endpoints
# =============================================================================

@queue_bp.route('/api/queue', methods=['GET'])
def get_queue():
    with get_session(_session_factory) as session:
        # Query for queue items with videos that are queued or downloading
        items = session.query(QueueItem).join(Video).filter(
            Video.status.in_(['queued', 'downloading'])
        ).order_by(QueueItem.queue_position).all()
        queue_items = [_serialize_queue_item(item) for item in items]

        # Find currently downloading item for detailed progress
        current_download = None
        for item in queue_items:
            if item['video'] and item['video'].get('status') == 'downloading':
                current_download = {
                    'video': item['video'],
                    'progress_pct': item['progress_pct'],
                    'speed_bps': item['speed_bps'],
                    'eta_seconds': item['eta_seconds'],
                    'total_bytes': item.get('total_bytes', 0)
                }
                # Add phase and elapsed time from download worker
                worker_download = _download_worker.current_download if hasattr(_download_worker, 'current_download') else None
                if worker_download:
                    current_download['phase'] = worker_download.get('phase', 'downloading')
                    current_download['postprocessor'] = worker_download.get('postprocessor')
                    # Calculate elapsed time if in postprocessing
                    if worker_download.get('postprocess_start_time'):
                        import time
                        current_download['postprocess_elapsed'] = int(time.time() - worker_download['postprocess_start_time'])
                break

        # Get auto-refresh status
        auto_refresh_enabled = _settings_manager.get_bool('auto_refresh_enabled')
        is_auto_refreshing = _scheduler.is_running() if hasattr(_scheduler, 'is_running') else False
        last_auto_refresh = _scheduler.last_run if hasattr(_scheduler, 'last_run') else None

        # Get delay info from download worker
        delay_info = _download_worker.delay_info if hasattr(_download_worker, 'delay_info') else None

        # Get paused state from download worker
        is_paused = _download_worker.paused if hasattr(_download_worker, 'paused') else False

        # Get rate limit message from download worker
        rate_limit_message = _download_worker.rate_limit_message if hasattr(_download_worker, 'rate_limit_message') else None

        # Get last error message from download worker
        last_error_message = _download_worker.last_error_message if hasattr(_download_worker, 'last_error_message') else None

        # Get cookie warning message from download worker
        cookie_warning_message = _download_worker.cookie_warning_message if hasattr(_download_worker, 'cookie_warning_message') else None

        # Get format choice pending state from download worker
        format_choice_pending = _download_worker.format_choice_pending if hasattr(_download_worker, 'format_choice_pending') else None

        return jsonify({
            'queue_items': queue_items,
            'current_download': current_download,
            'current_operation': _get_current_operation(),
            'delay_info': delay_info,
            'is_paused': is_paused,
            'is_auto_refreshing': is_auto_refreshing,
            'last_auto_refresh': last_auto_refresh.isoformat() if last_auto_refresh else None,
            'auto_refresh_enabled': auto_refresh_enabled,
            'rate_limit_message': rate_limit_message,
            'last_error_message': last_error_message,
            'cookie_warning_message': cookie_warning_message,
            'format_choice_pending': format_choice_pending
        })


def _get_settings_state():
    """Helper to get current settings for SSE init event."""
    with get_session(_session_factory) as session:
        settings = session.query(Setting).all()
        result = {s.key: s.value for s in settings if s.key not in SENSITIVE_KEYS}
        # Add boolean flags for sensitive keys (without exposing actual values)
        api_key = _settings_manager.get('youtube_api_key')
        result['has_youtube_api_key'] = bool(api_key and api_key.strip())
        return result


def _get_channels_state():
    """Helper to get current channels for SSE init event."""
    if not _serialize_channel:
        return []
    with get_session(_session_factory) as session:
        # Filter out soft-deleted channels - eager load videos to avoid N+1 queries
        channels = session.query(Channel).options(joinedload(Channel.videos)).filter(Channel.deleted_at.is_(None)).all()
        return [_serialize_channel(c) for c in channels]


def _get_queue_state():
    """Helper to get current queue state for SSE events."""
    with get_session(_session_factory) as session:
        items = session.query(QueueItem).join(Video).filter(
            Video.status.in_(['queued', 'downloading'])
        ).order_by(QueueItem.queue_position).all()
        queue_items = [_serialize_queue_item(item) for item in items]

        current_download = None
        for item in queue_items:
            if item['video'] and item['video'].get('status') == 'downloading':
                current_download = {
                    'video': item['video'],
                    'progress_pct': item['progress_pct'],
                    'speed_bps': item['speed_bps'],
                    'eta_seconds': item['eta_seconds'],
                    'total_bytes': item.get('total_bytes', 0)
                }
                # Add phase and elapsed time from download worker
                worker_download = _download_worker.current_download if hasattr(_download_worker, 'current_download') else None
                if worker_download:
                    current_download['phase'] = worker_download.get('phase', 'downloading')
                    current_download['postprocessor'] = worker_download.get('postprocessor')
                    # Calculate elapsed time if in postprocessing
                    if worker_download.get('postprocess_start_time'):
                        import time
                        current_download['postprocess_elapsed'] = int(time.time() - worker_download['postprocess_start_time'])
                break

        auto_refresh_enabled = _settings_manager.get_bool('auto_refresh_enabled')
        is_auto_refreshing = _scheduler.is_running() if hasattr(_scheduler, 'is_running') else False
        last_auto_refresh = _scheduler.last_run if hasattr(_scheduler, 'last_run') else None
        delay_info = _download_worker.delay_info if hasattr(_download_worker, 'delay_info') else None
        is_paused = _download_worker.paused if hasattr(_download_worker, 'paused') else False
        rate_limit_message = _download_worker.rate_limit_message if hasattr(_download_worker, 'rate_limit_message') else None
        last_error_message = _download_worker.last_error_message if hasattr(_download_worker, 'last_error_message') else None
        cookie_warning_message = _download_worker.cookie_warning_message if hasattr(_download_worker, 'cookie_warning_message') else None

        # Get format choice pending state from download worker
        format_choice_pending = _download_worker.format_choice_pending if hasattr(_download_worker, 'format_choice_pending') else None

        return {
            'queue_items': queue_items,
            'current_download': current_download,
            'current_operation': _get_current_operation(),
            'delay_info': delay_info,
            'is_paused': is_paused,
            'is_auto_refreshing': is_auto_refreshing,
            'last_auto_refresh': last_auto_refresh.isoformat() if last_auto_refresh else None,
            'auto_refresh_enabled': auto_refresh_enabled,
            'rate_limit_message': rate_limit_message,
            'last_error_message': last_error_message,
            'cookie_warning_message': cookie_warning_message,
            'format_choice_pending': format_choice_pending
        }


@queue_bp.route('/api/queue/stream')
def queue_stream():
    """SSE endpoint for real-time queue updates."""
    client_ip = request.remote_addr
    logger.debug(f"SSE client connecting from {client_ip}")

    def generate():
        subscriber = queue_events.subscribe()
        logger.info(f"SSE client connected from {client_ip}")
        try:
            # Send init event with all initial state (reduces HTTP connection count)
            # This replaces separate API calls for queue, settings, and channels
            init_data = {
                'queue': _get_queue_state(),
                'settings': _get_settings_state(),
                'channels': _get_channels_state(),
            }
            yield f"event: init\ndata: {json.dumps(init_data)}\n\n"

            # Listen for events
            while True:
                try:
                    event = subscriber.get(timeout=30)  # 30s heartbeat timeout
                    if event['type'] == 'queue:changed':
                        # Build fresh state when signaled
                        state = _get_queue_state()
                        yield f"event: queue\ndata: {json.dumps(state)}\n\n"
                    elif event['type'] == 'settings:changed':
                        # Notify clients to refetch settings
                        yield f"event: settings\ndata: {json.dumps({'changed': True})}\n\n"
                    elif event['type'] == 'import:state':
                        # Notify clients to refetch import state
                        yield f"event: import\ndata: {json.dumps({'type': 'state'})}\n\n"
                    elif event['type'] == 'import:encode':
                        # Send encode progress directly (high frequency during encoding)
                        yield f"event: import\ndata: {json.dumps({'type': 'encode', 'data': event.get('data', {})})}\n\n"
                    elif event['type'] == 'video:changed':
                        # Notify clients to refetch videos (status changed)
                        yield f"event: videos\ndata: {json.dumps({'changed': True})}\n\n"
                    elif event['type'] == 'channels:changed':
                        # Notify clients to refetch channels (visited, favorited, etc.)
                        yield f"event: channels\ndata: {json.dumps({'changed': True})}\n\n"
                    elif event['type'] == 'toast:dismissed':
                        # Broadcast toast dismissal to all clients for cross-device sync
                        yield f"event: toast\ndata: {json.dumps({'action': 'dismiss', 'id': event.get('data', {}).get('id')})}\n\n"
                    elif event['type'] == 'format-choice':
                        # Send format choice modal data to all clients
                        yield f"event: format-choice\ndata: {json.dumps(event.get('data', {}))}\n\n"
                    elif event['type'] == 'sponsorblock-cut:progress':
                        # Send SponsorBlock cut progress to all clients
                        yield f"event: sponsorblock-cut\ndata: {json.dumps(event.get('data', {}))}\n\n"
                except Empty:
                    # Send heartbeat comment to keep connection alive
                    yield ": heartbeat\n\n"
        except GeneratorExit:
            logger.debug(f"SSE client disconnected gracefully from {client_ip}")
        except Exception as e:
            logger.warning(f"SSE error for client {client_ip}: {e}")
        finally:
            queue_events.unsubscribe(subscriber)
            logger.info(f"SSE client cleanup complete for {client_ip}")

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        }
    )


@queue_bp.route('/api/toast/dismiss', methods=['POST'])
def dismiss_toast():
    """Broadcast toast dismissal to all SSE clients for cross-device sync."""
    data = request.json
    toast_id = data.get('id')
    if not toast_id:
        return jsonify({'error': 'Toast ID required'}), 400

    # Broadcast dismissal to all connected clients
    queue_events.emit('toast:dismissed', {'id': toast_id})
    return jsonify({'dismissed': toast_id}), 200


@queue_bp.route('/api/queue', methods=['POST'])
def add_to_queue():
    data = request.json
    with get_session(_session_factory) as session:
        video_id = data['video_id']

        # Get video
        video = session.query(Video).filter(Video.id == video_id).first()
        if not video:
            logger.debug(f"Add to queue requested for non-existent video ID: {video_id}")
            return jsonify({'error': 'Video not found'}), 404

        # Check if already in queue (video status is queued or downloading)
        if video.status in ['queued', 'downloading']:
            logger.debug(f"Video '{video.title}' (ID: {video_id}) already in queue with status: {video.status}")
            return jsonify({'error': 'Video already in queue'}), 400

        # Save prior status and set video status to queued
        prior_status = video.status
        video.status = 'queued'
        # Get max queue position and add to bottom
        max_pos = session.query(func.max(QueueItem.queue_position)).scalar() or 0
        item = QueueItem(video_id=video_id, queue_position=max_pos + 1, prior_status=prior_status)
        session.add(item)
        session.commit()

        logger.debug(f"Added video '{video.title}' (ID: {video_id}) to queue at position {max_pos + 1}")

        result = _serialize_queue_item(item)

        # Auto-resume the download worker when adding to queue
        if _download_worker.paused:
            _download_worker.resume()
            logger.info("Auto-resumed download worker after adding video to queue")

        # Emit SSE events for real-time UI updates
        queue_events.emit('video:changed')
        queue_events.emit('queue:changed')  # Update queue count badges

        return jsonify(result), 201


@queue_bp.route('/api/queue/bulk', methods=['POST'])
def add_to_queue_bulk():
    """Add multiple videos to queue in a single transaction"""
    data = request.json
    with get_session(_session_factory) as session:
        video_ids = data.get('video_ids', [])

        if not video_ids:
            return jsonify({'error': 'video_ids array is required'}), 400

        if not isinstance(video_ids, list):
            return jsonify({'error': 'video_ids must be an array'}), 400

        logger.debug(f"Bulk add to queue requested for {len(video_ids)} videos")

        # Get max queue position once
        max_pos = session.query(func.max(QueueItem.queue_position)).scalar() or 0

        added_count = 0
        skipped_count = 0
        skipped_videos = []

        for video_id in video_ids:
            # Get video
            video = session.query(Video).filter(Video.id == video_id).first()
            if not video:
                logger.debug(f"Bulk add: Skipping non-existent video ID: {video_id}")
                skipped_count += 1
                continue

            # Skip if already in queue
            if video.status in ['queued', 'downloading']:
                logger.debug(f"Bulk add: Skipping video '{video.title}' (ID: {video_id}) - already in queue")
                skipped_videos.append(video.title)
                skipped_count += 1
                continue

            # Add to queue - save prior status
            prior_status = video.status
            video.status = 'queued'
            max_pos += 1
            item = QueueItem(video_id=video_id, queue_position=max_pos, prior_status=prior_status)
            session.add(item)
            added_count += 1
            logger.debug(f"Bulk add: Added video '{video.title}' (ID: {video_id}) to queue at position {max_pos}")

        session.commit()
        logger.info(f"Bulk add to queue completed: {added_count} added, {skipped_count} skipped")

        # Auto-resume the download worker when adding to queue
        if added_count > 0 and _download_worker.paused:
            _download_worker.resume()
            logger.info("Auto-resumed download worker after bulk add to queue")

        # Emit SSE events for real-time UI updates
        if added_count > 0:
            queue_events.emit('video:changed')
            queue_events.emit('queue:changed')  # Update queue count badges

        response = {
            'added_count': added_count,
            'skipped_count': skipped_count,
            'total_requested': len(video_ids)
        }

        if skipped_videos:
            response['skipped_videos'] = skipped_videos[:10]

        return jsonify(response), 201


@queue_bp.route('/api/queue/pause', methods=['POST'])
def pause_queue():
    _download_worker.pause()
    return jsonify({'status': 'paused'})


@queue_bp.route('/api/queue/resume', methods=['POST'])
def resume_queue():
    _download_worker.resume()
    return jsonify({'status': 'resumed'})


@queue_bp.route('/api/queue/cancel-current', methods=['POST'])
def cancel_current_download():
    _download_worker.cancel_current()
    return jsonify({'status': 'cancelled'})


@queue_bp.route('/api/queue/format-choice', methods=['POST'])
def handle_format_choice():
    """Handle user's format choice for videos without H.264 format available."""
    data = request.json
    video_id = data.get('video_id')
    choice = data.get('choice')  # 'reencode' or 'skip'

    if not video_id:
        return jsonify({'error': 'video_id is required'}), 400

    if choice not in ['reencode', 'skip']:
        return jsonify({'error': 'choice must be "reencode" or "skip"'}), 400

    # Verify this is the video we're waiting for
    pending = _download_worker.format_choice_pending
    if not pending or pending.get('video_id') != video_id:
        return jsonify({'error': 'No format choice pending for this video'}), 400

    logger.info(f"Format choice received for video {video_id}: {choice}")

    # Signal the download worker with the user's choice
    _download_worker.handle_format_choice(choice)

    return jsonify({'status': 'accepted', 'choice': choice})


@queue_bp.route('/api/queue/<int:item_id>', methods=['DELETE'])
def remove_from_queue(item_id):
    with get_session(_session_factory) as session:
        item = session.query(QueueItem).filter(QueueItem.id == item_id).first()

        if not item:
            return jsonify({'error': 'Queue item not found'}), 404

        # Get the video
        video = session.query(Video).filter(Video.id == item.video_id).first()

        # Cannot remove if currently downloading
        if video and video.status == 'downloading':
            return jsonify({'error': 'Cannot remove item currently downloading'}), 400

        # Restore video status to prior_status (what it was before queueing)
        if video and video.status in ['queued', 'downloading']:
            video.status = item.prior_status

        session.delete(item)
        session.commit()

        # Emit SSE events for real-time UI updates
        queue_events.emit('video:changed')
        queue_events.emit('queue:changed')  # Update queue count badges

        return '', 204


@queue_bp.route('/api/queue/reorder', methods=['POST'])
def reorder_queue():
    data = request.json
    with get_session(_session_factory) as session:
        item_id = data.get('item_id')
        new_position = data.get('new_position')

        if not item_id or not new_position:
            return jsonify({'error': 'item_id and new_position are required'}), 400

        # Get the item to move
        item = session.query(QueueItem).filter(QueueItem.id == item_id).first()
        if not item:
            return jsonify({'error': 'Queue item not found'}), 404

        # Check if item is currently downloading (cannot reorder)
        video = session.query(Video).filter(Video.id == item.video_id).first()
        if video and video.status == 'downloading':
            return jsonify({'error': 'Cannot reorder currently downloading item'}), 400

        old_position = item.queue_position

        # Only reorder if position is actually changing
        if old_position == new_position:
            return jsonify({'message': 'Position unchanged'}), 200

        # Shift affected items based on move direction
        if new_position < old_position:
            # Moving UP: shift items [new_pos...old_pos-1] down by 1
            items_to_shift = session.query(QueueItem).filter(
                QueueItem.queue_position >= new_position,
                QueueItem.queue_position < old_position,
                QueueItem.id != item_id
            ).all()
            for shift_item in items_to_shift:
                shift_item.queue_position += 1
        else:
            # Moving DOWN: shift items [old_pos+1...new_pos] up by 1
            items_to_shift = session.query(QueueItem).filter(
                QueueItem.queue_position > old_position,
                QueueItem.queue_position <= new_position,
                QueueItem.id != item_id
            ).all()
            for shift_item in items_to_shift:
                shift_item.queue_position -= 1

        # Set new position for the moved item
        item.queue_position = new_position
        session.commit()

        # Return updated queue
        items = session.query(QueueItem).join(Video).filter(
            Video.status.in_(['queued', 'downloading'])
        ).order_by(QueueItem.queue_position).all()
        queue_items = [_serialize_queue_item(queue_item) for queue_item in items]

        return jsonify({'queue_items': queue_items})


@queue_bp.route('/api/queue/move-to-top', methods=['POST'])
def move_to_top():
    data = request.json
    with get_session(_session_factory) as session:
        item_id = data.get('item_id')

        if not item_id:
            return jsonify({'error': 'item_id is required'}), 400

        # Get the item to move
        item = session.query(QueueItem).filter(QueueItem.id == item_id).first()
        if not item:
            return jsonify({'error': 'Queue item not found'}), 404

        # Check if item is currently downloading (cannot reorder)
        video = session.query(Video).filter(Video.id == item.video_id).first()
        if video and video.status == 'downloading':
            return jsonify({'error': 'Cannot reorder currently downloading item'}), 400

        old_position = item.queue_position

        # If already at position 1, no change needed
        if old_position == 1:
            return jsonify({'message': 'Already at top'}), 200

        # Shift all items from position 1 to old_position-1 down by 1
        items_to_shift = session.query(QueueItem).filter(
            QueueItem.queue_position >= 1,
            QueueItem.queue_position < old_position,
            QueueItem.id != item_id
        ).all()
        for shift_item in items_to_shift:
            shift_item.queue_position += 1

        # Move item to position 1
        item.queue_position = 1
        session.commit()

        # Return updated queue
        items = session.query(QueueItem).join(Video).filter(
            Video.status.in_(['queued', 'downloading'])
        ).order_by(QueueItem.queue_position).all()
        queue_items = [_serialize_queue_item(queue_item) for queue_item in items]

        return jsonify({'queue_items': queue_items})


@queue_bp.route('/api/queue/move-to-bottom', methods=['POST'])
def move_to_bottom():
    data = request.json
    with get_session(_session_factory) as session:
        item_id = data.get('item_id')

        if not item_id:
            return jsonify({'error': 'item_id is required'}), 400

        # Get the item to move
        item = session.query(QueueItem).filter(QueueItem.id == item_id).first()
        if not item:
            return jsonify({'error': 'Queue item not found'}), 404

        # Check if item is currently downloading (cannot reorder)
        video = session.query(Video).filter(Video.id == item.video_id).first()
        if video and video.status == 'downloading':
            return jsonify({'error': 'Cannot reorder currently downloading item'}), 400

        old_position = item.queue_position

        # Find max position
        max_position = session.query(func.max(QueueItem.queue_position)).scalar() or 1

        # If already at bottom, no change needed
        if old_position == max_position:
            return jsonify({'message': 'Already at bottom'}), 200

        # Shift all items from old_position+1 to max_position up by 1
        items_to_shift = session.query(QueueItem).filter(
            QueueItem.queue_position > old_position,
            QueueItem.queue_position <= max_position,
            QueueItem.id != item_id
        ).all()
        for shift_item in items_to_shift:
            shift_item.queue_position -= 1

        # Move item to bottom (max position)
        item.queue_position = max_position
        session.commit()

        # Return updated queue
        items = session.query(QueueItem).join(Video).filter(
            Video.status.in_(['queued', 'downloading'])
        ).order_by(QueueItem.queue_position).all()
        queue_items = [_serialize_queue_item(queue_item) for queue_item in items]

        return jsonify({'queue_items': queue_items}), 200


@queue_bp.route('/api/queue/clear', methods=['POST'])
def clear_queue():
    """Remove all pending queue items and clean up stuck items"""
    with get_session(_session_factory) as session:
        # First, reset any stuck 'downloading' videos back to 'queued'
        stuck_count = session.query(Video).filter(
            Video.status == 'downloading'
        ).update({'status': 'queued'}, synchronize_session=False)
        if stuck_count > 0:
            logger.info(f"Reset {stuck_count} stuck 'downloading' videos to 'queued'")

        # Get queue item IDs to delete (can't use .delete() with .join())
        queue_items_to_delete = session.query(QueueItem.id).join(Video).filter(
            Video.status == 'queued'
        ).all()
        queue_item_ids = [q.id for q in queue_items_to_delete]

        # Delete queue items by ID
        deleted_count = 0
        if queue_item_ids:
            deleted_count = session.query(QueueItem).filter(
                QueueItem.id.in_(queue_item_ids)
            ).delete(synchronize_session=False)

        # Also set the corresponding videos back to 'discovered' status
        session.query(Video).filter(
            Video.status == 'queued'
        ).update({'status': 'discovered'}, synchronize_session=False)

        # Clean up orphaned queue items (no matching video or video not in queue status)
        orphaned = session.query(QueueItem).filter(
            ~QueueItem.video_id.in_(
                session.query(Video.id).filter(Video.status.in_(['queued', 'downloading']))
            )
        ).all()
        orphaned_count = len(orphaned)
        for item in orphaned:
            session.delete(item)
        if orphaned_count > 0:
            logger.info(f"Cleaned up {orphaned_count} orphaned queue items")

        session.commit()

        # Return updated queue
        items = session.query(QueueItem).join(Video).filter(
            Video.status.in_(['queued', 'downloading'])
        ).order_by(QueueItem.queue_position).all()
        queue_items = [_serialize_queue_item(queue_item) for queue_item in items]

        return jsonify({
            'message': f'Cleared {deleted_count} items from queue',
            'queue_items': queue_items
        }), 200
