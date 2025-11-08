import { useQueue, usePauseQueue, useResumeQueue, useCancelCurrent, useRemoveFromQueue, useReorderQueue, useMoveToTop, useMoveToBottom, useClearQueue } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Queue Item Component
function SortableQueueItem({ item, index, onRemove, onMoveToTop, onMoveToBottom }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card p-3 cursor-pointer hover:bg-dark-hover transition-colors group ${index % 2 === 0 ? 'bg-dark-secondary' : 'bg-dark-tertiary'}`}
    >
      <div className="flex items-center gap-3">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-text-secondary hover:text-text-primary transition-colors p-2 md:p-1 touch-none"
          style={{ touchAction: 'none' }}
        >
          <svg className="w-6 h-6 md:w-5 md:h-5" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="5" r="1.5"></circle>
            <circle cx="9" cy="12" r="1.5"></circle>
            <circle cx="9" cy="19" r="1.5"></circle>
            <circle cx="15" cy="5" r="1.5"></circle>
            <circle cx="15" cy="12" r="1.5"></circle>
            <circle cx="15" cy="19" r="1.5"></circle>
          </svg>
        </div>

        {/* Position Number */}
        <div className="flex-shrink-0 w-8 text-center text-sm font-semibold text-text-secondary">
          {index + 1}
        </div>

        {/* Thumbnail */}
        <div className="hidden md:block flex-shrink-0 w-[100px] h-[56px] bg-dark-tertiary rounded overflow-hidden">
          {item.video?.thumb_url ? (
            <img
              src={item.video.thumb_url}
              alt={item.video.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-8 h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </div>
          )}
        </div>

        {/* Video Info */}
        <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
          <p className="text-sm text-text-primary font-medium line-clamp-2 md:truncate">
            {item.video?.title} <span className="text-text-secondary">• {item.video?.channel_title}</span>
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Move to Top */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveToTop(item.id);
              }}
              className="text-text-secondary hover:text-white transition-colors p-1.5 hover:bg-dark-tertiary rounded"
              title="Move to top"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 11 12 6 7 11"></polyline>
                <polyline points="17 18 12 13 7 18"></polyline>
              </svg>
            </button>

            {/* Move to Bottom */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveToBottom(item.id);
              }}
              className="text-text-secondary hover:text-white transition-colors p-1.5 hover:bg-dark-tertiary rounded"
              title="Move to bottom"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 13 12 18 7 13"></polyline>
                <polyline points="17 6 12 11 7 6"></polyline>
              </svg>
            </button>

            {/* Remove */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              className="text-text-secondary hover:text-red-400 transition-colors p-1.5 hover:bg-dark-tertiary rounded"
              title="Remove from queue"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Queue() {
  const { data: queue, isLoading } = useQueue();
  const pauseQueue = usePauseQueue();
  const resumeQueue = useResumeQueue();
  const cancelCurrent = useCancelCurrent();
  const removeFromQueue = useRemoveFromQueue();
  const reorderQueue = useReorderQueue();
  const moveToTop = useMoveToTop();
  const moveToBottom = useMoveToBottom();
  const clearQueue = useClearQueue();
  const { showNotification } = useNotification();

  // Configure drag sensors for both mouse and touch
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px of movement required before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150, // 150ms hold before drag starts (shorter for better UX)
        tolerance: 8, // 8px of movement tolerance
      },
    })
  );

  const formatBytes = (bytes) => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB/s`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) {
      return `${mb.toFixed(1)} MB`;
    }
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const handlePause = async () => {
    try {
      await pauseQueue.mutateAsync();
      showNotification('Queue paused', 'success');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleResume = async () => {
    try {
      await resumeQueue.mutateAsync();
      showNotification('Queue resumed', 'success');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Are you sure you want to clear all pending queue items?')) {
      return;
    }
    try {
      const result = await clearQueue.mutateAsync();
      showNotification(result.message || 'Queue cleared', 'success');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleCancel = async () => {
    try {
      showNotification('Cancelling current download...', 'info', { persistent: true });
      await cancelCurrent.mutateAsync();
      showNotification('Download cancelled', 'success');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleRemove = async (itemId) => {
    try {
      await removeFromQueue.mutateAsync(itemId);
      showNotification('Removed from queue', 'success');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleMoveToTop = async (itemId) => {
    try {
      await moveToTop.mutateAsync(itemId);
      showNotification('Moved to top of queue', 'success');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleMoveToBottom = async (itemId) => {
    try {
      await moveToBottom.mutateAsync(itemId);
      showNotification('Moved to bottom of queue', 'success');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return; // No change in position
    }

    // Find the old and new positions
    const oldIndex = pendingItems.findIndex(item => item.id === active.id);
    const newIndex = pendingItems.findIndex(item => item.id === over.id);

    if (oldIndex === newIndex) {
      return;
    }

    // Calculate new position (1-indexed for backend)
    const newPosition = newIndex + 1;

    try {
      await reorderQueue.mutateAsync({ itemId: active.id, newPosition });
    } catch (error) {
      showNotification(error.message || 'Failed to reorder queue', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Handle queue data structure
  const queueItems = queue?.queue_items || [];
  const currentDownload = queue?.current_download || queueItems.find(item => item.video?.status === 'downloading');
  const pendingItems = queueItems.filter(item => item.video?.status === 'queued') || [];
  // No more completed/failed items in queue - they're deleted after completion/failure
  const completedItems = [];
  const failedItems = [];

  // Check if worker is paused and there are queued items
  const workerPaused = queue?.is_paused;
  const hasQueuedItems = pendingItems.length > 0 || currentDownload;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-4">
        <div className="flex space-x-2">
          <button onClick={handlePause} className="px-2 md:px-4 py-1 md:py-1.5 text-xs md:text-sm bg-dark-hover hover:bg-dark-tertiary border border-dark-border-light rounded text-white transition-colors font-medium">
            Pause
          </button>
          <button onClick={handleResume} className="px-2 md:px-4 py-1 md:py-1.5 text-xs md:text-sm bg-dark-hover hover:bg-dark-tertiary border border-dark-border-light rounded text-white transition-colors font-medium">
            Resume
          </button>
          <button onClick={handleClear} className="px-2 md:px-4 py-1 md:py-1.5 text-xs md:text-sm bg-dark-hover hover:bg-dark-tertiary border border-dark-border-light rounded text-white transition-colors font-medium">
            Clear Queue
          </button>
        </div>
      </div>

      {/* Show message if worker is paused with items in queue */}
      {workerPaused && hasQueuedItems && (
        <div className="card p-4 bg-yellow-600/10 border-2 border-yellow-600/40">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-500 mb-1">Downloads Paused</h3>
              <p className="text-sm text-text-secondary">
                The program was closed with items in the queue. Press <span className="font-semibold text-text-primary">Resume</span> to start downloading.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* All Queue Items in One Clean List */}
      {queueItems.length === 0 ? (
        <div className="text-center py-20 text-text-secondary">
          <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <p className="text-lg font-medium">Queue is empty</p>
          <p className="text-sm mt-2">Add videos from channels to start downloading</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Current Download - Click to Cancel */}
          {currentDownload && (
            <div
              onClick={handleCancel}
              className="card p-3 border-2 border-accent/40 bg-accent/5 relative cursor-pointer hover:bg-accent/10 transition-colors group"
            >
              <div className="flex items-start gap-3">
                {/* Thumbnail */}
                <div className="hidden md:block flex-shrink-0 w-[100px] h-[56px] bg-dark-tertiary rounded overflow-hidden">
                  {currentDownload.video?.thumb_url ? (
                    <img
                      src={currentDownload.video.thumb_url}
                      alt={currentDownload.video.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Video Info */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* Line 1: Title + Channel + Cancel hint */}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-text-primary font-medium line-clamp-2 md:truncate group-hover:text-red-400 transition-colors">
                      {currentDownload.video?.title} <span className="text-text-secondary">• {currentDownload.video?.channel_title}</span>
                    </p>
                    <span className="text-xs text-red-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      Click to cancel
                    </span>
                  </div>

                  {/* Line 2: Progress Bar */}
                  <div className="w-full bg-dark-tertiary rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-accent h-full transition-all duration-300"
                      style={{ width: `${currentDownload.progress_pct || 0}%` }}
                    ></div>
                  </div>

                  {/* Line 3: Progress Stats */}
                  <div className="flex items-center gap-4 text-xs text-text-secondary">
                    <span>{(currentDownload.progress_pct || 0).toFixed(1)}%</span>
                    <span>{formatBytes(currentDownload.speed_bps)}</span>
                    <span>Size: {formatFileSize(currentDownload.total_bytes)}</span>
                    <span>ETA: {formatTime(currentDownload.eta_seconds)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pending Items - Drag to Reorder */}
          {pendingItems.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={pendingItems.map(item => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {pendingItems.map((item, index) => (
                  <SortableQueueItem
                    key={item.id}
                    item={item}
                    index={index}
                    onRemove={handleRemove}
                    onMoveToTop={handleMoveToTop}
                    onMoveToBottom={handleMoveToBottom}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          {/* Completed Items - Limited to 5 recent, Click to Remove */}
          {completedItems.slice(0, 5).map(item => (
            <div
              key={item.id}
              onClick={() => handleRemove(item.id)}
              className="card p-3 bg-green-600/5 border-green-600/20 cursor-pointer hover:bg-green-600/10 transition-colors group"
            >
              <div className="flex items-center gap-3">
                {/* Thumbnail with checkmark overlay */}
                <div className="hidden md:block flex-shrink-0 w-[100px] h-[56px] bg-dark-tertiary rounded overflow-hidden relative">
                  {item.video?.thumb_url ? (
                    <img
                      src={item.video.thumb_url}
                      alt={item.video.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                      </svg>
                    </div>
                  )}
                  {/* Checkmark overlay */}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                </div>

                {/* Video Info */}
                <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                  <p className="text-sm text-text-primary font-medium line-clamp-2 md:truncate group-hover:text-green-400 transition-colors">
                    {item.video?.title} <span className="text-text-secondary">• {item.video?.channel_title}</span>
                  </p>
                  <span className="text-xs text-green-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    Click to remove
                  </span>
                </div>
              </div>
            </div>
          ))}

          {/* Failed Items - Click to Remove */}
          {failedItems.map(item => (
            <div
              key={item.id}
              onClick={() => handleRemove(item.id)}
              className="card p-3 bg-red-600/5 border-red-600/20 cursor-pointer hover:bg-red-600/10 transition-colors group"
            >
              <div className="flex items-start gap-3">
                {/* Thumbnail with error overlay */}
                <div className="hidden md:block flex-shrink-0 w-[100px] h-[56px] bg-dark-tertiary rounded overflow-hidden relative">
                  {item.video?.thumb_url ? (
                    <img
                      src={item.video.thumb_url}
                      alt={item.video.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                      </svg>
                    </div>
                  )}
                  {/* Error overlay */}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="15" y1="9" x2="9" y2="15"></line>
                      <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                  </div>
                </div>

                {/* Video Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-text-primary font-medium line-clamp-2 md:truncate group-hover:text-red-400 transition-colors">
                      {item.video?.title} <span className="text-text-secondary">• {item.video?.channel_title}</span>
                    </p>
                    <span className="text-xs text-red-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      Click to remove
                    </span>
                  </div>
                  {item.log && (
                    <p className="text-xs text-red-400 truncate">{item.log}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
