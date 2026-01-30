import { useState } from 'react';

// Database Maintenance Modal - Navigation menu to other modals
export function DatabaseMaintenanceModal({
  isOpen,
  onClose,
  repairData,
  missingMetadataData,
  onOpenNotFound,
  onOpenShrinkDB,
  onOpenMetadataFix
}) {
  if (!isOpen || !repairData) return null;

  const totalMetadataIssues = (missingMetadataData?.count || 0) +
    (missingMetadataData?.broken_thumbnails || 0) +
    (missingMetadataData?.missing_channel_thumbnails || 0) +
    (missingMetadataData?.missing_video_thumbnails || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Desktop - Glass Modal */}
      <div
        className="hidden sm:block relative backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-medium text-text-primary">Database Maintenance</h3>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {repairData.orphaned_cleaned > 0 && (
            <div className="bg-green-500/10 text-green-400 text-sm rounded-xl p-3 mb-4">
              ✓ Auto-cleaned {repairData.orphaned_cleaned} orphaned item{repairData.orphaned_cleaned !== 1 ? 's' : ''}
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={onOpenNotFound}
              className="flex items-center justify-between w-full p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
            >
              <div className="text-left">
                <p className="text-sm font-medium text-text-primary">Unavailable Videos</p>
                <p className="text-text-muted text-xs">Remove unplayable videos</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-lg">{repairData.not_found_videos?.length || 0}</span>
                <span className="text-text-muted">→</span>
              </div>
            </button>

            <button
              onClick={onOpenShrinkDB}
              className="flex items-center justify-between w-full p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
            >
              <div className="text-left">
                <p className="text-sm font-medium text-text-primary">Purge Channels</p>
                <p className="text-text-muted text-xs">Delete empty channels</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-lg">{repairData.deletable_channels?.length || 0}</span>
                <span className="text-text-muted">→</span>
              </div>
            </button>

            <button
              onClick={onOpenMetadataFix}
              className="flex items-center justify-between w-full p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
            >
              <div className="text-left">
                <p className="text-sm font-medium text-text-primary">Repair Metadata</p>
                <p className="text-text-muted text-xs">Fix missing thumbnails & dates</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-lg">{totalMetadataIssues}</span>
                <span className="text-text-muted">→</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile - Bottom Sheet */}
      <div
        className="sm:hidden fixed inset-x-0 bottom-0 backdrop-blur-xl bg-dark-secondary rounded-t-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="font-semibold text-text-primary">Database Maintenance</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
          >
            <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {repairData.orphaned_cleaned > 0 && (
          <div className="mx-4 mt-4 bg-green-500/10 text-green-400 text-sm rounded-xl p-3">
            ✓ Auto-cleaned {repairData.orphaned_cleaned} orphaned item{repairData.orphaned_cleaned !== 1 ? 's' : ''}
          </div>
        )}

        <div className="p-4 space-y-3">
          <button
            onClick={onOpenNotFound}
            className="flex items-center justify-between w-full p-4 bg-white/5 rounded-2xl active:bg-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="font-medium text-sm text-text-primary">Unavailable Videos</p>
                <p className="text-text-muted text-xs">{repairData.not_found_videos?.length || 0} found</p>
              </div>
            </div>
            <span className="text-text-muted">→</span>
          </button>

          <button
            onClick={onOpenShrinkDB}
            className="flex items-center justify-between w-full p-4 bg-white/5 rounded-2xl active:bg-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </div>
              <div className="text-left">
                <p className="font-medium text-sm text-text-primary">Purge Channels</p>
                <p className="text-text-muted text-xs">{repairData.deletable_channels?.length || 0} empty channels</p>
              </div>
            </div>
            <span className="text-text-muted">→</span>
          </button>

          <button
            onClick={onOpenMetadataFix}
            className="flex items-center justify-between w-full p-4 bg-white/5 rounded-2xl active:bg-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </div>
              <div className="text-left">
                <p className="font-medium text-sm text-text-primary">Repair Metadata</p>
                <p className="text-text-muted text-xs">Fix missing info</p>
              </div>
            </div>
            <span className="text-text-muted">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Not Found Videos Modal - Selection list
export function NotFoundVideosModal({
  isOpen,
  onClose,
  videos,
  selectedVideos,
  setSelectedVideos,
  onRemove,
  isRemoving
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-dark-secondary border border-dark-border-light rounded-lg shadow-xl max-w-2xl w-full">
        <div className="px-6 py-4 border-b border-dark-border">
          <h3 className="text-lg font-semibold text-text-primary">Videos Not Found on YT</h3>
        </div>
        <div className="px-6 py-4">
          {videos?.length === 0 ? (
            <p className="text-sm text-text-secondary">✓ No videos to remove</p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm text-text-secondary mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedVideos.length === videos.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedVideos(videos.map(v => v.id));
                    } else {
                      setSelectedVideos([]);
                    }
                  }}
                />
                Select all videos to remove from database:
              </label>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {videos.map((video) => (
                  <label key={video.id} className="flex items-start gap-3 p-3 bg-dark-tertiary hover:bg-dark-hover border border-dark-border rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedVideos.includes(video.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedVideos([...selectedVideos, video.id]);
                        } else {
                          setSelectedVideos(selectedVideos.filter(id => id !== video.id));
                        }
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-text-primary truncate">{video.title}</div>
                      <div className="text-xs text-text-secondary">Channel: {video.channel_name}</div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-dark-border flex gap-3">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Cancel
          </button>
          {videos?.length > 0 && (
            <button
              onClick={onRemove}
              disabled={selectedVideos.length === 0 || isRemoving}
              className="btn bg-red-600 hover:bg-red-700 text-white flex-1 disabled:opacity-50"
            >
              {isRemoving ? 'Removing...' : `Remove Selected (${selectedVideos.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Shrink Database Modal - Selection list
export function ShrinkDatabaseModal({
  isOpen,
  onClose,
  channels,
  selectedChannels,
  setSelectedChannels,
  onPurge,
  isRemoving
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-dark-secondary border border-dark-border-light rounded-lg shadow-xl max-w-2xl w-full">
        <div className="px-6 py-4 border-b border-dark-border">
          <h3 className="text-lg font-semibold text-text-primary">Shrink Database</h3>
        </div>
        <div className="px-6 py-4">
          {channels?.length === 0 ? (
            <p className="text-sm text-text-secondary">✓ No channels to purge</p>
          ) : (
            <>
              <p className="text-sm text-text-secondary mb-3">Select deleted channels to permanently remove:</p>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {channels.map((channel) => (
                  <label key={channel.id} className="flex items-start gap-3 p-3 bg-dark-tertiary hover:bg-dark-hover border border-dark-border rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes(channel.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedChannels([...selectedChannels, channel.id]);
                        } else {
                          setSelectedChannels(selectedChannels.filter(id => id !== channel.id));
                        }
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-text-primary truncate">{channel.title}</div>
                      <div className="text-xs text-text-secondary">{channel.video_count} video{channel.video_count !== 1 ? 's' : ''} • No library videos</div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-dark-border flex gap-3">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Cancel
          </button>
          {channels?.length > 0 && (
            <button
              onClick={onPurge}
              disabled={selectedChannels.length === 0 || isRemoving}
              className="btn bg-red-600 hover:bg-red-700 text-white flex-1 disabled:opacity-50"
            >
              {isRemoving ? 'Purging...' : `Purge Selected (${selectedChannels.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Metadata Fix Modal - Accordion with issue sections
export function MetadataFixModal({
  isOpen,
  onClose,
  data,
  onFix,
  isFixing,
  hasApiKey
}) {
  if (!isOpen || !data) return null;

  const totalIssues = (data.count || 0) +
    (data.broken_thumbnails || 0) +
    (data.missing_channel_thumbnails || 0) +
    (data.missing_video_thumbnails || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-dark-secondary border border-dark-border-light rounded-xl shadow-2xl max-w-2xl w-full animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-accent/15">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Repair Metadata</h3>
              <p className="text-xs text-text-muted">{totalIssues} issue{totalIssues !== 1 ? 's' : ''} found</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center bg-dark-tertiary text-text-secondary hover:text-text-primary transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          {totalIssues === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full flex items-center justify-center bg-green-500/15 mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-text-primary">All Clear</p>
              <p className="text-xs text-text-muted">No metadata issues found</p>
            </div>
          ) : (
            <>
              <IssueSection
                title="Missing Upload Dates"
                count={data.count || 0}
                items={data.videos}
                icon={<svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>}
              />
              <IssueSection
                title="Broken Thumbnail URLs"
                count={data.broken_thumbnails || 0}
                items={[]}
                icon={<svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>}
              />
              <IssueSection
                title="Missing Channel Thumbnails"
                count={data.missing_channel_thumbnails || 0}
                items={data.missing_channel_thumbs_list}
                isChannel={true}
                icon={<svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>}
              />
              <IssueSection
                title="Missing Video Thumbnails"
                count={data.missing_video_thumbnails || 0}
                items={data.missing_video_thumbs_list}
                icon={<svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-dark-border flex items-center justify-between bg-dark-tertiary/50">
          <p className="text-xs text-text-muted">
            {hasApiKey ? <><span className="text-accent">Tip:</span> Will use YT API for fast fetching</> : <><span className="text-yellow-500">Note:</span> Add API key for faster processing</>}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn btn-secondary">Cancel</button>
            {totalIssues > 0 && (
              <button onClick={onFix} disabled={isFixing} className="btn btn-primary disabled:opacity-50 flex items-center gap-2">
                {isFixing ? 'Fixing...' : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                    Fix {totalIssues} Issue{totalIssues !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Issue Section component for MetadataFixModal
function IssueSection({ title, count, items, icon, isChannel }) {
  const [expanded, setExpanded] = useState(false);

  if (count === 0) return null;

  return (
    <div className="rounded-lg bg-dark-tertiary border border-dark-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-dark-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
          <span className="text-sm font-medium text-text-primary">{title}</span>
          <span className="px-2 py-0.5 rounded text-xs font-mono bg-dark-hover text-text-secondary">
            {count} {isChannel ? (count === 1 ? 'channel' : 'channels') : (count === 1 ? 'video' : 'videos')}
          </span>
        </div>
        <svg className={`w-4 h-4 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {expanded && items?.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          {items.slice(0, 20).map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded bg-dark-primary/50">
              <div className={`w-8 h-8 ${isChannel ? 'rounded-full' : 'rounded'} flex-shrink-0 flex items-center justify-center bg-dark-hover`}>
                {icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-text-primary truncate">{item.title}</div>
                {item.channel_title && <div className="text-xs text-text-muted">{item.channel_title}</div>}
                {isChannel && <div className="text-xs font-mono text-text-muted">{item.yt_id?.slice(0, 8)}...</div>}
              </div>
            </div>
          ))}
          {count > 20 && (
            <p className="text-xs text-text-muted text-center py-2">...and {count - 20} more</p>
          )}
        </div>
      )}
    </div>
  );
}
