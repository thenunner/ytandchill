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
  sponsorblockCutData,
  onOpenNotFound,
  onOpenShrinkDB,
  onOpenMetadataFix,
  onOpenSponsorblock,
  onOpenSponsorblockCut,
  onOpenLowQuality
}) {
  if (!repairData) return null;

  const totalMetadataIssues = (missingMetadataData?.count || 0) +
    (missingMetadataData?.broken_thumbnails || 0) +
    (missingMetadataData?.missing_channel_thumbnails || 0) +
    (missingMetadataData?.missing_video_thumbnails || 0);

  const sponsorblockCount = sponsorblockData?.count || 0;
  const sponsorblockDisabled = sponsorblockData?.message && sponsorblockData.message.includes('not enabled');
  const sponsorblockCutCount = sponsorblockCutData?.count || 0;
  const sponsorblockCutDisabled = sponsorblockCutData?.message && sponsorblockCutData.message.includes('not enabled');

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

        <button
          onClick={onOpenSponsorblockCut}
          className={`flex items-center justify-between w-full p-3 sm:p-3 p-4 bg-white/5 rounded-xl sm:rounded-xl rounded-2xl transition-colors ${
            sponsorblockCutDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 sm:hover:bg-white/10 active:bg-white/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="hidden sm:block" />
            <div className={`sm:hidden w-10 h-10 rounded-xl flex items-center justify-center ${sponsorblockCutDisabled ? 'bg-gray-500/20' : 'bg-orange-500/20'}`}>
              <svg className={`w-5 h-5 ${sponsorblockCutDisabled ? 'text-gray-500' : 'text-orange-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.848 8.25l1.536.887M7.848 8.25a3 3 0 11-5.196-3 3 3 0 015.196 3zm1.536.887a2.165 2.165 0 011.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 11-5.196 3 3 3 0 015.196-3zm1.536-.887a2.165 2.165 0 001.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863l2.077-1.199m0-3.328a4.323 4.323 0 012.068-1.379l5.325-1.628a4.5 4.5 0 012.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.331 4.331 0 0010.607 12m3.736 0l7.794 4.5-.803.215a4.5 4.5 0 01-2.48-.043l-5.326-1.629a4.324 4.324 0 01-2.068-1.379M14.343 12l-2.882 1.664" />
              </svg>
            </div>
            <div className="text-left">
              <p className={`text-sm font-medium ${sponsorblockCutDisabled ? 'text-text-muted' : 'text-text-primary'}`}>SponsorBlock Cut</p>
              <p className="text-text-muted text-xs">
                {sponsorblockCutDisabled ? 'SponsorBlock disabled in Settings' : 'Remove sponsor segments from files'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sponsorblockCutDisabled ? (
              <span className="text-xs px-2 py-0.5 bg-gray-500/20 text-gray-400 rounded-lg">Off</span>
            ) : (
              <span className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-lg">{sponsorblockCutCount}</span>
            )}
            <span className="text-text-muted">→</span>
          </div>
        </button>

        <button
          onClick={onOpenLowQuality}
          className="flex items-center justify-between w-full p-3 sm:p-3 p-4 bg-white/5 hover:bg-white/10 sm:hover:bg-white/10 active:bg-white/10 rounded-xl sm:rounded-xl rounded-2xl transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="hidden sm:block" />
            <div className="sm:hidden w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4v16h18V4H3zm3 12l3-3 2 2 4-4 4 4M8 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">Video Issues</p>
              <p className="text-text-muted text-xs">Low quality & mobile compatibility</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-lg">Scan</span>
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
  const neverChecked = data.never_checked || 0;
  const noDataAvailable = data.no_data_available || 0;
  const needsChapters = data.needs_chapters || 0;
  const alreadyDone = data.already_done || 0;
  const videos = data.videos || [];
  const fetchVideos = videos.filter(v => v.needs === 'fetch');
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
          {isFixing ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-text-primary">Processing {count} videos...</p>
              <p className="text-xs text-text-muted text-center mt-2 max-w-xs">
                Fetching segments from SponsorBlock API and embedding chapters. This may take a while for large libraries.
              </p>
            </div>
          ) : isDisabled ? (
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
              </p>

              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="px-3 py-2 rounded-lg bg-white/5">
                  <span className="text-text-muted">Already done:</span>
                  <span className="text-text-primary ml-1">{alreadyDone}</span>
                </div>
                <div className="px-3 py-2 rounded-lg bg-white/5">
                  <span className="text-text-muted">No SB data:</span>
                  <span className="text-text-primary ml-1">{noDataAvailable}</span>
                </div>
              </div>

              {neverChecked > 0 && (
                <div className="rounded-xl bg-white/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedSegments(!expandedSegments)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-sm font-medium text-text-primary">Never Checked</span>
                      <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/20 text-blue-400">{neverChecked}</span>
                    </div>
                    <svg className={`w-4 h-4 text-text-muted transition-transform ${expandedSegments ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>
                  {expandedSegments && fetchVideos.length > 0 && (
                    <div className="px-4 pb-3 space-y-1.5">
                      {fetchVideos.slice(0, 20).map((video) => (
                        <div key={video.id} className="px-3 py-2 rounded-lg bg-dark-secondary/50">
                          <div className="text-sm text-text-primary truncate">{video.title}</div>
                          {video.channel_title && <div className="text-xs text-text-muted">{video.channel_title}</div>}
                        </div>
                      ))}
                      {neverChecked > 20 && (
                        <p className="text-xs text-text-muted text-center py-2">...and {neverChecked - 20} more</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {needsChapters > 0 && (
                <div className="rounded-xl bg-white/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedChapters(!expandedChapters)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm font-medium text-text-primary">Need Chapters</span>
                      <span className="px-2 py-0.5 rounded-lg text-xs bg-green-500/20 text-green-400">{needsChapters}</span>
                    </div>
                    <svg className={`w-4 h-4 text-text-muted transition-transform ${expandedChapters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>
                  {expandedChapters && chapterVideos.length > 0 && (
                    <div className="px-4 pb-3 space-y-1.5">
                      {chapterVideos.slice(0, 20).map((video) => (
                        <div key={video.id} className="px-3 py-2 rounded-lg bg-dark-secondary/50">
                          <div className="text-sm text-text-primary truncate">{video.title}</div>
                          {video.channel_title && <div className="text-xs text-text-muted">{video.channel_title}</div>}
                        </div>
                      ))}
                      {needsChapters > 20 && (
                        <p className="text-xs text-text-muted text-center py-2">...and {needsChapters - 20} more</p>
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
            {isFixing ? 'Please wait...' : isDisabled ? 'Enable SponsorBlock in Settings' : 'Fast remux, no re-encoding'}
          </p>
          <div className="flex gap-2">
            {!isFixing && (
              <button onClick={onClose} className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm transition-colors">
                {isDisabled || count === 0 ? 'Close' : 'Cancel'}
              </button>
            )}
            {count > 0 && !isDisabled && !isFixing && (
              <button
                onClick={onFix}
                className="py-2.5 px-4 rounded-xl bg-green-500/90 hover:bg-green-500 text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                Fix {count} Video{count !== 1 ? 's' : ''}
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
          {isFixing ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              </div>
              <p className="font-medium text-text-primary">Processing {count} videos...</p>
              <p className="text-xs text-text-muted text-center mt-2">This may take a while</p>
            </div>
          ) : isDisabled ? (
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

              {/* Summary stats */}
              <div className="flex gap-2 text-xs">
                <div className="px-2 py-1 rounded bg-white/5">
                  <span className="text-text-muted">Done:</span>
                  <span className="text-text-primary ml-1">{alreadyDone}</span>
                </div>
                <div className="px-2 py-1 rounded bg-white/5">
                  <span className="text-text-muted">No data:</span>
                  <span className="text-text-primary ml-1">{noDataAvailable}</span>
                </div>
              </div>

              {neverChecked > 0 && (
                <div className="rounded-xl bg-white/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedSegments(!expandedSegments)}
                    className="w-full px-4 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-sm font-medium text-text-primary">Never Checked</span>
                      <span className="px-2 py-0.5 rounded-lg text-xs bg-blue-500/20 text-blue-400">{neverChecked}</span>
                    </div>
                    <svg className={`w-4 h-4 text-text-muted transition-transform ${expandedSegments ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>
                  {expandedSegments && fetchVideos.length > 0 && (
                    <div className="px-4 pb-3 space-y-1.5">
                      {fetchVideos.slice(0, 15).map((video) => (
                        <div key={video.id} className="px-3 py-2 rounded-lg bg-dark-secondary/50">
                          <div className="text-sm text-text-primary truncate">{video.title}</div>
                        </div>
                      ))}
                      {neverChecked > 15 && (
                        <p className="text-xs text-text-muted text-center py-2">...and {neverChecked - 15} more</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {needsChapters > 0 && (
                <div className="rounded-xl bg-white/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedChapters(!expandedChapters)}
                    className="w-full px-4 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm font-medium text-text-primary">Need Chapters</span>
                      <span className="px-2 py-0.5 rounded-lg text-xs bg-green-500/20 text-green-400">{needsChapters}</span>
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
                      {needsChapters > 15 && (
                        <p className="text-xs text-text-muted text-center py-2">...and {needsChapters - 15} more</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10">
          {isFixing ? (
            <p className="text-xs text-text-muted text-center py-3">Please wait...</p>
          ) : (
            <>
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
                    className="flex-1 py-3.5 bg-green-500 rounded-xl text-white font-semibold"
                  >
                    Fix {count}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// SponsorBlock Cut Modal - Cut sponsor segments from already-downloaded files
export function SponsorblockCutModal({
  isOpen,
  onClose,
  data,
  selectedVideos,
  setSelectedVideos,
  onCut,
  isCutting
}) {
  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen && !isCutting) onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose, isCutting]);

  if (!isOpen || !data) return null;

  const isDisabled = data.message && data.message.includes('not enabled');
  const count = data.count || 0;
  const alreadyCut = data.already_cut || 0;
  const noData = data.no_data || 0;
  const videos = data.videos || [];

  const allSelected = videos.length > 0 && selectedVideos.length === videos.length;
  const someSelected = selectedVideos.length > 0 && selectedVideos.length < videos.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedVideos([]);
    } else {
      setSelectedVideos(videos.map(v => v.id));
    }
  };

  const toggleVideo = (videoId) => {
    if (selectedVideos.includes(videoId)) {
      setSelectedVideos(selectedVideos.filter(id => id !== videoId));
    } else {
      setSelectedVideos([...selectedVideos, videoId]);
    }
  };

  const getBadge = (video) => {
    if (video.needs === 'fetch') return { text: 'Fetch', className: 'bg-blue-500/20 text-blue-400' };
    if (video.segment_count) return { text: `${video.segment_count} seg${video.segment_count !== 1 ? 's' : ''} · ${video.cut_seconds}s`, className: 'bg-orange-500/20 text-orange-400' };
    return { text: 'Cut', className: 'bg-orange-500/20 text-orange-400' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Desktop - Glass Modal */}
      <div
        className="hidden sm:block relative w-full max-w-lg backdrop-blur-xl bg-dark-secondary/95 rounded-2xl shadow-2xl border border-white/10 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7.848 8.25l1.536.887M7.848 8.25a3 3 0 11-5.196-3 3 3 0 015.196 3zm1.536.887a2.165 2.165 0 011.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 11-5.196 3 3 3 0 015.196-3zm1.536-.887a2.165 2.165 0 001.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863l2.077-1.199m0-3.328a4.323 4.323 0 012.068-1.379l5.325-1.628a4.5 4.5 0 012.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.331 4.331 0 0010.607 12m3.736 0l7.794 4.5-.803.215a4.5 4.5 0 01-2.48-.043l-5.326-1.629a4.324 4.324 0 01-2.068-1.379M14.343 12l-2.882 1.664" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-medium text-text-primary">SponsorBlock Cut</h3>
              <p className="text-xs text-text-muted">{count} video{count !== 1 ? 's' : ''} with segments to cut</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors">
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {isCutting ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-orange-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-orange-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              </div>
              <p className="font-medium text-text-primary">Cutting {selectedVideos.length} video{selectedVideos.length !== 1 ? 's' : ''}...</p>
              <p className="text-sm text-text-muted mt-1">Removing sponsor segments via stream copy</p>
            </div>
          ) : isDisabled ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-yellow-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-text-primary">SponsorBlock Disabled</p>
              <p className="text-xs text-text-muted text-center mt-1">Enable SponsorBlock categories in Settings to use this feature</p>
            </div>
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p className="font-medium text-text-primary">All Clear!</p>
              <p className="text-sm text-text-muted">No videos need segment cutting</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Permanently removes sponsor segments from video files. Fast stream copy, no re-encoding.
              </p>

              {/* Summary stats */}
              <div className="flex gap-2 text-xs">
                {alreadyCut > 0 && (
                  <div className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400">
                    <span className="font-medium">{alreadyCut}</span> already cut
                  </div>
                )}
                {noData > 0 && (
                  <div className="px-3 py-1.5 rounded-lg bg-white/5 text-text-muted">
                    <span className="font-medium">{noData}</span> no SB data
                  </div>
                )}
              </div>

              {/* Select All Header */}
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <button
                  onClick={toggleSelectAll}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    allSelected ? 'bg-orange-500 border-orange-500' : someSelected ? 'bg-orange-500/50 border-orange-500' : 'border-white/30 hover:border-white/50'
                  }`}
                >
                  {(allSelected || someSelected) && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                </button>
                <span className="text-sm text-text-secondary">
                  {selectedVideos.length === 0 ? 'Select all' : `${selectedVideos.length} selected`}
                </span>
              </div>

              {/* Video List */}
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {videos.map((video) => {
                  const badge = getBadge(video);
                  return (
                    <div
                      key={video.id}
                      onClick={() => toggleVideo(video.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                        selectedVideos.includes(video.id) ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <button
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          selectedVideos.includes(video.id) ? 'bg-orange-500 border-orange-500' : 'border-white/30'
                        }`}
                      >
                        {selectedVideos.includes(video.id) && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
                          </svg>
                        )}
                      </button>
                      <span className={`text-xs px-2 py-1 rounded-lg font-semibold flex-shrink-0 ${badge.className}`}>
                        {badge.text}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{video.title}</p>
                        {video.channel_title && <p className="text-xs text-text-muted truncate">{video.channel_title}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-white/10 flex items-center justify-between">
          <p className="text-xs text-text-muted">
            {isCutting ? 'Please wait...' : isDisabled ? 'Enable SponsorBlock in Settings' : count > 0 ? 'This permanently modifies video files' : ''}
          </p>
          <div className="flex gap-2">
            {!isCutting && (
              <button onClick={onClose} className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm transition-colors">
                {isDisabled || count === 0 ? 'Close' : 'Cancel'}
              </button>
            )}
            {count > 0 && !isDisabled && !isCutting && (
              <button
                onClick={onCut}
                disabled={selectedVideos.length === 0}
                className={`py-2.5 px-4 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                  selectedVideos.length > 0
                    ? 'bg-orange-500/90 hover:bg-orange-500 text-white'
                    : 'bg-white/5 text-text-muted cursor-not-allowed'
                }`}
              >
                Cut {selectedVideos.length} Video{selectedVideos.length !== 1 ? 's' : ''}
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
            <h3 className="font-semibold text-text-primary">SponsorBlock Cut</h3>
            <p className="text-xs text-text-muted">{count} video{count !== 1 ? 's' : ''} with segments to cut</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <CloseIcon className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isCutting ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-orange-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-orange-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              </div>
              <p className="font-medium text-text-primary">Cutting videos...</p>
              <p className="text-xs text-text-muted mt-1">Removing sponsor segments</p>
            </div>
          ) : isDisabled ? (
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
              <p className="font-medium text-text-primary">All Clear!</p>
              <p className="text-xs text-text-muted">No videos need segment cutting</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Permanently removes sponsor segments from files. No re-encoding.
              </p>

              {/* Summary stats */}
              <div className="flex gap-2 text-xs">
                {alreadyCut > 0 && (
                  <div className="px-2 py-1 rounded bg-green-500/10 text-green-400">
                    <span className="font-medium">{alreadyCut}</span> cut
                  </div>
                )}
                {noData > 0 && (
                  <div className="px-2 py-1 rounded bg-white/5 text-text-muted">
                    <span className="font-medium">{noData}</span> no data
                  </div>
                )}
              </div>

              {/* Select All Header */}
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <button
                  onClick={toggleSelectAll}
                  className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                    allSelected ? 'bg-orange-500 border-orange-500' : someSelected ? 'bg-orange-500/50 border-orange-500' : 'border-white/30'
                  }`}
                >
                  {(allSelected || someSelected) && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                </button>
                <span className="text-sm text-text-secondary">
                  {selectedVideos.length === 0 ? 'Select all' : `${selectedVideos.length} selected`}
                </span>
              </div>

              {/* Video List */}
              <div className="space-y-2">
                {videos.map((video) => {
                  const badge = getBadge(video);
                  return (
                    <div
                      key={video.id}
                      onClick={() => toggleVideo(video.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                        selectedVideos.includes(video.id) ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-white/5'
                      }`}
                    >
                      <button
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          selectedVideos.includes(video.id) ? 'bg-orange-500 border-orange-500' : 'border-white/30'
                        }`}
                      >
                        {selectedVideos.includes(video.id) && (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
                          </svg>
                        )}
                      </button>
                      <span className={`text-xs px-2 py-1 rounded-lg font-semibold flex-shrink-0 ${badge.className}`}>
                        {badge.text}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{video.title}</p>
                        {video.channel_title && <p className="text-xs text-text-muted truncate">{video.channel_title}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10 safe-area-bottom">
          {isCutting ? (
            <p className="text-xs text-text-muted text-center">Please wait...</p>
          ) : (
            <>
              <p className="text-xs text-text-muted text-center mb-3">
                {isDisabled ? 'Enable SponsorBlock in Settings' : count > 0 ? 'This permanently modifies video files' : ''}
              </p>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-3.5 bg-white/5 rounded-xl text-text-secondary font-medium">
                  {isDisabled || count === 0 ? 'Close' : 'Cancel'}
                </button>
                {count > 0 && !isDisabled && (
                  <button
                    onClick={onCut}
                    disabled={selectedVideos.length === 0}
                    className={`flex-1 py-3.5 rounded-xl font-semibold ${
                      selectedVideos.length > 0
                        ? 'bg-orange-500 text-white'
                        : 'bg-white/5 text-text-muted'
                    }`}
                  >
                    Cut {selectedVideos.length}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Video Issues Modal - Find low quality and mobile-incompatible videos
export function LowQualityVideosModal({
  isOpen,
  onClose,
  data,
  selectedVideos,
  setSelectedVideos,
  isScanning,
  isUpgrading,
  onUpgrade
}) {
  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen && !isScanning && !isUpgrading) onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose, isScanning, isUpgrading]);

  if (!isOpen) return null;

  const videos = data?.videos || [];
  const count = data?.count || 0;
  const totalScanned = data?.total_scanned || 0;

  // Separate videos by issue type
  const lowResVideos = videos.filter(v => v.issue === 'low_resolution' || v.resolution);
  const mobileIncompatVideos = videos.filter(v => v.issue === 'mobile_incompatible' || v.codec);
  const lowResCount = data?.low_resolution_count || lowResVideos.length;
  const mobileIncompatCount = data?.mobile_incompatible_count || mobileIncompatVideos.length;

  const allSelected = videos.length > 0 && selectedVideos.length === videos.length;
  const someSelected = selectedVideos.length > 0 && selectedVideos.length < videos.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedVideos([]);
    } else {
      setSelectedVideos(videos.map(v => v.id));
    }
  };

  const toggleVideo = (videoId) => {
    if (selectedVideos.includes(videoId)) {
      setSelectedVideos(selectedVideos.filter(id => id !== videoId));
    } else {
      setSelectedVideos([...selectedVideos, videoId]);
    }
  };

  const getIssueBadge = (video) => {
    // Mobile incompatible codec (VP9, AV1, etc)
    if (video.issue === 'mobile_incompatible' || video.codec) {
      const codec = video.codec?.toUpperCase() || 'VP9';
      return { text: codec, className: 'bg-red-500/20 text-red-400', tooltip: 'Not supported on iOS' };
    }
    // Low resolution
    if (video.resolution === '720p') return { text: '720p', className: 'bg-yellow-500/20 text-yellow-400' };
    if (video.resolution === '480p') return { text: '480p', className: 'bg-orange-500/20 text-orange-400' };
    if (video.resolution) return { text: video.resolution, className: 'bg-red-500/20 text-red-400' };
    return { text: '???', className: 'bg-gray-500/20 text-gray-400' };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Desktop - Glass Modal */}
      <div
        className="hidden sm:block relative w-full max-w-lg backdrop-blur-xl bg-dark-secondary/95 rounded-2xl shadow-2xl border border-white/10 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Video Issues</h2>
            <p className="text-text-muted text-sm">
              {isScanning ? 'Scanning library...' : `${count} video${count !== 1 ? 's' : ''} with issues`}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
            <CloseIcon className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {isScanning ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-purple-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              </div>
              <p className="font-medium text-text-primary">Scanning videos...</p>
              <p className="text-sm text-text-muted mt-1">Checking resolution & codec compatibility</p>
            </div>
          ) : isUpgrading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-purple-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              </div>
              <p className="font-medium text-text-primary">Queueing {selectedVideos.length} videos...</p>
              <p className="text-sm text-text-muted mt-1">Removing old files and adding to queue</p>
            </div>
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p className="font-medium text-text-primary">All Clear!</p>
              <p className="text-sm text-text-muted">All {totalScanned} videos are 1080p+ and mobile-ready</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Issue Type Summary */}
              <div className="flex gap-2 text-xs">
                {lowResCount > 0 && (
                  <div className="px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400">
                    <span className="font-medium">{lowResCount}</span> low res
                  </div>
                )}
                {mobileIncompatCount > 0 && (
                  <div className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400">
                    <span className="font-medium">{mobileIncompatCount}</span> mobile incompatible
                  </div>
                )}
              </div>

              {/* Select All Header */}
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <button
                  onClick={toggleSelectAll}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    allSelected ? 'bg-purple-500 border-purple-500' : someSelected ? 'bg-purple-500/50 border-purple-500' : 'border-white/30 hover:border-white/50'
                  }`}
                >
                  {(allSelected || someSelected) && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                </button>
                <span className="text-sm text-text-secondary">
                  {selectedVideos.length === 0 ? 'Select all' : `${selectedVideos.length} selected`}
                </span>
              </div>

              {/* Video List */}
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {videos.map((video) => {
                  const badge = getIssueBadge(video);
                  return (
                    <div
                      key={video.id}
                      onClick={() => toggleVideo(video.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                        selectedVideos.includes(video.id) ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <button
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          selectedVideos.includes(video.id) ? 'bg-purple-500 border-purple-500' : 'border-white/30'
                        }`}
                      >
                        {selectedVideos.includes(video.id) && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
                          </svg>
                        )}
                      </button>
                      <span
                        className={`text-xs px-2 py-1 rounded-lg font-semibold flex-shrink-0 ${badge.className}`}
                        title={badge.tooltip}
                      >
                        {badge.text}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{video.title}</p>
                        <p className="text-xs text-text-muted truncate">{video.channel_title}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-white/10 flex items-center justify-between">
          <p className="text-xs text-text-muted">
            {isScanning || isUpgrading ? 'Please wait...' : count > 0 ? 'Re-downloads with H.264 codec' : ''}
          </p>
          <div className="flex gap-2">
            {!isScanning && !isUpgrading && (
              <button onClick={onClose} className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm transition-colors">
                {count === 0 ? 'Close' : 'Cancel'}
              </button>
            )}
            {count > 0 && !isScanning && !isUpgrading && (
              <button
                onClick={onUpgrade}
                disabled={selectedVideos.length === 0}
                className={`py-2.5 px-4 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                  selectedVideos.length > 0
                    ? 'bg-purple-500/90 hover:bg-purple-500 text-white'
                    : 'bg-white/5 text-text-muted cursor-not-allowed'
                }`}
              >
                Fix {selectedVideos.length} Video{selectedVideos.length !== 1 ? 's' : ''}
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
            <h3 className="font-semibold text-text-primary">Video Issues</h3>
            <p className="text-xs text-text-muted">
              {isScanning ? 'Scanning...' : `${count} video${count !== 1 ? 's' : ''} with issues`}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <CloseIcon className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isScanning ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-purple-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              </div>
              <p className="font-medium text-text-primary">Scanning videos...</p>
              <p className="text-xs text-text-muted mt-1">Checking resolution & codec</p>
            </div>
          ) : isUpgrading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-purple-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              </div>
              <p className="font-medium text-text-primary">Queueing videos...</p>
            </div>
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p className="font-medium text-text-primary">All Clear!</p>
              <p className="text-xs text-text-muted">All videos are 1080p+ and mobile-ready</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Issue Type Summary */}
              <div className="flex gap-2 text-xs">
                {lowResCount > 0 && (
                  <div className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-400">
                    <span className="font-medium">{lowResCount}</span> low res
                  </div>
                )}
                {mobileIncompatCount > 0 && (
                  <div className="px-2 py-1 rounded bg-red-500/10 text-red-400">
                    <span className="font-medium">{mobileIncompatCount}</span> mobile
                  </div>
                )}
              </div>

              {/* Select All Header */}
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <button
                  onClick={toggleSelectAll}
                  className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                    allSelected ? 'bg-purple-500 border-purple-500' : someSelected ? 'bg-purple-500/50 border-purple-500' : 'border-white/30'
                  }`}
                >
                  {(allSelected || someSelected) && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                </button>
                <span className="text-sm text-text-secondary">
                  {selectedVideos.length === 0 ? 'Select all' : `${selectedVideos.length} selected`}
                </span>
              </div>

              {/* Video List */}
              <div className="space-y-2">
                {videos.map((video) => {
                  const badge = getIssueBadge(video);
                  return (
                    <div
                      key={video.id}
                      onClick={() => toggleVideo(video.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                        selectedVideos.includes(video.id) ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-white/5'
                      }`}
                    >
                      <button
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          selectedVideos.includes(video.id) ? 'bg-purple-500 border-purple-500' : 'border-white/30'
                        }`}
                      >
                        {selectedVideos.includes(video.id) && (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
                          </svg>
                        )}
                      </button>
                      <span className={`text-xs px-2 py-1 rounded-lg font-semibold flex-shrink-0 ${badge.className}`}>
                        {badge.text}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{video.title}</p>
                        <p className="text-xs text-text-muted truncate">{video.channel_title}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10 safe-area-bottom">
          {isScanning || isUpgrading ? (
            <p className="text-xs text-text-muted text-center">Please wait...</p>
          ) : (
            <>
              <p className="text-xs text-text-muted text-center mb-3">
                {count > 0 ? 'Re-downloads with H.264 codec' : ''}
              </p>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-3.5 bg-white/5 rounded-xl text-text-secondary font-medium">
                  {count === 0 ? 'Close' : 'Cancel'}
                </button>
                {count > 0 && (
                  <button
                    onClick={onUpgrade}
                    disabled={selectedVideos.length === 0}
                    className={`flex-1 py-3.5 rounded-xl font-semibold ${
                      selectedVideos.length > 0
                        ? 'bg-purple-500 text-white'
                        : 'bg-white/5 text-text-muted'
                    }`}
                  >
                    Fix {selectedVideos.length}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
