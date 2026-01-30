import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ResponsiveModal, ConfirmModal } from './SharedModals';
import { CloseIcon, CheckIcon, EditIcon, DeleteIcon } from '../Icons';

/**
 * DurationSettingsModal - Set min/max duration filters for a channel
 */
export function DurationSettingsModal({ channel, onSave, onClose }) {
  const [minMinutes, setMinMinutes] = useState(channel?.min_minutes || 0);
  const [maxMinutes, setMaxMinutes] = useState(channel?.max_minutes || 0);

  useEffect(() => {
    if (channel) {
      setMinMinutes(channel.min_minutes || 0);
      setMaxMinutes(channel.max_minutes || 0);
    }
  }, [channel]);

  if (!channel) return null;

  const handleSave = () => {
    onSave({
      ...channel,
      min_minutes: minMinutes,
      max_minutes: maxMinutes
    });
  };

  return (
    <ResponsiveModal isOpen={!!channel} onClose={onClose} title="Duration Settings">
      <p className="text-text-muted text-sm mb-4">
        Filter videos by duration for "{channel.title}"
      </p>

      <div className="flex gap-3 mb-4">
        <div className="flex-1">
          <label className="block text-xs text-text-muted mb-2">Min (minutes)</label>
          <input
            type="number"
            value={minMinutes}
            onChange={(e) => setMinMinutes(Number(e.target.value))}
            className="w-full bg-white/5 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 sm:py-3 sm:text-sm"
            min="0"
            placeholder="0"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-text-muted mb-2">Max (minutes)</label>
          <input
            type="number"
            value={maxMinutes}
            onChange={(e) => setMaxMinutes(Number(e.target.value))}
            className="w-full bg-white/5 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 sm:py-3 sm:text-sm"
            min="0"
            placeholder="0 (no limit)"
          />
        </div>
      </div>

      <div className="flex gap-2 sm:gap-2 gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 sm:py-2.5 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm font-medium sm:font-normal transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-2.5 sm:py-2.5 py-3.5 rounded-xl bg-accent/90 hover:bg-accent text-dark-deepest text-sm font-medium sm:font-medium font-semibold transition-colors"
        >
          Save
        </button>
      </div>
    </ResponsiveModal>
  );
}

/**
 * CategoryManagementModal - Create, edit, delete channel categories
 */
