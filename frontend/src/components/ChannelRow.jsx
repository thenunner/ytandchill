import { useState, useEffect, useRef } from 'react';

export default function ChannelRow({ channel, onScan, onUpdateChannel, onDelete, navigate, showNotification, editMode, isSelected, onToggleSelect }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [minMinutes, setMinMinutes] = useState(channel.min_minutes || 0);
  const [maxMinutes, setMaxMinutes] = useState(channel.max_minutes || 0);
  const cardRef = useRef(null);

  // Helper function to format scan time
  const formatScanTime = (scanTimeString) => {
    if (!scanTimeString) return null;
    const scanDate = new Date(scanTimeString);
    const now = new Date();
    const isToday = scanDate.toDateString() === now.toDateString();

    if (isToday) {
      // Show time
      const hours = scanDate.getHours();
      const minutes = scanDate.getMinutes();
      const ampm = hours >= 12 ? 'pm' : 'am';
      const displayHours = hours % 12 || 12;
      const displayMinutes = minutes.toString().padStart(2, '0');
      return `${displayHours}:${displayMinutes}${ampm}`;
    } else {
      // Show date
      return scanDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    }
  };

  // Helper function to format video date
  const formatVideoDate = (videoDateString) => {
    if (!videoDateString) return null;
    const year = videoDateString.substring(0, 4);
    const month = videoDateString.substring(4, 6);
    const day = videoDateString.substring(6, 8);
    const videoDate = new Date(year, month - 1, day);
    return videoDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  };

  // Click outside to progressively close menus
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (cardRef.current && !cardRef.current.contains(event.target)) {
        if (showSettings) {
          setShowSettings(false);
        } else if (showMenu) {
          setShowMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu, showSettings]);

  const handleSaveSettings = async (e) => {
    e.stopPropagation();
    try {
      await onUpdateChannel({
        id: channel.id,
        data: {
          min_minutes: minMinutes,
          max_minutes: maxMinutes,
        }
      });
      showNotification('Duration settings saved', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to save settings', 'error');
    }
  };

  const handleToggleAutoDownload = async (e) => {
    e.stopPropagation();
    const newValue = !channel.auto_download;
    try {
      await onUpdateChannel({
        id: channel.id,
        data: { auto_download: newValue }
      });
      showNotification(
        newValue
          ? `Auto-download enabled for ${channel.title}`
          : `Auto-download disabled for ${channel.title}`,
        'success'
      );
    } catch (error) {
      showNotification(error.message || 'Failed to update auto-download', 'error');
    }
  };

  return (
    <div
      ref={cardRef}
      className={`card p-0 cursor-pointer transition-all w-full overflow-x-auto relative ${
        isSelected ? 'ring-2 ring-accent/60' : ''
      } ${editMode ? 'hover:ring-2 hover:ring-accent/50' : 'group'}`}
      onClick={(e) => {
        if (editMode) {
          onToggleSelect?.(channel.id);
        } else if (!e.target.closest('button') && !e.target.closest('input')) {
          navigate(`/channel/${channel.id}`);
        }
      }}
    >
      {/* Checkmark overlay when selected in edit mode */}
      {editMode && isSelected && (
        <div className="absolute top-2 right-2 bg-black/80 text-white rounded-full p-1.5 shadow-lg z-10">
          <svg className="w-4 h-4 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      )}

      {/* Inner flex container that expands when menu opens */}
      <div className={`flex items-stretch ${
        showMenu && !editMode
          ? showSettings
            ? 'min-w-[753px]' // Base 393px + drawer 100px + settings 260px
            : 'min-w-[493px]'  // Base 393px + drawer 100px
          : 'min-w-full'
      }`}
      >
      {/* 3-Dot Menu Button and Drawers - hidden in edit mode */}
      {!editMode && (
        <>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
            if (showSettings) setShowSettings(false);
          }}
          className="flex-shrink-0 w-10 flex items-center justify-center bg-dark-tertiary hover:bg-dark-hover text-text-secondary hover:text-text-primary transition-colors border-r border-dark-border"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"></circle>
            <circle cx="12" cy="12" r="2"></circle>
            <circle cx="12" cy="19" r="2"></circle>
          </svg>
        </button>

        {/* Sliding Drawer Menu - Settings (row 1) and Delete (row 2) */}
      <div
        className={`flex flex-col justify-center gap-1 overflow-hidden transition-all duration-200 ease-in-out ${
          showMenu ? 'w-[100px] opacity-100 px-2' : 'w-0 opacity-0'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowSettings(!showSettings);
          }}
          className={`px-3 py-1 text-sm text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap ${showSettings ? 'ring-1 ring-accent' : ''}`}
        >
          Settings
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete({ id: channel.id, title: channel.title });
            setShowMenu(false);
            setShowSettings(false);
          }}
          className="px-3 py-1 text-sm text-red-400 hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
        >
          Delete
        </button>
      </div>

      {/* Channel Settings Slide-out - Row 1: Min/Max, Row 2: Auto-Download, Save button */}
      <div
        className={`flex flex-col justify-center gap-1 overflow-hidden transition-all duration-200 ease-in-out ${
          showSettings && showMenu ? 'w-[260px] opacity-100 px-2' : 'w-0 opacity-0'
        }`}
      >
        {/* Row 1: Min + Max */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">Min</span>
          <input
            type="number"
            value={minMinutes}
            onChange={(e) => setMinMinutes(parseInt(e.target.value) || 0)}
            onClick={(e) => e.stopPropagation()}
            className="w-16 px-2 py-1 text-sm bg-dark-tertiary border border-dark-border rounded text-text-primary"
            min="0"
          />
          <span className="text-xs text-text-secondary">Max</span>
          <input
            type="number"
            value={maxMinutes}
            onChange={(e) => setMaxMinutes(parseInt(e.target.value) || 0)}
            onClick={(e) => e.stopPropagation()}
            className="w-16 px-2 py-1 text-sm bg-dark-tertiary border border-dark-border rounded text-text-primary"
            min="0"
          />
        </div>
        {/* Row 2: Auto-Download checkbox + Save button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleAutoDownload}
            className="px-2 py-1 text-sm text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors flex items-center gap-1"
          >
            <input
              type="checkbox"
              checked={channel.auto_download || false}
              readOnly
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent"
            />
            <span>Auto-Download</span>
          </button>
          <button
            onClick={handleSaveSettings}
            className="px-3 py-1 text-sm text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors"
          >
            Save
          </button>
        </div>
      </div>
        </>
      )}

      {/* Content - Thumbnail + Info */}
      <div className="flex items-stretch gap-2 sm:gap-2 flex-1 pl-0 sm:pl-2 pr-2">
        {/* Thumbnail - Always visible, fills card height on mobile */}
        <div className="relative w-[50px] sm:w-[100px] h-[60px] sm:h-auto flex-shrink-0 bg-dark-tertiary rounded overflow-hidden my-0 sm:my-1.5 ml-0 sm:ml-0">
          {channel.thumbnail ? (
            <img
              src={channel.thumbnail}
              alt={channel.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </div>
          )}
        </div>

        {/* Info Section - 3 rows */}
        <div className="flex-1 min-w-0 space-y-0.5 py-1.5 flex flex-col justify-center">
          {/* Row 1: Title */}
          <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent-text transition-colors line-clamp-1 leading-tight" title={channel.title}>
            {channel.title}
          </h3>

          {/* Row 2: Scan and Last Video dates */}
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span>Scan: <span className="text-text-primary">{formatScanTime(channel.last_scan_time) || 'None'}</span></span>
            <span className="w-1 h-1 bg-text-muted rounded-full flex-shrink-0"></span>
            <span>Last Video: <span className="text-text-primary">{formatVideoDate(channel.last_video_date) || 'None'}</span></span>
          </div>

          {/* Row 3: AUTO badge + Stats (Downloaded, To Review, Ignored) */}
          <div className="flex items-center gap-2">
            {/* AUTO badge */}
            {channel.auto_download && (
              <>
                <span className="text-green-500 text-xs font-bold">AUTO</span>
                <span className="w-1 h-1 bg-text-muted rounded-full flex-shrink-0"></span>
              </>
            )}
            {/* Downloaded */}
            <div className="flex items-center gap-0.5 text-sm font-semibold text-accent-text" title="Downloaded">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span className="font-mono">{channel.downloaded_count || 0}</span>
            </div>

            {/* Discovered */}
            <div className="flex items-center gap-0.5 text-sm font-semibold text-gray-400" title="To Review">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="1"></circle>
              </svg>
              <span className="font-mono">{channel.video_count || 0}</span>
            </div>

            {/* Ignored */}
            <div className="flex items-center gap-0.5 text-sm font-semibold text-gray-400" title="Ignored">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
              </svg>
              <span className="font-mono">{channel.ignored_count || 0}</span>
            </div>
          </div>
        </div>
      </div>
      </div> {/* Close inner flex container */}
    </div>
  );
}
