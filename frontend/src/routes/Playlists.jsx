import { useState } from 'react';
import { usePlaylists, useDeletePlaylist } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { Link } from 'react-router-dom';
import PlaylistModal from '../components/PlaylistModal';

export default function Playlists() {
  const { data: playlists, isLoading } = usePlaylists();
  const deletePlaylist = useDeletePlaylist();
  const { showNotification } = useNotification();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const handleDelete = async (id) => {
    try {
      await deletePlaylist.mutateAsync(id);
      showNotification('Playlist deleted', 'success');
      setDeleteConfirm(null);
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  if (isLoading) {
    return <div className="text-center py-20 text-text-secondary">Loading playlists...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-text-primary">Playlists</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary"
        >
          Create Playlist
        </button>
      </div>

      {/* Playlists Grid */}
      {playlists && playlists.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {playlists.map((playlist) => (
            <div key={playlist.id} className="card group">
              <Link to={`/playlist/${playlist.id}`} className="block">
                {/* Thumbnail placeholder - could show first video thumbnail */}
                <div className="relative aspect-video bg-dark-tertiary rounded-t-xl overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-16 h-16 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                    </svg>
                  </div>
                  {/* Video count badge */}
                  <div className="absolute bottom-2 right-2 bg-black/90 text-white px-2 py-0.5 rounded text-xs font-medium backdrop-blur-sm">
                    {playlist.video_count || 0} videos
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="text-base font-semibold text-text-primary line-clamp-2 group-hover:text-accent transition-colors">
                    {playlist.name}
                  </h3>
                  <p className="text-sm text-text-secondary mt-1">
                    {new Date(playlist.created_at).toLocaleDateString()}
                  </p>
                </div>
              </Link>

              {/* 3-dot menu */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingPlaylist(playlist);
                  }}
                  className="p-2 rounded-full bg-dark-secondary/80 backdrop-blur-sm border border-dark-border hover:bg-dark-hover transition-colors"
                >
                  <svg className="w-4 h-4 text-text-primary" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
              </div>

              {/* Edit/Delete menu */}
              {editingPlaylist?.id === playlist.id && (
                <div className="absolute top-12 right-2 bg-dark-secondary border border-dark-border rounded-lg shadow-xl z-50 w-[160px] animate-scale-in">
                  <div className="py-1">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowCreateModal(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors"
                    >
                      Rename
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteConfirm({ id: playlist.id, name: playlist.name });
                        setEditingPlaylist(null);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-900/30 transition-colors border-t border-dark-border"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-text-secondary">
          <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p className="text-lg font-medium">No playlists yet</p>
          <p className="text-sm mt-2">Create a playlist to organize your videos</p>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <PlaylistModal
          playlist={editingPlaylist}
          onClose={() => {
            setShowCreateModal(false);
            setEditingPlaylist(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center animate-fade-in"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="bg-dark-secondary rounded-xl border border-dark-border p-6 w-full max-w-md animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-text-primary mb-3">Delete Playlist</h3>
            <p className="text-text-secondary mb-4">
              Are you sure you want to delete "{deleteConfirm.name}"?
            </p>
            <p className="text-sm text-yellow-400 mb-6">
              ⚠️ This will remove all videos from this playlist. Videos will not be deleted from your library.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="btn bg-red-600 hover:bg-red-700 text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
