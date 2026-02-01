import { useState, useEffect } from 'react';
import { ResponsiveModal } from './SharedModals';
import { CloseIcon } from '../Icons';

// Database Maintenance Modal - Navigation menu to other modals
export function DatabaseMaintenanceModal({
  isOpen,
  onClose,
  repairData,
  missingMetadataData,
  sponsorblockData,
  onOpenNotFound,
  onOpenShrinkDB,
  onOpenMetadataFix,
  onOpenSponsorblock
}) {
  if (!repairData) return null;

  const totalMetadataIssues = (missingMetadataData?.count || 0) +
    (missingMetadataData?.broken_thumbnails || 0) +
    (missingMetadataData?.missing_channel_thumbnails || 0) +
    (missingMetadataData?.missing_video_thumbnails || 0);

  const sponsorblockCount = sponsorblockData?.count || 0;
  const sponsorblockDisabled = sponsorblockData?.message && sponsorblockData.message.includes('not enabled');

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title="Database Maintenance">
      {repairData.orphaned_cleaned > 0 && (
        <div className="bg-green-500/10 text-green-400 text-sm rounded-xl p-3 mb-4">
          ✓ Auto-cleaned {repairData.orphaned_cleaned} orphaned item{repairData.orphaned_cleaned !== 1 ? 's' : ''}
        </div>
      )}

      <div className="space-y-3">
        <button
          onClick={onOpenNotFound}
          className="flex items-center justify-between w-full p-3 sm:p-3 p-4 bg-white/5 hover:bg-white/10 sm:hover:bg-white/10 active:bg-white/10 rounded-xl sm:rounded-xl rounded-2xl transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="hidden sm:block" />
            <div className="sm:hidden w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">Unavailable Videos</p>
              <p className="text-text-muted text-xs">Remove unplayable videos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-lg">{repairData.not_found_videos?.length || 0}</span>
            <span className="text-text-muted">→</span>
          </div>
        </button>

        <button
          onClick={onOpenShrinkDB}
          className="flex items-center justify-between w-full p-3 sm:p-3 p-4 bg-white/5 hover:bg-white/10 sm:hover:bg-white/10 active:bg-white/10 rounded-xl sm:rounded-xl rounded-2xl transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="hidden sm:block" />
            <div className="sm:hidden w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">Purge Channels</p>
              <p className="text-text-muted text-xs">Delete empty channels</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-lg">{repairData.deletable_channels?.length || 0}</span>
            <span className="text-text-muted">→</span>
          </div>
        </button>

        <button
          onClick={onOpenMetadataFix}
          className="flex items-center justify-between w-full p-3 sm:p-3 p-4 bg-white/5 hover:bg-white/10 sm:hover:bg-white/10 active:bg-white/10 rounded-xl sm:rounded-xl rounded-2xl transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="hidden sm:block" />
            <div className="sm:hidden w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">Repair Metadata</p>
              <p className="text-text-muted text-xs">Fix missing thumbnails & dates</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-lg">{totalMetadataIssues}</span>
            <span className="text-text-muted">→</span>
          </div>
        </button>

        <button
          onClick={onOpenSponsorblock}
          className={`flex items-center justify-between w-full p-3 sm:p-3 p-4 bg-white/5 rounded-xl sm:rounded-xl rounded-2xl transition-colors ${
            sponsorblockDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 sm:hover:bg-white/10 active:bg-white/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="hidden sm:block" />
            <div className={`sm:hidden w-10 h-10 rounded-xl flex items-center justify-center ${sponsorblockDisabled ? 'bg-gray-500/20' : 'bg-green-500/20'}`}>
              <svg className={`w-5 h-5 ${sponsorblockDisabled ? 'text-gray-500' : 'text-green-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
              </svg>
            </div>
            <div className="text-left">
              <p className={`text-sm font-medium ${sponsorblockDisabled ? 'text-text-muted' : 'text-text-primary'}`}>SponsorBlock Chapters</p>
              <p className="text-text-muted text-xs">
                {sponsorblockDisabled ? 'SponsorBlock disabled in Settings' : 'Embed chapter markers in files'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sponsorblockDisabled ? (
              <span className="text-xs px-2 py-0.5 bg-gray-500/20 text-gray-400 rounded-lg">Off</span>
            ) : (
              <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-lg">{sponsorblockCount}</span>
            )}
            <span className="text-text-muted">→</span>
          </div>
        </button>
      </div>
    </ResponsiveModal>
  );
}

// Metadata Fix Modal - Accordion with issue sections, glass + mobile bottom sheet
export function MetadataFixModal({
  isOpen,
  onClose,
  data,
  onFix,
  isFixing,
  hasApiKey
}) {
  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !data) return null;

  const totalIssues = (data.count || 0) +
    (data.broken_thumbnails || 0) +
    (data.missing_channel_thumbnails || 0) +
    (data.missing_video_thumbnails || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Desktop - Glass Modal */}
      <div
        className="hidden sm:flex relative backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/>
                </svg>
              </div>
              <div>
                <h3 className="text-base font-medium text-text-primary">Repair Metadata</h3>
                <p className="text-xs text-text-muted">{totalIssues} issue{totalIssues !== 1 ? 's' : ''} found</p>
              </div>
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors">
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {totalIssues === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-text-primary">All Clear</p>
              <p className="text-xs text-text-muted">No metadata issues found</p>
            </div>
          ) : (
            <>
              <IssueSection title="Missing Upload Dates" count={data.count || 0} items={data.videos} />
              <IssueSection title="Broken Thumbnail URLs" count={data.broken_thumbnails || 0} items={[]} />
              <IssueSection title="Missing Channel Thumbnails" count={data.missing_channel_thumbnails || 0} items={data.missing_channel_thumbs_list} isChannel />
              <IssueSection title="Missing Video Thumbnails" count={data.missing_video_thumbnails || 0} items={data.missing_video_thumbs_list} />
            </>
          )}
        </div>

        <div className="p-5 border-t border-white/10 flex items-center justify-between">
          <p className="text-xs text-text-muted">
            {hasApiKey ? <><span className="text-accent">Tip:</span> Will use YT API</> : <><span className="text-yellow-500">Note:</span> Add API key for speed</>}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm transition-colors">
              Cancel
            </button>
            {totalIssues > 0 && (
              <button
                onClick={onFix}
                disabled={isFixing}
                className="py-2.5 px-4 rounded-xl bg-accent/90 hover:bg-accent text-dark-deepest text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isFixing ? 'Fixing...' : `Fix ${totalIssues} Issue${totalIssues !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile - Bottom Sheet */}
      <div
        className="sm:hidden fixed inset-x-0 bottom-0 backdrop-blur-xl bg-dark-secondary rounded-t-3xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h3 className="font-semibold text-text-primary">Repair Metadata</h3>
            <p className="text-xs text-text-muted">{totalIssues} issue{totalIssues !== 1 ? 's' : ''} found</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <CloseIcon className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {totalIssues === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p className="font-medium text-text-primary">All Clear</p>
              <p className="text-xs text-text-muted">No metadata issues found</p>
            </div>
          ) : (
            <>
              <IssueSection title="Missing Upload Dates" count={data.count || 0} items={data.videos} />
              <IssueSection title="Broken Thumbnail URLs" count={data.broken_thumbnails || 0} items={[]} />
              <IssueSection title="Missing Channel Thumbnails" count={data.missing_channel_thumbnails || 0} items={data.missing_channel_thumbs_list} isChannel />
              <IssueSection title="Missing Video Thumbnails" count={data.missing_video_thumbnails || 0} items={data.missing_video_thumbs_list} />
            </>
          )}
        </div>

        <div className="p-4 border-t border-white/10">
          <p className="text-xs text-text-muted text-center mb-3">
            {hasApiKey ? 'Will use YT API for fast fetching' : 'Add API key for faster processing'}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3.5 bg-white/5 rounded-xl text-text-secondary font-medium">
              Cancel
            </button>
            {totalIssues > 0 && (
              <button
                onClick={onFix}
                disabled={isFixing}
                className="flex-1 py-3.5 bg-accent rounded-xl text-dark-deepest font-semibold disabled:opacity-50"
              >
                {isFixing ? 'Fixing...' : `Fix ${totalIssues}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Issue Section component for MetadataFixModal
function IssueSection({ title, count, items, isChannel }) {
  const [expanded, setExpanded] = useState(false);

  if (count === 0) return null;

  return (
    <div className="rounded-xl bg-white/5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-sm font-medium text-text-primary">{title}</span>
          <span className="px-2 py-0.5 rounded-lg text-xs bg-white/10 text-text-muted">
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
            <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-dark-secondary/50">
              <div className={`w-8 h-8 ${isChannel ? 'rounded-full' : 'rounded'} flex-shrink-0 bg-white/10`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-text-primary truncate">{item.title}</div>
                {item.channel_title && <div className="text-xs text-text-muted">{item.channel_title}</div>}
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

// SponsorBlock Chapters Fix Modal
export function SponsorblockChaptersModal({
  isOpen,
  onClose,
  data,
  onFix,
  isFixing
}) {
  const [expandedSegments, setExpandedSegments] = useState(false);
  const [expandedChapters, setExpandedChapters] = useState(false);

  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !data) return null;

  // Check if SponsorBlock is disabled
  const isDisabled = data.message && data.message.includes('not enabled');

  const count = data.count || 0;
  const missingSegments = data.missing_segments || 0;
  const missingChapters = data.missing_chapters || 0;
  const videos = data.videos || [];
  const segmentVideos = videos.filter(v => v.needs === 'segments');
  const chapterVideos = videos.filter(v => v.needs === 'chapters');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Desktop - Glass Modal */}
      <div
        className="hidden sm:flex relative backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"/>
                </svg>
              </div>
              <div>
                <h3 className="text-base font-medium text-text-primary">SponsorBlock Chapters</h3>
                <p className="text-xs text-text-muted">{count} video{count !== 1 ? 's' : ''} missing chapters</p>
              </div>
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors">
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isDisabled ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-yellow-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-text-primary">SponsorBlock Disabled</p>
              <p className="text-xs text-text-muted text-center mt-1">Enable SponsorBlock categories in Settings to use this feature</p>
            </div>
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-text-primary">All Clear</p>
              <p className="text-xs text-text-muted">All videos have chapter markers</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Fetches segment data from SponsorBlock API and embeds chapter markers into video files.
                Chapter markers allow external players (VLC, phone apps) to show sponsor locations.
              </p>

              {missingSegments > 0 && (
                <div className="rounded-xl bg-white/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedSegments(!expandedSegments)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-sm font-medium text-text-primary">Need Segment Fetch</span>
                      <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/20 text-blue-400">{missingSegments}</span>
                    </div>
                    <svg className={`w-4 h-4 text-text-muted transition-transform ${expandedSegments ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>
                  {expandedSegments && segmentVideos.length > 0 && (
                    <div className="px-4 pb-3 space-y-1.5">
                      {segmentVideos.slice(0, 20).map((video) => (
                        <div key={video.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-dark-secondary/50">
                          <div className="w-8 h-8 rounded flex-shrink-0 bg-white/10" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-text-primary truncate">{video.title}</div>
                            {video.channel_title && <div className="text-xs text-text-muted">{video.channel_title}</div>}
                          </div>
                        </div>
                      ))}
                      {missingSegments > 20 && (
                        <p className="text-xs text-text-muted text-center py-2">...and {missingSegments - 20} more</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {missingChapters > 0 && (
                <div className="rounded-xl bg-white/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedChapters(!expandedChapters)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm font-medium text-text-primary">Need Chapter Embed</span>
                      <span className="px-2 py-0.5 rounded-lg text-xs bg-green-500/20 text-green-400">{missingChapters}</span>
                    </div>
                    <svg className={`w-4 h-4 text-text-muted transition-transform ${expandedChapters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>
                  {expandedChapters && chapterVideos.length > 0 && (
                    <div className="px-4 pb-3 space-y-1.5">
                      {chapterVideos.slice(0, 20).map((video) => (
                        <div key={video.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-dark-secondary/50">
                          <div className="w-8 h-8 rounded flex-shrink-0 bg-white/10" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-text-primary truncate">{video.title}</div>
                            {video.channel_title && <div className="text-xs text-text-muted">{video.channel_title}</div>}
                          </div>
                        </div>
                      ))}
                      {missingChapters > 20 && (
                        <p className="text-xs text-text-muted text-center py-2">...and {missingChapters - 20} more</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-white/10 flex items-center justify-between">
          <p className="text-xs text-text-muted">
            {isDisabled ? 'Enable SponsorBlock in Settings' : 'Fast remux, no re-encoding'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm transition-colors">
              {isDisabled || count === 0 ? 'Close' : 'Cancel'}
            </button>
            {count > 0 && !isDisabled && (
              <button
                onClick={onFix}
                disabled={isFixing}
                className="py-2.5 px-4 rounded-xl bg-green-500/90 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isFixing ? 'Processing...' : `Fix ${count} Video${count !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile - Bottom Sheet */}
      <div
        className="sm:hidden fixed inset-x-0 bottom-0 backdrop-blur-xl bg-dark-secondary rounded-t-3xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h3 className="font-semibold text-text-primary">SponsorBlock Chapters</h3>
            <p className="text-xs text-text-muted">{count} video{count !== 1 ? 's' : ''} missing chapters</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <CloseIcon className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isDisabled ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-yellow-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <p className="font-medium text-text-primary">SponsorBlock Disabled</p>
              <p className="text-xs text-text-muted text-center mt-1">Enable SponsorBlock in Settings</p>
            </div>
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p className="font-medium text-text-primary">All Clear</p>
              <p className="text-xs text-text-muted">All videos have chapter markers</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Fetches segments from SponsorBlock and embeds chapter markers.
              </p>

              {missingSegments > 0 && (
                <div className="rounded-xl bg-white/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedSegments(!expandedSegments)}
                    className="w-full px-4 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-sm font-medium text-text-primary">Need Fetch</span>
                      <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/20 text-blue-400">{missingSegments}</span>
                    </div>
                    <svg className={`w-4 h-4 text-text-muted transition-transform ${expandedSegments ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>
                  {expandedSegments && segmentVideos.length > 0 && (
                    <div className="px-4 pb-3 space-y-1.5">
                      {segmentVideos.slice(0, 15).map((video) => (
                        <div key={video.id} className="px-3 py-2 rounded-lg bg-dark-secondary/50">
                          <div className="text-sm text-text-primary truncate">{video.title}</div>
                        </div>
                      ))}
                      {missingSegments > 15 && (
                        <p className="text-xs text-text-muted text-center py-2">...and {missingSegments - 15} more</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {missingChapters > 0 && (
                <div className="rounded-xl bg-white/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedChapters(!expandedChapters)}
                    className="w-full px-4 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm font-medium text-text-primary">Need Embed</span>
                      <span className="px-2 py-0.5 rounded-lg text-xs bg-green-500/20 text-green-400">{missingChapters}</span>
                    </div>
                    <svg className={`w-4 h-4 text-text-muted transition-transform ${expandedChapters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>
                  {expandedChapters && chapterVideos.length > 0 && (
                    <div className="px-4 pb-3 space-y-1.5">
                      {chapterVideos.slice(0, 15).map((video) => (
                        <div key={video.id} className="px-3 py-2 rounded-lg bg-dark-secondary/50">
                          <div className="text-sm text-text-primary truncate">{video.title}</div>
                        </div>
                      ))}
                      {missingChapters > 15 && (
                        <p className="text-xs text-text-muted text-center py-2">...and {missingChapters - 15} more</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10">
          <p className="text-xs text-text-muted text-center mb-3">
            {isDisabled ? 'Enable SponsorBlock in Settings' : 'Fast remux, no re-encoding'}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3.5 bg-white/5 rounded-xl text-text-secondary font-medium">
              {isDisabled || count === 0 ? 'Close' : 'Cancel'}
            </button>
            {count > 0 && !isDisabled && (
              <button
                onClick={onFix}
                disabled={isFixing}
                className="flex-1 py-3.5 bg-green-500 rounded-xl text-white font-semibold disabled:opacity-50"
              >
                {isFixing ? 'Processing...' : `Fix ${count}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
