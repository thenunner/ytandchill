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
      className="card flex items-center gap-2 p-0 w-full cursor-pointer transition-colors group"
      onClick={(e) => {
        if (!e.target.closest('button') && !e.target.closest('input')) {
          navigate(`/channel/${channel.id}`);
        }
      }}
    >
      {/* 3-Dot Menu Button */}
      <div className="flex-shrink-0 pl-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
            if (showSettings) setShowSettings(false);
          }}
          className="w-7 h-7 flex items-center justify-center bg-dark-tertiary hover:bg-dark-hover text-text-secondary hover:text-text-primary rounded transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"></circle>
            <circle cx="12" cy="12" r="2"></circle>
            <circle cx="12" cy="19" r="2"></circle>
          </svg>
        </button>
      </div>

      {/* Sliding Drawer Menu - Channel Settings or Delete */}
      <div
        className={`flex gap-1 overflow-hidden transition-all duration-200 ease-in-out ${
          showMenu ? 'w-[200px] opacity-100' : 'w-0 opacity-0'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowSettings(!showSettings);
          }}
          className={`px-2 py-1 text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap ${showSettings ? 'ring-1 ring-accent' : ''}`}
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
          className="px-2 py-1 text-xs text-red-400 hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
        >
          Delete
        </button>
      </div>

      {/* Channel Settings Slide-out - Min/Max/Save on row 1, Auto-Download on row 2 */}
      <div
        className={`flex flex-col gap-1 overflow-hidden transition-all duration-200 ease-in-out ${
          showSettings && showMenu ? 'w-[280px] opacity-100 pr-2' : 'w-0 opacity-0'
        }`}
      >
        {/* Row 1: Min + Max + Save */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-secondary">Min</span>
          <input
            type="number"
            value={minMinutes}
            onChange={(e) => setMinMinutes(parseInt(e.target.value) || 0)}
            onClick={(e) => e.stopPropagation()}
            className="w-14 px-1 py-0.5 text-xs bg-dark-tertiary border border-dark-border rounded text-text-primary"
            min="0"
          />
          <span className="text-[10px] text-text-secondary">Max</span>
          <input
            type="number"
            value={maxMinutes}
            onChange={(e) => setMaxMinutes(parseInt(e.target.value) || 0)}
            onClick={(e) => e.stopPropagation()}
            className="w-14 px-1 py-0.5 text-xs bg-dark-tertiary border border-dark-border rounded text-text-primary"
            min="0"
          />
          <button
            onClick={handleSaveSettings}
            className="px-2 py-0.5 text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors"
          >
            Save
          </button>
        </div>
        {/* Row 2: Auto-Download */}
        <button
          onClick={handleToggleAutoDownload}
          className="px-2 py-0.5 text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors flex items-center gap-1 w-fit"
        >
          <input
            type="checkbox"
            checked={channel.auto_download || false}
            readOnly
            onClick={(e) => e.stopPropagation()}
            className="w-3 h-3 rounded border-dark-border bg-dark-tertiary text-accent"
          />
          <span>Auto-Download</span>
        </button>
      </div>

      {/* Content Row - Compact 2-line layout */}
      <div className="flex items-center gap-3 flex-1 py-2 pr-2">
        {/* Thumbnail */}
        <div className="relative w-[120px] h-[50px] flex-shrink-0 bg-dark-tertiary rounded overflow-hidden hidden sm:block">
          {channel.thumbnail ? (
            <img
              src={channel.thumbnail}
              alt={channel.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-6 h-6 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </div>
          )}
        </div>

        {/* Info Section - 2 lines */}
        <div className="flex-1 min-w-0">
          {/* Line 1: Title + Last Updated */}
          <h3 className="text-xs font-semibold text-text-primary group-hover:text-accent transition-colors line-clamp-1 leading-tight" title={channel.title}>
            {channel.auto_download && (
              <span className="text-green-500 mr-1">(AUTO)</span>
            )}
            {channel.title}
            <span className="text-text-secondary font-normal ml-2 text-[10px]">
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
          <div className="flex items-center gap-3 mt-1">
            {/* Downloaded */}
            <div className="flex items-center gap-1 text-xs font-semibold text-accent" title="Downloaded">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span className="font-mono">{channel.downloaded_count || 0}</span>
            </div>

            {/* Discovered */}
            <div className="flex items-center gap-1 text-xs font-semibold text-gray-400" title="To Review">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="1"></circle>
              </svg>
              <span className="font-mono">{channel.video_count || 0}</span>
            </div>

            {/* Ignored */}
            <div className="flex items-center gap-1 text-xs font-semibold text-gray-400" title="Ignored">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
