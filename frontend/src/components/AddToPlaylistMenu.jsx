import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePlaylists, useAddVideoToPlaylist, useAddVideosToPlaylistBulk, useRemoveVideoFromPlaylist, useCreatePlaylist } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { getUserFriendlyError } from '../utils/utils';

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
        const menuWidth = 320; // w-80 = 320px
        const menuHeight = 500; // max-h-[500px]
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left, top;

        // Center horizontally on screen by default
        left = (viewportWidth - menuWidth) / 2;

        // Ensure it doesn't go off screen edges
        if (left < 10) {
          left = 10;
        } else if (left + menuWidth > viewportWidth - 10) {
          left = viewportWidth - menuWidth - 10;
        }

        // Center vertically, or align with trigger if in upper half of screen
        if (triggerRect.top < viewportHeight / 2) {
          // Trigger is in upper half - align with trigger top
          top = triggerRect.top;
        } else {
          // Trigger is in lower half - center on screen
          top = (viewportHeight - menuHeight) / 2;
        }

        // Ensure it doesn't go off screen vertically
        if (top < 10) {
          top = 10;
        } else if (top + menuHeight > viewportHeight - 10) {
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
      showNotification(getUserFriendlyError(error.message, 'update playlist'), 'error');
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
      showNotification(getUserFriendlyError(error.message, 'add to playlist'), 'error');
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
      showNotification(getUserFriendlyError(error.message, 'create playlist'), 'error');
      onClose();
    }
  };

  const menuContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-[99998]"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />

      {/* Desktop - Glass Modal */}
      <div
        ref={menuRef}
        className="hidden sm:flex fixed backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl w-80 max-h-[400px] flex-col shadow-2xl z-[99999]"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <p className="text-sm font-medium text-text-primary">Save to playlist</p>
        </div>

        {/* Playlists list */}
        <div className="flex-1 overflow-y-auto max-h-52">
          {playlists && playlists.length > 0 ? (
            [...playlists].sort((a, b) => a.name.localeCompare(b.name)).map((playlist) => {
              const isInPlaylist = existingPlaylistIds.has(playlist.id);
              return (
                <label
                  key={playlist.id}
                  onClick={() => {
                    if (isBulk) {
                      handleAddToPlaylist(playlist.id);
                    } else {
                      handleTogglePlaylist(playlist.id, isInPlaylist);
                    }
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                    isInPlaylist ? 'bg-accent' : 'border border-dark-border-light'
                  }`}>
                    {isInPlaylist && (
                      <svg className="w-3 h-3 text-dark-deepest" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-text-primary flex-1 truncate">{playlist.name}</span>
                </label>
              );
            })
          ) : (
            <div className="text-center py-6 text-text-muted text-sm">No playlists yet</div>
          )}
        </div>

        {/* Create new playlist */}
        <div className="p-3 border-t border-white/10">
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/20 hover:border-accent hover:text-accent text-text-muted text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              New playlist
            </button>
          ) : (
            <form onSubmit={handleCreateAndAdd} className="space-y-2">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Playlist name"
                className="w-full bg-white/5 rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setNewPlaylistName('');
                  }}
                  className="flex-1 py-2 text-sm rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-sm rounded-xl bg-accent/90 hover:bg-accent text-dark-deepest font-medium transition-colors"
                  disabled={createPlaylist.isLoading || addToPlaylist.isLoading}
                >
                  Create
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Mobile - Bottom Sheet */}
      <div
        className="sm:hidden fixed inset-x-0 bottom-0 backdrop-blur-xl bg-dark-secondary rounded-t-3xl z-[99999]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="font-semibold text-text-primary">Save to playlist</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
          >
            <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Playlists list */}
        <div className="max-h-64 overflow-y-auto">
          {playlists && playlists.length > 0 ? (
            [...playlists].sort((a, b) => a.name.localeCompare(b.name)).map((playlist) => {
              const isInPlaylist = existingPlaylistIds.has(playlist.id);
              return (
                <label
                  key={playlist.id}
                  onClick={() => {
                    if (isBulk) {
                      handleAddToPlaylist(playlist.id);
                    } else {
                      handleTogglePlaylist(playlist.id, isInPlaylist);
                    }
                  }}
                  className="flex items-center gap-4 px-5 py-4 active:bg-white/5 border-b border-white/5 cursor-pointer"
                >
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                    isInPlaylist ? 'bg-accent' : 'border-2 border-white/20'
                  }`}>
                    {isInPlaylist && (
                      <svg className="w-4 h-4 text-dark-deepest" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </div>
                  <span className="text-base flex-1 text-text-primary">{playlist.name}</span>
                  <span className="text-text-muted text-sm">{playlist.video_count || 0}</span>
                </label>
              );
            })
          ) : (
            <div className="text-center py-8 text-text-muted">No playlists yet</div>
          )}
        </div>

        {/* Create new playlist */}
        <div className="p-4 border-t border-white/10">
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-4 flex items-center justify-center gap-2 border border-dashed border-white/20 rounded-2xl text-text-secondary"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              New playlist
            </button>
          ) : (
            <form onSubmit={handleCreateAndAdd} className="space-y-3">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Playlist name"
                className="w-full bg-white/5 rounded-xl px-4 py-3.5 text-base text-text-primary placeholder-text-muted focus:outline-none border-2 border-transparent focus:border-accent"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setNewPlaylistName('');
                  }}
                  className="flex-1 py-3.5 bg-white/5 rounded-xl text-text-secondary font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 bg-accent rounded-xl text-dark-deepest font-semibold"
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