export function CategoryManagementModal({
  isOpen,
  onClose,
  categories,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  isCreating,
  isUpdating
}) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState(null);

  const handleClose = () => {
    setNewCategoryName('');
    setEditingCategory(null);
    onClose();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    await onCreateCategory(newCategoryName.trim());
    setNewCategoryName('');
  };

  const handleUpdate = async (e, categoryId) => {
    e.preventDefault();
    if (!editingCategory?.name.trim()) return;
    await onUpdateCategory(categoryId, editingCategory.name.trim());
    setEditingCategory(null);
  };

  return (
    <>
      <ResponsiveModal isOpen={isOpen} onClose={handleClose} title="Manage Categories">
        {/* Add new category */}
        <form onSubmit={handleCreate} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category..."
            className="flex-1 bg-white/5 rounded-xl px-3 py-2.5 sm:px-3 sm:py-2.5 px-4 py-3 text-sm sm:text-sm text-base text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 sm:border-0 border-2 border-transparent focus:border-accent"
          />
          <button
            type="submit"
            disabled={!newCategoryName.trim() || isCreating}
            className="px-4 py-2.5 sm:px-4 sm:py-2.5 px-5 py-3 rounded-xl bg-accent/90 hover:bg-accent sm:bg-accent/90 bg-accent text-dark-deepest text-sm font-medium sm:font-medium font-semibold transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </form>

        {/* Category list */}
        <div className="space-y-2 max-h-60 sm:max-h-60 max-h-64 overflow-y-auto">
          {categories?.length === 0 && (
            <p className="text-text-muted text-sm text-center py-6 sm:py-6 py-8">No categories yet</p>
          )}
          {categories?.map(category => (
            <div key={category.id} className="flex items-center justify-between p-3 sm:p-3 p-4 bg-white/5 rounded-xl sm:rounded-xl rounded-2xl">
              {editingCategory?.id === category.id ? (
                <form
                  onSubmit={(e) => handleUpdate(e, category.id)}
                  className="flex gap-2 flex-1"
                >
                  <input
                    type="text"
                    value={editingCategory.name}
                    onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                    className="flex-1 bg-white/10 rounded-lg sm:rounded-lg rounded-xl px-2 py-1.5 sm:px-2 sm:py-1.5 px-3 py-2 text-sm sm:text-sm text-base text-text-primary focus:outline-none"
                    autoFocus
                  />
                  <button type="submit" className="text-green-400 hover:text-green-300 p-1 sm:p-1 w-10 h-10 sm:w-auto sm:h-auto rounded-xl sm:rounded-none bg-green-500/20 sm:bg-transparent flex items-center justify-center">
                    <CheckIcon className="w-4 h-4 sm:w-4 sm:h-4 w-5 h-5" />
                  </button>
                  <button type="button" onClick={() => setEditingCategory(null)} className="text-text-muted hover:text-text-primary p-1 sm:p-1 w-10 h-10 sm:w-auto sm:h-auto rounded-xl sm:rounded-none bg-white/10 sm:bg-transparent flex items-center justify-center">
                    <CloseIcon className="w-4 h-4 sm:w-4 sm:h-4 w-5 h-5" />
                  </button>
                </form>
              ) : (
                <>
                  <div className="flex items-center gap-2 sm:gap-2 gap-3">
                    <span className="text-text-primary text-sm sm:text-sm text-base">{category.name}</span>
                    <span className="text-xs px-1.5 py-0.5 sm:px-1.5 sm:py-0.5 px-2 bg-white/10 rounded sm:rounded rounded-lg text-text-muted">{category.channel_count}</span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-1 gap-2">
                    <button
                      onClick={() => setEditingCategory({ id: category.id, name: category.name })}
                      className="p-1.5 sm:p-1.5 w-9 h-9 sm:w-auto sm:h-auto rounded-lg sm:rounded-lg rounded-xl hover:bg-white/10 sm:hover:bg-white/10 bg-white/10 sm:bg-transparent text-text-muted hover:text-text-primary transition-colors flex items-center justify-center"
                    >
                      <EditIcon />
                    </button>
                    <button
                      onClick={() => setDeleteCategoryConfirm(category)}
                      className="p-1.5 sm:p-1.5 w-9 h-9 sm:w-auto sm:h-auto rounded-lg sm:rounded-lg rounded-xl hover:bg-red-500/20 sm:hover:bg-red-500/20 bg-red-500/10 sm:bg-transparent text-text-muted hover:text-red-400 sm:hover:text-red-400 text-red-400 transition-colors flex items-center justify-center"
                    >
                      <DeleteIcon />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </ResponsiveModal>

      {/* Delete Category Confirmation */}
      <DeleteCategoryModal
        isOpen={!!deleteCategoryConfirm}
        onClose={() => setDeleteCategoryConfirm(null)}
        category={deleteCategoryConfirm}
        onConfirm={async () => {
          await onDeleteCategory(deleteCategoryConfirm.id);
          setDeleteCategoryConfirm(null);
        }}
      />
    </>
  );
}

/**
 * DeleteCategoryModal - Confirm category deletion
 */
export function DeleteCategoryModal({
  isOpen,
  onClose,
  category,
  onConfirm,
  isDeleting
}) {
  if (!category) return null;

  const message = (
    <>
      Delete "{category.name}"?
      {category.channel_count > 0 && (
        <span className="block mt-2 text-amber-400 text-xs sm:text-xs text-sm">
          {category.channel_count} channel{category.channel_count !== 1 ? 's' : ''} will become uncategorized.
        </span>
      )}
    </>
  );

  return (
    <ConfirmModal
      isOpen={isOpen}
      title="Delete Category?"
      message={message}
      confirmText={isDeleting ? 'Deleting...' : 'Delete'}
      cancelText="Cancel"
      confirmStyle="danger"
      onConfirm={onConfirm}
      onCancel={onClose}
      isLoading={isDeleting}
    />
  );
}

/**
 * SingleCategoryModal - Assign a single channel to a category
 */
export function SingleCategoryModal({
  isOpen,
  onClose,
  channel,
  categories,
  onSelectCategory,
  onManageCategories
}) {
  if (!channel) return null;

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title="Set Category">
      {/* Category options */}
      <div className="space-y-1 max-h-60 sm:max-h-60 max-h-72 overflow-y-auto -mx-5 px-5 sm:mx-0 sm:px-0">
        {/* Uncategorized option */}
        <button
          onClick={() => onSelectCategory(null)}
          className={`flex items-center gap-3 w-full px-3 py-2.5 sm:px-3 sm:py-2.5 px-4 py-3.5 rounded-xl hover:bg-white/5 sm:hover:bg-white/5 active:bg-white/10 transition-colors text-left ${
            !channel.category_id ? 'bg-white/5' : ''
          }`}
        >
          <div className={`w-5 h-5 sm:w-5 sm:h-5 w-6 h-6 rounded flex items-center justify-center ${
            !channel.category_id ? 'bg-accent' : 'border border-white/20 sm:border sm:border-white/20 border-2'
          }`}>
            {!channel.category_id && (
              <CheckIcon className="w-3 h-3 sm:w-3 sm:h-3 w-4 h-4 text-dark-deepest" />
            )}
          </div>
          <span className="text-sm sm:text-sm text-base text-text-muted italic">Uncategorized</span>
        </button>

        {/* Category list */}
        {categories?.map(category => (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            className={`flex items-center justify-between w-full px-3 py-2.5 sm:px-3 sm:py-2.5 px-4 py-3.5 rounded-xl hover:bg-white/5 sm:hover:bg-white/5 active:bg-white/10 transition-colors text-left ${
              channel.category_id === category.id ? 'bg-white/5' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 sm:w-5 sm:h-5 w-6 h-6 rounded flex items-center justify-center ${
                channel.category_id === category.id ? 'bg-accent' : 'border border-white/20 sm:border sm:border-white/20 border-2'
              }`}>
                {channel.category_id === category.id && (
                  <CheckIcon className="w-3 h-3 sm:w-3 sm:h-3 w-4 h-4 text-dark-deepest" />
                )}
              </div>
              <span className="text-sm sm:text-sm text-base text-text-primary">{category.name}</span>
            </div>
            <span className="text-xs px-1.5 py-0.5 sm:px-1.5 sm:py-0.5 px-2 py-1 bg-white/10 rounded sm:rounded rounded-lg text-text-muted">{category.channel_count}</span>
          </button>
        ))}

        {(!categories || categories.length === 0) && (
          <p className="text-text-muted text-sm text-center py-4">No categories yet</p>
        )}
      </div>

      {/* Manage Categories */}
      <div className="border-t border-white/10 mt-4 pt-3 sm:pt-3 -mx-5 px-5 sm:mx-0 sm:px-0 sm:border-t pb-0 sm:pb-0 pb-1">
        <button
          onClick={onManageCategories}
          className="w-full text-center text-sm text-accent hover:text-accent/80 sm:hover:text-accent/80 transition-colors sm:py-0 py-3.5 sm:bg-transparent bg-white/5 sm:rounded-none rounded-xl sm:font-normal font-medium"
        >
          Manage Categories...
        </button>
      </div>
    </ResponsiveModal>
  );
}

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
 */
export function ImportResultsModal({ imported = [], skipped = [], failed = [], onClose }) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportFormat, setExportFormat] = useState('text');
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

  const allItems = [
    ...imported.map(item => ({ ...item, _type: 'matched' })),
    ...skipped.map(item => ({ ...item, _type: 'skipped' })),
    ...failed.map(item => ({ ...item, _type: 'failed' })),
  ];

  const toggleCategory = (cat) => {
    setExportCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

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

  const generateText = () => {
    const lines = [];
    if (exportCategories.matched) {
      imported.forEach(item => {
        const duration = formatDuration(item.duration || item.local_duration || item.video?.duration);
        const title = item.video?.title || '';
        const videoId = item.video?.id || '';
        lines.push(`${item.filename} - ${duration} - Matched - ${title} - ${videoId} - Matched`);
      });
    }
    if (exportCategories.skipped) {
      skipped.forEach(item => {
        const duration = formatDuration(item.duration || item.local_duration);
        const reason = item.reason || 'Skipped';
        lines.push(`${item.filename} - ${duration} - Skipped - - - ${reason}`);
      });
    }
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

  const generateCSV = () => {
    const lines = [];
    lines.push([
      'Status', 'Filename', 'Local Duration', 'YT Duration', 'File Size',
      'Matched Video Title', 'Matched Video ID', 'Matched Channel',
      'Closest Video Title', 'Closest Video ID', 'Closest Channel',
      'Similarity %', 'Reason'
    ].join(','));

    if (exportCategories.matched) {
      imported.forEach(item => {
        const duration = formatDuration(item.duration || item.local_duration || item.video?.duration);
        lines.push([
          'Matched',
          `"${(item.filename || '').replace(/"/g, '""')}"`,
          duration, duration,
          formatBytes(item.file_size || item.video?.file_size || 0),
          `"${(item.video?.title || '').replace(/"/g, '""')}"`,
          item.video?.id || '',
          `"${(item.video?.channel_title || item.channel || '').replace(/"/g, '""')}"`,
          '', '', '', '', ''
        ].join(','));
      });
    }
    if (exportCategories.skipped) {
      skipped.forEach(item => {
        const duration = formatDuration(item.duration || item.local_duration);
        lines.push([
          'Skipped',
          `"${(item.filename || '').replace(/"/g, '""')}"`,
          duration, '',
          formatBytes(item.file_size || 0),
          '', '', '', '', '', '', '',
          `"${(item.reason || '').replace(/"/g, '""')}"`
        ].join(','));
      });
    }
    if (exportCategories.failed) {
      failed.forEach(item => {
        const closest = item.closestMatch || item.closest_match;
        const localDuration = formatDuration(closest?.local_duration || item.local_duration);
        const ytDuration = formatDuration(closest?.duration);
        lines.push([
          'Closest',
          `"${(item.filename || '').replace(/"/g, '""')}"`,
          localDuration || '', ytDuration || '',
          formatBytes(item.file_size || 0),
          '', '', '',
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
            <button onClick={onClose} className="text-[#64748b] hover:text-white p-1 transition-colors">
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[12px] text-[#64748b] leading-relaxed">
            Your files have been matched against your YT library. Successfully matched files are now linked to their videos.
          </p>
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
            allItems.map((item, idx) => <ImportResultItem key={idx} item={item} />)
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

            {showExportMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#1a1d24] border border-[#2a2f3a] rounded-lg shadow-xl z-10">
                <div className="p-3 border-b border-[#2a2f3a]">
                  <div className="text-[11px] text-[#64748b] uppercase tracking-wide mb-2">Format</div>
                  <div className="flex gap-1 bg-[#12141a] p-1 rounded-md">
                    <button
                      onClick={() => setExportFormat('text')}
                      className={`flex-1 px-3 py-1.5 text-[11px] font-medium rounded transition-colors ${exportFormat === 'text' ? 'bg-[#3b82f6] text-white' : 'text-[#64748b] hover:text-white'}`}
                    >
                      Text
                    </button>
                    <button
                      onClick={() => setExportFormat('csv')}
                      className={`flex-1 px-3 py-1.5 text-[11px] font-medium rounded transition-colors ${exportFormat === 'csv' ? 'bg-[#3b82f6] text-white' : 'text-[#64748b] hover:text-white'}`}
                    >
                      CSV
                    </button>
                  </div>
                </div>
                <div className="p-3 border-b border-[#2a2f3a]">
                  <div className="text-[11px] text-[#64748b] uppercase tracking-wide mb-2">Include</div>
                  {['matched', 'skipped', 'failed'].map(cat => (
                    <label key={cat} className="flex items-center gap-2 py-1.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={exportCategories[cat]}
                        onChange={() => toggleCategory(cat)}
                        disabled={counts[cat] === 0}
                        className={`w-4 h-4 rounded border-[#2a2f3a] bg-[#12141a] focus:ring-offset-0 disabled:opacity-40 ${cat === 'matched' ? 'text-[#4ade80] focus:ring-[#4ade80]' : cat === 'skipped' ? 'text-[#fbbf24] focus:ring-[#fbbf24]' : 'text-[#f87171] focus:ring-[#f87171]'}`}
                      />
                      <span className={`text-[12px] capitalize ${counts[cat] === 0 ? 'text-[#475569]' : cat === 'matched' ? 'text-[#4ade80]' : cat === 'skipped' ? 'text-[#fbbf24]' : 'text-[#f87171]'}`}>
                        {cat} ({counts[cat]})
                      </span>
                    </label>
                  ))}
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

            {copied && <span className="ml-3 text-[12px] text-[#4ade80] animate-pulse">Copied to clipboard!</span>}
          </div>

          <button onClick={onClose} className="px-5 py-2 text-[12px] font-medium text-white bg-[#3b82f6] rounded-md hover:bg-[#2563eb] transition-colors">
            Done
          </button>
        </div>
      </div>

      <style>{`
        .import-results-list::-webkit-scrollbar { width: 8px; }
        .import-results-list::-webkit-scrollbar-track { background: #1a1d24; border-radius: 4px; }
        .import-results-list::-webkit-scrollbar-thumb { background: #2a2f3a; border-radius: 4px; }
        .import-results-list::-webkit-scrollbar-thumb:hover { background: #3a4555; }
        .import-results-list { scrollbar-width: thin; scrollbar-color: #2a2f3a #1a1d24; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        @media (max-width: 768px) { .line-clamp-2 { -webkit-line-clamp: 3; } }
      `}</style>
    </div>,
    document.body
  );
}

/**
 * ImportResultItem - Individual result row
 */
function ImportResultItem({ item }) {
  const type = item._type;
  const styles = {
    matched: { borderColor: '#4ade80', iconColor: 'text-[#4ade80]', icon: '✓', label: 'Matched:', labelColor: 'text-[#4ade80]' },
    skipped: { borderColor: '#fbbf24', iconColor: 'text-[#fbbf24]', icon: '⏭', label: 'Skipped:', labelColor: 'text-[#fbbf24]' },
    failed: { borderColor: '#f87171', iconColor: 'text-[#f87171]', icon: '✗', label: 'Closest:', labelColor: 'text-[#f87171]' },
  };
  const s = styles[type] || styles.matched;

  const formatDuration = (seconds) => {
    if (!seconds) return null;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hrs > 0 ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const getDisplayInfo = () => {
    if (type === 'matched') {
      return { title: item.video?.title || '', channel: item.video?.channel_title || item.channel || '', videoId: item.video?.id || '', similarity: null, localDuration: null, ytDuration: null };
    } else if (type === 'skipped') {
      return { title: item.reason || 'Skipped by user', channel: '', videoId: '', similarity: null, localDuration: null, ytDuration: null };
    } else {
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
    <div className="m-1 p-2.5 sm:p-3 rounded-md bg-[#1a1d24] hover:bg-[#22262f] transition-colors" style={{ borderLeft: `3px solid ${s.borderColor}` }}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[12px] flex-shrink-0 ${s.iconColor}`}>{s.icon}</span>
        <span className="font-mono text-[11px] text-white truncate min-w-0 flex-1">{item.filename}</span>
      </div>
      <div className="flex items-start gap-2 pl-5">
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
          <span className={`text-[10px] font-medium uppercase tracking-wide flex-shrink-0 ${s.labelColor}`}>{s.label}</span>
          <span className="text-[12px] text-[#64748b] leading-relaxed line-clamp-2">{info.title}</span>
          {info.channel && <span className="text-[11px] text-[#475569] w-full mt-0.5">· {info.channel}</span>}
        </div>
        {(info.videoId || info.similarity || info.localDuration) && (
          <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
            {info.videoId && <span className="font-mono text-[9px] text-[#64748b] bg-white/5 px-1.5 py-0.5 rounded">{info.videoId}</span>}
            {info.similarity && <span className="text-[9px] font-semibold text-[#f87171] bg-[#f87171]/10 px-1.5 py-0.5 rounded">{info.similarity}%</span>}
            {(info.localDuration || info.ytDuration) && <span className="text-[9px] text-[#64748b] bg-white/5 px-1.5 py-0.5 rounded">{info.localDuration || '--:--'} / {info.ytDuration || '--:--'}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default {
  DurationSettingsModal,
  CategoryManagementModal,
  DeleteCategoryModal,
  SingleCategoryModal,
  ImportResultsModal
};
