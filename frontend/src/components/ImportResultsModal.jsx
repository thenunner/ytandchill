import { useState } from 'react';
import { createPortal } from 'react-dom';

// Format bytes to human readable
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * ImportResultsModal - Displays import results with two-line compact layout
 *
 * Props:
 * - imported: Array of successfully matched items
 * - skipped: Array of skipped items
 * - failed: Array of failed items (with optional closestMatch)
 * - onClose: Function to close the modal
 */
export default function ImportResultsModal({ imported = [], skipped = [], failed = [], onClose }) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportFormat, setExportFormat] = useState('text'); // 'text' or 'csv'
  const [exportCategories, setExportCategories] = useState({
    matched: true,
    skipped: true,
    failed: true,
  });
  const [copied, setCopied] = useState(false);

  const counts = {
    matched: imported.length,
    skipped: skipped.length,
    failed: failed.length,
  };

  // Build combined list with type tags
  const allItems = [
    ...imported.map(item => ({ ...item, _type: 'matched' })),
    ...skipped.map(item => ({ ...item, _type: 'skipped' })),
    ...failed.map(item => ({ ...item, _type: 'failed' })),
  ];

  // Toggle export category
  const toggleCategory = (cat) => {
    setExportCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Format duration for export
  const formatDuration = (seconds) => {
    if (!seconds) return '--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Generate plain text export
  // Format: Filename - Duration - Status - Video Title - Video ID - Similarity/Reason
  const generateText = () => {
    const lines = [];

    // Add matched items
    if (exportCategories.matched) {
      imported.forEach(item => {
        const duration = formatDuration(item.duration || item.local_duration || item.video?.duration);
        const title = item.video?.title || '';
        const videoId = item.video?.id || '';
        lines.push(`${item.filename} - ${duration} - Matched - ${title} - ${videoId} - Matched`);
      });
    }

    // Add skipped items
    if (exportCategories.skipped) {
      skipped.forEach(item => {
        const duration = formatDuration(item.duration || item.local_duration);
        const reason = item.reason || 'Skipped';
        lines.push(`${item.filename} - ${duration} - Skipped - - - ${reason}`);
      });
    }

    // Add failed/closest items
    if (exportCategories.failed) {
      failed.forEach(item => {
        const closest = item.closestMatch || item.closest_match;
        const localDur = formatDuration(closest?.local_duration || item.local_duration);
        const ytDur = formatDuration(closest?.duration);
        const durationStr = `${localDur || '--:--'} / ${ytDur || '--:--'}`;
        const title = closest?.title || '';
        const videoId = closest?.id || '';
        const similarity = closest?.similarity ? `${closest.similarity}%` : 'No match';
        lines.push(`${item.filename} - ${durationStr} - Closest - ${title} - ${videoId} - ${similarity}`);
      });
    }

    return lines.join('\n');
  };

  // Generate CSV content
  const generateCSV = () => {
    const lines = [];

    // Header - different columns based on type
    lines.push([
      'Status',
      'Filename',
      'Local Duration',
      'YT Duration',
      'File Size',
      'Matched Video Title',
      'Matched Video ID',
      'Matched Channel',
      'Closest Video Title',
      'Closest Video ID',
      'Closest Channel',
      'Similarity %',
      'Reason'
    ].join(','));

    // Add matched items
    if (exportCategories.matched) {
      imported.forEach(item => {
        const duration = formatDuration(item.duration || item.local_duration || item.video?.duration);
        lines.push([
          'Matched',
          `"${(item.filename || '').replace(/"/g, '""')}"`,
          duration,
          duration, // YT duration same as local for matched
          formatBytes(item.file_size || item.video?.file_size || 0),
          `"${(item.video?.title || '').replace(/"/g, '""')}"`,
          item.video?.id || '',
          `"${(item.video?.channel_title || item.channel || '').replace(/"/g, '""')}"`,
          '', // Closest title - N/A for matched
          '', // Closest ID - N/A for matched
          '', // Closest channel - N/A for matched
          '', // Similarity - N/A for matched
          ''  // Reason - N/A for matched
        ].join(','));
      });
    }

    // Add skipped items
    if (exportCategories.skipped) {
      skipped.forEach(item => {
        const duration = formatDuration(item.duration || item.local_duration);
        lines.push([
          'Skipped',
          `"${(item.filename || '').replace(/"/g, '""')}"`,
          duration,
          '', // YT duration - N/A for skipped
          formatBytes(item.file_size || 0),
          '', // Matched title - N/A
          '', // Matched ID - N/A
          '', // Matched channel - N/A
          '', // Closest title - N/A
          '', // Closest ID - N/A
          '', // Closest channel - N/A
          '', // Similarity - N/A
          `"${(item.reason || '').replace(/"/g, '""')}"`
        ].join(','));
      });
    }

    // Add failed items
    if (exportCategories.failed) {
      failed.forEach(item => {
        const closest = item.closestMatch || item.closest_match;
        const localDuration = formatDuration(closest?.local_duration || item.local_duration);
        const ytDuration = formatDuration(closest?.duration);
        lines.push([
          'Closest',
          `"${(item.filename || '').replace(/"/g, '""')}"`,
          localDuration || '',
          ytDuration || '',
          formatBytes(item.file_size || 0),
          '', // Matched title - N/A for failed
          '', // Matched ID - N/A for failed
          '', // Matched channel - N/A for failed
          `"${(closest?.title || '').replace(/"/g, '""')}"`,
          closest?.id || '',
          `"${(closest?.channel_title || '').replace(/"/g, '""')}"`,
          closest?.similarity ? `${closest.similarity}%` : '',
          `"${(item.reason || item.error || '').replace(/"/g, '""')}"`
        ].join(','));
      });
    }

    return lines.join('\n');
  };

  // Copy to clipboard
  const handleExport = async () => {
    const content = exportFormat === 'csv' ? generateCSV() : generateText();
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setShowExportMenu(false);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Count selected for export
  const selectedCount = Object.entries(exportCategories)
    .filter(([key, val]) => val && counts[key] > 0)
    .reduce((sum, [key]) => sum + counts[key], 0);

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="import-results-modal bg-[#12141a] border border-[#2a2f3a] rounded-xl w-full max-w-[760px] max-h-[85vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2a2f3a]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[15px] font-semibold text-white">Import Results</h2>
            <button
              onClick={onClose}
              className="text-[#64748b] hover:text-white p-1 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-[12px] text-[#64748b] leading-relaxed">
            Your files have been matched against your YT library.
            Successfully matched files are now linked to their videos.
          </p>

          {/* Stats bar */}
          <div className="flex gap-4 mt-3 pt-3 border-t border-[#2a2f3a] flex-wrap">
            {counts.matched > 0 && (
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-[#4ade80]">
                <span className="w-2 h-2 rounded-full bg-[#4ade80]"></span>
                {counts.matched} matched
              </span>
            )}
            {counts.skipped > 0 && (
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-[#fbbf24]">
                <span className="w-2 h-2 rounded-full bg-[#fbbf24]"></span>
                {counts.skipped} skipped
              </span>
            )}
            {counts.failed > 0 && (
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-[#f87171]">
                <span className="w-2 h-2 rounded-full bg-[#f87171]"></span>
                {counts.failed} failed
              </span>
            )}
          </div>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto p-2 import-results-list">
          {allItems.length === 0 ? (
            <div className="text-center text-[#64748b] py-12">No results</div>
          ) : (
            allItems.map((item, idx) => (
              <ResultItem key={idx} item={item} />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#2a2f3a]">
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium text-[#64748b] bg-[#1a1d24] border border-[#2a2f3a] rounded-md hover:text-white hover:border-[#3a4555] transition-colors"
            >
              Export
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Export dropdown menu */}
            {showExportMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#1a1d24] border border-[#2a2f3a] rounded-lg shadow-xl z-10">
                {/* Format toggle */}
                <div className="p-3 border-b border-[#2a2f3a]">
                  <div className="text-[11px] text-[#64748b] uppercase tracking-wide mb-2">Format</div>
                  <div className="flex gap-1 bg-[#12141a] p-1 rounded-md">
                    <button
                      onClick={() => setExportFormat('text')}
                      className={`flex-1 px-3 py-1.5 text-[11px] font-medium rounded transition-colors ${
                        exportFormat === 'text'
                          ? 'bg-[#3b82f6] text-white'
                          : 'text-[#64748b] hover:text-white'
                      }`}
                    >
                      Text
                    </button>
                    <button
                      onClick={() => setExportFormat('csv')}
                      className={`flex-1 px-3 py-1.5 text-[11px] font-medium rounded transition-colors ${
                        exportFormat === 'csv'
                          ? 'bg-[#3b82f6] text-white'
                          : 'text-[#64748b] hover:text-white'
                      }`}
                    >
                      CSV
                    </button>
                  </div>
                </div>

                {/* Category selection */}
                <div className="p-3 border-b border-[#2a2f3a]">
                  <div className="text-[11px] text-[#64748b] uppercase tracking-wide mb-2">Include</div>

                  <label className="flex items-center gap-2 py-1.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={exportCategories.matched}
                      onChange={() => toggleCategory('matched')}
                      disabled={counts.matched === 0}
                      className="w-4 h-4 rounded border-[#2a2f3a] bg-[#12141a] text-[#4ade80] focus:ring-[#4ade80] focus:ring-offset-0 disabled:opacity-40"
                    />
                    <span className={`text-[12px] ${counts.matched === 0 ? 'text-[#475569]' : 'text-[#4ade80] group-hover:text-[#4ade80]'}`}>
                      Matched ({counts.matched})
                    </span>
                  </label>

                  <label className="flex items-center gap-2 py-1.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={exportCategories.skipped}
                      onChange={() => toggleCategory('skipped')}
                      disabled={counts.skipped === 0}
                      className="w-4 h-4 rounded border-[#2a2f3a] bg-[#12141a] text-[#fbbf24] focus:ring-[#fbbf24] focus:ring-offset-0 disabled:opacity-40"
                    />
                    <span className={`text-[12px] ${counts.skipped === 0 ? 'text-[#475569]' : 'text-[#fbbf24] group-hover:text-[#fbbf24]'}`}>
                      Skipped ({counts.skipped})
                    </span>
                  </label>

                  <label className="flex items-center gap-2 py-1.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={exportCategories.failed}
                      onChange={() => toggleCategory('failed')}
                      disabled={counts.failed === 0}
                      className="w-4 h-4 rounded border-[#2a2f3a] bg-[#12141a] text-[#f87171] focus:ring-[#f87171] focus:ring-offset-0 disabled:opacity-40"
                    />
                    <span className={`text-[12px] ${counts.failed === 0 ? 'text-[#475569]' : 'text-[#f87171] group-hover:text-[#f87171]'}`}>
                      Failed ({counts.failed})
                    </span>
                  </label>
                </div>

                <div className="p-2">
                  <button
                    onClick={handleExport}
                    disabled={selectedCount === 0}
                    className="w-full px-3 py-2 text-[12px] font-medium text-white bg-[#3b82f6] rounded-md hover:bg-[#2563eb] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Copy {selectedCount} items as {exportFormat.toUpperCase()}
                  </button>
                </div>
              </div>
            )}

            {copied && (
              <span className="ml-3 text-[12px] text-[#4ade80] animate-pulse">
                Copied to clipboard!
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 text-[12px] font-medium text-white bg-[#3b82f6] rounded-md hover:bg-[#2563eb] transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* Styles for scrollbar and line-clamp */}
      <style>{`
        .import-results-list::-webkit-scrollbar {
          width: 8px;
        }
        .import-results-list::-webkit-scrollbar-track {
          background: #1a1d24;
          border-radius: 4px;
        }
        .import-results-list::-webkit-scrollbar-thumb {
          background: #2a2f3a;
          border-radius: 4px;
        }
        .import-results-list::-webkit-scrollbar-thumb:hover {
          background: #3a4555;
        }
        .import-results-list {
          scrollbar-width: thin;
          scrollbar-color: #2a2f3a #1a1d24;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        @media (max-width: 768px) {
          .line-clamp-2 {
            -webkit-line-clamp: 3;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}

/**
 * ResultItem - Individual result row with two-line layout
 */
function ResultItem({ item }) {
  const type = item._type;

  // Determine styling based on type
  const styles = {
    matched: {
      borderColor: '#4ade80',
      iconColor: 'text-[#4ade80]',
      icon: '✓',
      label: 'Matched:',
      labelColor: 'text-[#4ade80]',
    },
    skipped: {
      borderColor: '#fbbf24',
      iconColor: 'text-[#fbbf24]',
      icon: '⏭',
      label: 'Skipped:',
      labelColor: 'text-[#fbbf24]',
    },
    failed: {
      borderColor: '#f87171',
      iconColor: 'text-[#f87171]',
      icon: '✗',
      label: 'Closest:',
      labelColor: 'text-[#f87171]',
    },
  };

  const s = styles[type] || styles.matched;

  // Format duration seconds to MM:SS or HH:MM:SS
  const formatDuration = (seconds) => {
    if (!seconds) return null;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Get display info based on type
  const getDisplayInfo = () => {
    if (type === 'matched') {
      return {
        title: item.video?.title || '',
        channel: item.video?.channel_title || item.channel || '',
        videoId: item.video?.id || '',
        similarity: null,
        localDuration: null,
        ytDuration: null,
      };
    } else if (type === 'skipped') {
      return {
        title: item.reason || 'Skipped by user',
        channel: '',
        videoId: '',
        similarity: null,
        localDuration: null,
        ytDuration: null,
      };
    } else {
      // Failed - show closest match if available
      const closest = item.closestMatch || item.closest_match;
      return {
        title: closest?.title || item.reason || 'No match found',
        channel: closest?.channel_title || '',
        videoId: closest?.id || '',
        similarity: closest?.similarity,
        localDuration: formatDuration(closest?.local_duration),
        ytDuration: formatDuration(closest?.duration),
      };
    }
  };

  const info = getDisplayInfo();

  return (
    <div
      className="m-1 p-2.5 sm:p-3 rounded-md bg-[#1a1d24] hover:bg-[#22262f] transition-colors"
      style={{ borderLeft: `3px solid ${s.borderColor}` }}
    >
      {/* Line 1: Status icon + filename */}
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[12px] flex-shrink-0 ${s.iconColor}`}>{s.icon}</span>
        <span className="font-mono text-[11px] text-white truncate min-w-0 flex-1">
          {item.filename}
        </span>
      </div>

      {/* Line 2: Reason label + title + channel + badges */}
      <div className="flex items-start gap-2 pl-5">
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
          <span className={`text-[10px] font-medium uppercase tracking-wide flex-shrink-0 ${s.labelColor}`}>
            {s.label}
          </span>
          <span className="text-[12px] text-[#64748b] leading-relaxed line-clamp-2">
            {info.title}
          </span>
          {info.channel && (
            <span className="text-[11px] text-[#475569] w-full mt-0.5">
              · {info.channel}
            </span>
          )}
        </div>

        {/* Badges - video ID, similarity, and duration */}
        {(info.videoId || info.similarity || info.localDuration) && (
          <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
            {info.videoId && (
              <span className="font-mono text-[9px] text-[#64748b] bg-white/5 px-1.5 py-0.5 rounded">
                {info.videoId}
              </span>
            )}
            {info.similarity && (
              <span className="text-[9px] font-semibold text-[#f87171] bg-[#f87171]/10 px-1.5 py-0.5 rounded">
                {info.similarity}%
              </span>
            )}
            {(info.localDuration || info.ytDuration) && (
              <span className="text-[9px] text-[#64748b] bg-white/5 px-1.5 py-0.5 rounded">
                {info.localDuration || '--:--'} / {info.ytDuration || '--:--'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
