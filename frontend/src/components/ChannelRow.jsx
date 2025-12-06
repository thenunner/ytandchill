import { useState, useEffect, useRef } from 'react';
import { useCardSize } from '../contexts/CardSizeContext';
import { getTextSizes } from '../utils/gridUtils';

export default function ChannelRow({ channel, onScan, onUpdateChannel, onDelete, navigate, showNotification, editMode, isSelected, onToggleSelect }) {
  const { cardSize } = useCardSize();
  const textSizes = getTextSizes(cardSize);
  const [showMenu, setShowMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [minMinutes, setMinMinutes] = useState(channel.min_minutes || 0);
  const [maxMinutes, setMaxMinutes] = useState(channel.max_minutes || 0);
  const cardRef = useRef(null);
  const menuRef = useRef(null);

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

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
        setShowSettings(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

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
      className={`card p-0 cursor-pointer transition-all w-full relative ${
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

      {/* Inner flex container */}
      <div className="flex items-center w-full">

      {/* 3-Dot Menu Button - Left side (only when not in edit mode) */}
      {!editMode && (
        <div className="flex-shrink-0 pl-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="w-8 h-8 flex items-center justify-center bg-dark-tertiary hover:bg-dark-hover text-text-secondary hover:text-text-primary rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2"></circle>
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="12" cy="19" r="2"></circle>
            </svg>
          </button>
        </div>
      )}

      {/* Sliding Drawer Menu - slides in from left, pushing content right */}
      {!editMode && (
        <div
          className={`flex flex-col gap-1 overflow-hidden transition-all duration-200 ease-in-out ${
            showMenu ? 'w-[160px] opacity-100 pr-3' : 'w-0 opacity-0'
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSettings(!showSettings);
            }}
            className="px-3 py-1.5 text-left text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap flex items-center gap-2"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 1v6m0 6v6m5.657-13.657l-4.243 4.243m-2.828 2.828l-4.243 4.243m16.97 1.414l-6-6m-6-6l-6-6"></path>
            </svg>
            Duration Settings
          </button>
          <button
            onClick={handleToggleAutoDownload}
            className="px-3 py-1.5 text-left text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap flex items-center gap-2"
          >
            <input
              type="checkbox"
              checked={channel.auto_download || false}
              readOnly
              onClick={(e) => e.stopPropagation()}
              className="w-3 h-3 rounded border-dark-border bg-dark-tertiary text-accent pointer-events-none"
            />
            Auto-Download
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete({ id: channel.id, title: channel.title });
              setShowMenu(false);
            }}
            className="px-3 py-1.5 text-left text-xs text-red-400 hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap flex items-center gap-2"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Delete
          </button>
        </div>
      )}

      {/* Settings Panel - expands when Duration Settings clicked */}
      {!editMode && showSettings && (
        <div className="flex-shrink-0 pr-3">
          <div className="bg-dark-secondary border border-dark-border rounded-lg p-3 min-w-[200px]">
            <div className="space-y-2">
              {/* Min/Max Duration */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">Min</span>
                <input
                  type="number"
                  value={minMinutes}
                  onChange={(e) => setMinMinutes(parseInt(e.target.value) || 0)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-14 px-2 py-1 text-xs bg-dark-tertiary border border-dark-border rounded text-text-primary"
                  min="0"
                />
                <span className="text-xs text-text-secondary">Max</span>
                <input
                  type="number"
                  value={maxMinutes}
                  onChange={(e) => setMaxMinutes(parseInt(e.target.value) || 0)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-14 px-2 py-1 text-xs bg-dark-tertiary border border-dark-border rounded text-text-primary"
                  min="0"
                />
              </div>
              <button
                onClick={handleSaveSettings}
                className="w-full px-3 py-1.5 text-xs text-white bg-accent hover:bg-accent/90 rounded transition-colors font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
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

          {/* To Review Badge - Upper Left Corner */}
          {channel.video_count > 0 && (
            <div className="absolute top-1 left-1 bg-gray-400 text-white px-1.5 py-0.5 rounded text-xs font-bold">
              {channel.video_count}
            </div>
          )}

          {/* Auto Download Badge - Upper Right Corner */}
          {channel.auto_download && (
            <div className="absolute top-1 right-1 bg-green-500 text-white px-1.5 py-0.5 rounded text-xs font-bold">
              AUTO
            </div>
          )}

          {/* Last Scan Time - Lower Right Corner */}
          {formatScanTime(channel.last_scan_time) && (
            <div className="absolute bottom-1 right-1 bg-black/80 text-white px-1.5 py-0.5 rounded text-xs font-semibold">
              {formatScanTime(channel.last_scan_time)}
            </div>
          )}
        </div>

        {/* Info Section - Title only */}
        <div className="flex-1 min-w-0 py-1.5 flex items-center">
          {/* Title */}
          <h3 className={`${textSizes.title} font-semibold text-text-primary group-hover:text-accent-text transition-colors line-clamp-2 leading-tight`} title={channel.title}>
            {channel.title}
          </h3>
        </div>
      </div>
      </div> {/* Close inner flex container */}
    </div>
  );
}
