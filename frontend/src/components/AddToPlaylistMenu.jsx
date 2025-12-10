import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePlaylists, useAddVideoToPlaylist, useAddVideosToPlaylistBulk, useRemoveVideoFromPlaylist, useCreatePlaylist } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';

export default function AddToPlaylistMenu({ videoId, videoIds, onClose, video, triggerRef }) {
  const { data: playlists } = usePlaylists();
  const addToPlaylist = useAddVideoToPlaylist();
  const addToPlaylistBulk = useAddVideosToPlaylistBulk();
  const removeFromPlaylist = useRemoveVideoFromPlaylist();
  const createPlaylist = useCreatePlaylist();
  const { showNotification } = useNotification();

  const [showCreate, setShowCreate] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);

  // Support both single video and multiple videos
  const isBulk = videoIds && videoIds.length > 0;
  const videosToAdd = isBulk ? videoIds : [videoId];

  // Get playlist IDs that already contain this video (only for single video)
  const existingPlaylistIds = !isBulk && video && video.playlist_ids ? new Set(video.playlist_ids) : new Set();

  // Calculate position based on trigger element and available space
  useEffect(() => {
    const calculatePosition = () => {
      if (triggerRef?.current) {
        const triggerRect = triggerRef.current.getBoundingClientRect();
        const menuWidth = 384; // max-w-sm = 384px
        const menuHeight = 500; // max-h-[500px]
        const gap = 10;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left, top;

        // Check if there's room on the right
        if (triggerRect.right + gap + menuWidth < viewportWidth) {
          // Position to the right
          left = triggerRect.right + gap;
        } else if (triggerRect.left - gap - menuWidth > 0) {
          // Position to the left
          left = triggerRect.left - gap - menuWidth;
        } else {
          // Center on screen if neither side has room
          left = (viewportWidth - menuWidth) / 2;
        }

        // Position vertically, ensuring it doesn't go off screen
        top = triggerRect.top;
        if (top + menuHeight > viewportHeight) {
          top = Math.max(10, viewportHeight - menuHeight - 10);
        }

        setPosition({ top, left });
      }
    };

    // Calculate immediately
    calculatePosition();

    // Recalculate on window resize
    window.addEventListener('resize', calculatePosition);
    return () => window.removeEventListener('resize', calculatePosition);
  }, [triggerRef]);

  const handleTogglePlaylist = async (playlistId, isInPlaylist) => {
    try {
      if (isBulk) {
        // Bulk mode: toggle all selected videos
        for (const vidId of videosToAdd) {
          if (isInPlaylist) {
            await removeFromPlaylist.mutateAsync({ playlistId, videoId: vidId });
          } else {
            await addToPlaylist.mutateAsync({ playlistId, videoId: vidId });
          }
        }
        const action = isInPlaylist ? 'removed from' : 'added to';
        showNotification(`${videosToAdd.length} video${videosToAdd.length > 1 ? 's' : ''} ${action} playlist`, 'success');
      } else {
        // Single video mode
        if (isInPlaylist) {
          // Remove from playlist
          await removeFromPlaylist.mutateAsync({ playlistId, videoId });
          showNotification('Removed from playlist', 'success');
        } else {
          // Add to playlist
          await addToPlaylist.mutateAsync({ playlistId, videoId });
          showNotification('Added to playlist', 'success');
        }
      }
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleAddToPlaylist = async (playlistId) => {
    try {
      if (isBulk) {
        // Use bulk endpoint for better performance
        const result = await addToPlaylistBulk.mutateAsync({ playlistId, videoIds: videosToAdd });

        if (result.skipped_count > 0) {
          showNotification(
            `${result.added_count} videos added to playlist, ${result.skipped_count} already in playlist`,
            'success'
          );
        } else {
          showNotification(`${result.added_count} videos added to playlist`, 'success');
        }
      } else {
        // Single video - use regular endpoint
        await addToPlaylist.mutateAsync({ playlistId, videoId: videosToAdd[0] });
        showNotification('Added to playlist', 'success');
      }

      onClose();
    } catch (error) {
      showNotification(error.message, 'error');
      onClose();
    }
  };

  const handleCreateAndAdd = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) {
      showNotification('Please enter a playlist name', 'error');
      return;
    }

    try {
      const newPlaylist = await createPlaylist.mutateAsync({ name: newPlaylistName });

      if (isBulk) {
        // Use bulk endpoint for better performance
        const result = await addToPlaylistBulk.mutateAsync({ playlistId: newPlaylist.id, videoIds: videosToAdd });
        showNotification(`Playlist created and ${result.added_count} videos added`, 'success');
      } else {
        // Single video
        await addToPlaylist.mutateAsync({ playlistId: newPlaylist.id, videoId: videosToAdd[0] });
        showNotification('Playlist created and video added', 'success');
      }

      onClose();
    } catch (error) {
      showNotification(error.message, 'error');
      onClose();
    }
  };

  const menuContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[99998]"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />

      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed bg-dark-secondary rounded-xl border border-dark-border w-full max-w-sm max-h-[500px] flex flex-col animate-scale-in shadow-2xl z-[99999]"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h3 className="text-lg font-semibold text-text-primary">Save to playlist</h3>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Playlists list */}
        <div className="flex-1 overflow-y-auto p-2">
          {playlists && playlists.length > 0 ? (
            <div className="space-y-1">
              {[...playlists].sort((a, b) => a.name.localeCompare(b.name)).map((playlist) => {
                const isInPlaylist = existingPlaylistIds.has(playlist.id);
                return (
                  <button
                    key={playlist.id}
                    onClick={() => {
                      if (isBulk) {
                        handleAddToPlaylist(playlist.id);
                      } else {
                        handleTogglePlaylist(playlist.id, isInPlaylist);
                      }
                    }}
                    className="w-full px-3 py-2 text-left rounded-lg hover:bg-dark-hover transition-colors flex items-center gap-3"
                  >
                    {/* Checkbox */}
                    <div className={`w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                      isInPlaylist
                        ? 'bg-accent border-accent'
                        : 'border-text-secondary bg-transparent'
                    }`}>
                      {isInPlaylist && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      )}
                    </div>

                    {/* Playlist info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate" title={playlist.name}>{playlist.name}</div>
                      <div className="text-xs text-text-secondary">
                        {playlist.video_count || 0} videos
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-text-secondary">
              <p className="text-sm">No playlists yet</p>
            </div>
          )}
        </div>

        {/* Create new playlist */}
        <div className="border-t border-dark-border p-3">
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full px-3 py-2 text-left rounded-lg hover:bg-dark-hover transition-colors flex items-center gap-2 text-sm font-medium text-accent-text"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Create new playlist
            </button>
          ) : (
            <form onSubmit={handleCreateAndAdd} className="space-y-2">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Playlist name"
                className="w-full px-3 py-2 bg-dark-tertiary border border-dark-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setNewPlaylistName('');
                  }}
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-dark-tertiary hover:bg-dark-hover text-text-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-dark-tertiary hover:bg-dark-hover text-text-primary font-medium border border-dark-border-light transition-colors"
                  disabled={createPlaylist.isLoading || addToPlaylist.isLoading}
                >
                  Create
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(menuContent, document.body);
}
