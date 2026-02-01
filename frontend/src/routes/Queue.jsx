import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useQueue, useResumeQueue, useCancelCurrent, useRemoveFromQueue, useReorderQueue, useMoveToTop, useMoveToBottom, useClearQueue } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { getUserFriendlyError, formatFileSize } from '../utils/utils';
import { useTheme } from '../contexts/PreferencesContext';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ConfirmModal } from '../components/ui/SharedModals';
import { StickyBar } from '../components/stickybar';
import { LoadingSpinner, EmptyState, useScrollToTop, ScrollToTopButton } from '../components/ListFeedback';

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
      className={`card p-3 transition-colors ${index % 2 === 0 ? 'bg-dark-secondary' : 'bg-dark-tertiary'}`}
    >
      <div className="flex items-stretch gap-3">
        {/* Drag Handle - Touch friendly with visual feedback */}
        <div
          {...attributes}
          {...listeners}
          className="flex items-center flex-shrink-0 cursor-grab active:cursor-grabbing text-text-muted hover:text-text-primary active:text-accent transition-colors px-2 md:px-1 touch-none rounded hover:bg-dark-hover active:bg-dark-tertiary"
          style={{ touchAction: 'none' }}
          title="Hold and drag to reorder"
        >
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="5" r="2"></circle>
            <circle cx="9" cy="12" r="2"></circle>
            <circle cx="9" cy="19" r="2"></circle>
            <circle cx="15" cy="5" r="2"></circle>
            <circle cx="15" cy="12" r="2"></circle>
            <circle cx="15" cy="19" r="2"></circle>
          </svg>
        </div>

        {/* Position Number */}
        <div className="flex items-center flex-shrink-0 w-8 text-center text-sm font-semibold text-text-secondary">
          {index + 1}
        </div>

        {/* Center Clickable Area - Thumbnail + Title (click to cancel) */}
        <div
          onClick={() => onRemove(item.id)}
          className="group flex-1 flex items-center gap-3 cursor-pointer hover:bg-red-950/30 rounded-lg px-2 -mx-2 transition-colors"
        >
          {/* Thumbnail - Smaller on mobile */}
          <div className="flex-shrink-0 w-[60px] h-[34px] md:w-[100px] md:h-[56px] bg-dark-tertiary rounded overflow-hidden">
            {item.video?.thumb_url ? (
              <img
                src={item.video.thumb_url}
                alt={item.video.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-5 h-5 md:w-8 md:h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                </svg>
              </div>
            )}
          </div>

          {/* Video Info */}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p className="text-sm text-text-primary font-medium line-clamp-2 md:truncate group-hover:text-red-400 transition-colors" title={item.video?.title}>
              {item.video?.title} <span className="text-text-secondary">• {item.video?.channel_title}</span>
            </p>
            {/* Click to cancel - appears on hover, centered */}
            <p className="text-xs text-red-400 text-center opacity-0 group-hover:opacity-100 transition-opacity mt-1">
              Click to cancel
            </p>
          </div>
        </div>

        {/* Action Buttons - Full Height */}
        <div className="flex flex-shrink-0 gap-1 -my-3">
          {/* Move to Top - Full height bar */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.currentTarget.blur();
              onMoveToTop(item.id);
            }}
            className="flex items-center justify-center px-2 text-text-secondary hover:text-text-primary hover:bg-dark-tertiary transition-colors"
            title="Move to top"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="17 11 12 6 7 11"></polyline>
              <polyline points="17 18 12 13 7 18"></polyline>
            </svg>
          </button>

          {/* Move to Bottom - Full height bar */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.currentTarget.blur();
              onMoveToBottom(item.id);
            }}
            className="flex items-center justify-center px-2 text-text-secondary hover:text-text-primary hover:bg-dark-tertiary transition-colors"
            title="Move to bottom"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="17 13 12 18 7 13"></polyline>
              <polyline points="17 6 12 11 7 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Queue() {
  // Queue data - fetch directly with polling fallback (don't rely solely on SSE)
  const { data: queue, isLoading, refetch } = useQueue({ enablePolling: true });
  const resumeQueue = useResumeQueue();
  const cancelCurrent = useCancelCurrent();
  const removeFromQueue = useRemoveFromQueue();
  const reorderQueue = useReorderQueue();
  const moveToTop = useMoveToTop();
  const moveToBottom = useMoveToBottom();
  const clearQueue = useClearQueue();
  const { showNotification } = useNotification();
  const { theme } = useTheme();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { showButton: showScrollTop, scrollToTop } = useScrollToTop();

  // Check if current theme is a light theme
  const isLightTheme = theme === 'online' || theme === 'pixel' || theme === 'debug';

  // Track scroll position to preserve it during queue updates from move operations
  const scrollPositionRef = useRef(null);
  const preserveScrollRef = useRef(false);

  // Preserve scroll position when queue data updates from move operations
  // useLayoutEffect runs synchronously after DOM updates but BEFORE browser paint
  // This prevents visible scroll jumps
  useLayoutEffect(() => {
    if (preserveScrollRef.current && scrollPositionRef.current !== null) {
      window.scrollTo(0, scrollPositionRef.current);
      preserveScrollRef.current = false;
      scrollPositionRef.current = null;
    }
  }, [queue]);

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

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const handleResume = async () => {
    try {
      await resumeQueue.mutateAsync();
      showNotification('Queue resumed', 'success');
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'resume queue'), 'error');
    }
  };

  const handleClear = async () => {
    try {
      const result = await clearQueue.mutateAsync();
      showNotification(result.message || 'Queue cleared', 'success');
      setShowClearConfirm(false);
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'clear queue'), 'error');
    }
  };

  const handleCancel = async () => {
    try {
      await cancelCurrent.mutateAsync();
      showNotification('Download cancelled', 'success');
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'cancel download'), 'error');
    }
  };

  const handleRemove = async (itemId) => {
    try {
      await removeFromQueue.mutateAsync(itemId);
      showNotification('Removed from queue', 'success');
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'remove from queue'), 'error');
    }
  };

  const handleMoveToTop = async (itemId) => {
    try {
      // Save scroll position before mutation
      scrollPositionRef.current = window.scrollY;
      preserveScrollRef.current = true;

      await moveToTop.mutateAsync(itemId);
      showNotification('Moved to top of queue', 'success');
    } catch (error) {
      // Reset flags on error
      preserveScrollRef.current = false;
      scrollPositionRef.current = null;
      showNotification(getUserFriendlyError(error.message, 'reorder queue'), 'error');
    }
  };

  const handleMoveToBottom = async (itemId) => {
    try {
      // Save scroll position before mutation
      scrollPositionRef.current = window.scrollY;
      preserveScrollRef.current = true;

      await moveToBottom.mutateAsync(itemId);
      showNotification('Moved to bottom of queue', 'success');
    } catch (error) {
      // Reset flags on error
      preserveScrollRef.current = false;
      scrollPositionRef.current = null;
      showNotification(getUserFriendlyError(error.message, 'reorder queue'), 'error');
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
      showNotification(getUserFriendlyError(error.message, 'reorder queue'), 'error');
    }
  };

  // Handle queue data structure
  const queueItems = queue?.queue_items || [];
  const currentDownload = queue?.current_download || queueItems.find(item => item.video?.status === 'downloading');
  const pendingItems = queueItems.filter(item => item.video?.status === 'queued') || [];

  // Check if worker is paused and there are queued items
  const workerPaused = queue?.is_paused;
  const hasQueuedItems = pendingItems.length > 0 || currentDownload;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* StickyBar with queue controls */}
      <StickyBar>
        <div className="flex items-center justify-center gap-4">
          <div className="flex space-x-2 items-center">
            {/* Only show Resume when queue is paused AND has items */}
            {workerPaused && hasQueuedItems && (
              <button
                onClick={handleResume}
                disabled={resumeQueue.isPending}
                className="px-2 md:px-4 py-1 md:py-1.5 text-xs md:text-sm bg-accent hover:bg-accent-hover text-white rounded transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resumeQueue.isPending ? 'Resuming...' : 'Resume'}
              </button>
            )}
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={clearQueue.isPending}
              className="px-2 md:px-4 py-1 md:py-1.5 text-xs md:text-sm bg-dark-hover hover:bg-dark-tertiary border border-dark-border-light rounded text-text-primary transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {clearQueue.isPending ? 'Clearing...' : 'Clear Queue'}
            </button>

            {/* Delay Countdown Indicator */}
            {queue?.delay_info && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-secondary border border-dark-border-light rounded">
                <span className="text-xs font-medium text-yellow-500">
                  [{queue.delay_info}]
                </span>
              </div>
            )}
          </div>
        </div>
      </StickyBar>

      {/* Show message if worker is paused with items in queue */}
      {workerPaused && hasQueuedItems && (
        <div className={`card p-4 ${isLightTheme ? 'bg-yellow-900/30 border-2 border-yellow-700' : 'bg-yellow-600/10 border-2 border-yellow-600/40'}`}>
          <div className="flex items-start gap-3">
            <svg className={`w-6 h-6 ${isLightTheme ? 'text-yellow-700' : 'text-yellow-500'} flex-shrink-0 mt-0.5`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h3 className={`text-lg font-semibold ${isLightTheme ? 'text-yellow-800' : 'text-yellow-500'} mb-1`}>Downloads Paused</h3>
              <p className={`text-sm ${isLightTheme ? 'text-gray-800' : 'text-text-secondary'}`}>
                The program was closed with items in the queue. Press <span className={`font-semibold ${isLightTheme ? 'text-black' : 'text-text-primary'}`}>Resume</span> to start downloading.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* All Queue Items in One Clean List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : queueItems.length === 0 ? (
        <EmptyState
          icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />}
          title="Queue is empty"
          message="Add videos from channels to start downloading"
        />
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
                    <p className="text-sm text-text-primary font-medium line-clamp-2 md:truncate group-hover:text-red-400 transition-colors" title={currentDownload.video?.title}>
                      {currentDownload.video?.title} <span className="text-text-secondary">• {currentDownload.video?.channel_title}</span>
                    </p>
                    <span className="text-xs text-red-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      Click to cancel
                    </span>
                  </div>

                  {/* Line 2: Progress Bar */}
                  <div className="w-full bg-dark-tertiary rounded-full h-1.5 overflow-hidden">
                    {currentDownload.phase === 'postprocessing' ? (
                      <div className="bg-accent h-full w-1/3 animate-pulse" style={{ animation: 'indeterminate 1.5s infinite linear' }} />
                    ) : (
                      <div
                        className="bg-accent h-full transition-all duration-300"
                        style={{ width: `${currentDownload.progress_pct || 0}%` }}
                      />
                    )}
                  </div>

                  {/* Line 3: Progress Stats */}
                  <div className="flex items-center gap-4 text-xs text-text-secondary">
                    {currentDownload.phase === 'postprocessing' ? (
                      <>
                        <span className="text-accent font-medium flex items-center gap-2">
                          <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                          Processing ({Math.floor((currentDownload.postprocess_elapsed || 0) / 60)}:{((currentDownload.postprocess_elapsed || 0) % 60).toString().padStart(2, '0')})
                        </span>
                        <span className="text-text-muted">Finishing up...</span>
                      </>
                    ) : (
                      <>
                        <span>{(currentDownload.progress_pct || 0).toFixed(1)}%</span>
                        <span>{formatBytes(currentDownload.speed_bps)}</span>
                        <span>Size: {formatFileSize(currentDownload.total_bytes)}</span>
                        <span>ETA: {formatTime(currentDownload.eta_seconds)}</span>
                      </>
                    )}
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

        </div>
      )}

      <ScrollToTopButton show={showScrollTop} onClick={scrollToTop} />

      {/* Clear Queue Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear Queue"
        message={
          <>
            Are you sure you want to clear all <span className="font-semibold">{pendingItems.length} pending items</span>?
            The currently downloading video will not be affected.
          </>
        }
        confirmText="Clear Queue"
        confirmStyle="danger"
        onConfirm={handleClear}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
