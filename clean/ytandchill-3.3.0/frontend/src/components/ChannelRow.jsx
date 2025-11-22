import { useState, useEffect, useRef } from 'react';

export default function ChannelRow({ channel, onScan, onUpdateChannel, onDelete, navigate, showNotification }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [minMinutes, setMinMinutes] = useState(channel.min_minutes || 0);
  const [maxMinutes, setMaxMinutes] = useState(channel.max_minutes || 0);
  const cardRef = useRef(null);

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
      className={`card flex items-stretch p-0 w-full cursor-pointer transition-all group ${
        showMenu ? 'max-w-5xl' : 'max-w-3xl'
      }`}
      onClick={(e) => {
        if (!e.target.closest('button') && !e.target.closest('input')) {
          navigate(`/channel/${channel.id}`);
        }
      }}
    >
      {/* 3-Dot Menu Button - Full height */}
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
        className={`flex flex-col justify-center gap-2 overflow-hidden transition-all duration-200 ease-in-out ${
          showMenu ? 'w-[100px] opacity-100 px-2' : 'w-0 opacity-0'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowSettings(!showSettings);
          }}
          className={`px-3 py-1.5 text-sm text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap ${showSettings ? 'ring-1 ring-accent' : ''}`}
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
          className="px-3 py-1.5 text-sm text-red-400 hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
        >
          Delete
        </button>
      </div>

      {/* Channel Settings Slide-out - Row 1: Min/Max, Row 2: Auto-Download, Save button */}
      <div
        className={`flex flex-col justify-center gap-2 overflow-hidden transition-all duration-200 ease-in-out ${
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

      {/* Content - Thumbnail + Info */}
      <div className="flex items-center gap-4 flex-1 py-3 px-3">
        {/* Thumbnail */}
        <div className="relative w-[140px] h-[60px] flex-shrink-0 bg-dark-tertiary rounded overflow-hidden hidden sm:block">
          {channel.thumbnail ? (
            <img
              src={channel.thumbnail}
              alt={channel.title}
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

        {/* Info Section - 2 lines */}
        <div className="flex-1 min-w-0">
          {/* Line 1: Title + Last Updated */}
          <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors line-clamp-1 leading-tight" title={channel.title}>
            {channel.auto_download && (
              <span className="text-green-500 mr-1">(AUTO)</span>
            )}
            {channel.title}
            <span className="text-text-secondary font-normal ml-2 text-sm">
              Last: {channel.last_scan_at ? (() => {
                const date = new Date(channel.last_scan_at);
                const now = new Date();
                const diffTime = now - date;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays <= 0) return 'Today';
                if (diffDays === 1) return 'Yesterday';
                if (diffDays < 7) return `${diffDays}d ago`;
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              })() : 'Never'}
            </span>
          </h3>

          {/* Line 2: Stats Row */}
          <div className="flex items-center gap-4 mt-1.5">
            {/* Downloaded */}
            <div className="flex items-center gap-1 text-sm font-semibold text-accent" title="Downloaded">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span className="font-mono">{channel.downloaded_count || 0}</span>
            </div>

            {/* Discovered */}
            <div className="flex items-center gap-1 text-sm font-semibold text-gray-400" title="To Review">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="1"></circle>
              </svg>
              <span className="font-mono">{channel.video_count || 0}</span>
            </div>

            {/* Ignored */}
            <div className="flex items-center gap-1 text-sm font-semibold text-gray-400" title="Ignored">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
              </svg>
              <span className="font-mono">{channel.ignored_count || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
