import { memo, useState, useRef, useEffect } from 'react';

// Format seconds to mm:ss or hh:mm:ss
function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// SponsorBlock segment colors
const SPONSOR_COLORS = {
  sponsor: 'rgba(0, 212, 144, 0.7)',
  selfpromo: 'rgba(255, 193, 7, 0.7)',
  interaction: 'rgba(138, 43, 226, 0.7)',
  intro: 'rgba(0, 191, 255, 0.7)',
  outro: 'rgba(0, 0, 139, 0.7)',
  preview: 'rgba(135, 206, 235, 0.7)',
  filler: 'rgba(128, 128, 128, 0.7)',
  music_offtopic: 'rgba(255, 140, 0, 0.7)',
};

// Icons
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
  </svg>
);

const SeekBackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    <text x="12" y="14" textAnchor="middle" fontSize="7" fontWeight="bold">10</text>
  </svg>
);

const SeekForwardIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
    <text x="12" y="14" textAnchor="middle" fontSize="7" fontWeight="bold">10</text>
  </svg>
);

const VolumeIcon = ({ muted, volume }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    {muted || volume === 0 ? (
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    ) : volume < 0.5 ? (
      <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
    ) : (
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    )}
  </svg>
);

const TheaterIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    {active ? (
      <path d="M19 7H5c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm0 8H5V9h14v6z" />
    ) : (
      <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 7h14v10H5z" />
    )}
  </svg>
);

const FullscreenIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    {active ? (
      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
    ) : (
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    )}
  </svg>
);

const SpinnerIcon = () => (
  <svg className="w-8 h-8 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

function PlayerControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  playbackRate,
  isFullscreen,
  showControls,
  isBuffering,
  isTheaterMode,
  sponsorSegments,
  onTogglePlay,
  onSeek,
  onSeekRelative,
  onSetSpeed,
  onToggleMute,
  onSetVolume,
  onToggleFullscreen,
  onToggleTheaterMode,
  isMobile = false,
}) {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const progressRef = useRef(null);
  const speedMenuRef = useRef(null);

  // Close speed menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle progress bar click/drag (mouse and touch)
  const handleProgressSeek = (clientX) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(percent * duration);
  };

  const handleProgressClick = (e) => {
    handleProgressSeek(e.clientX);
  };

  const handleProgressDrag = (e) => {
    if (!isDragging) return;
    handleProgressSeek(e.clientX);
  };

  // Touch events for mobile scrubbing
  const handleTouchStart = (e) => {
    setIsDragging(true);
    handleProgressSeek(e.touches[0].clientX);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    e.preventDefault(); // Prevent scrolling while scrubbing
    handleProgressSeek(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  // Speed options
  const speedOptions = [1, 1.5, 2, 2.5];

  return (
    <div
      className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${
        showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Buffering indicator */}
      {isBuffering && isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <SpinnerIcon />
        </div>
      )}

      {/* Big play button overlay (when paused) */}
      {!isPlaying && !isBuffering && (
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onTogglePlay(); }}
        >
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors">
            <PlayIcon />
          </div>
        </div>
      )}

      {/* Gradient overlay for controls */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

      {/* Control bar */}
      <div className="relative z-10 px-3 pb-3 md:px-4 md:pb-4" onClick={(e) => e.stopPropagation()}>
        {/* Progress bar */}
        <div
          ref={progressRef}
          className="relative h-1 md:h-1.5 bg-white/30 rounded-full cursor-pointer mb-3 group"
          onClick={handleProgressClick}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          onMouseMove={handleProgressDrag}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* SponsorBlock markers */}
          {sponsorSegments.map((segment, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 rounded-full"
              style={{
                left: `${(segment.start / duration) * 100}%`,
                width: `${((segment.end - segment.start) / duration) * 100}%`,
                backgroundColor: SPONSOR_COLORS[segment.category] || SPONSOR_COLORS.sponsor,
              }}
              title={segment.category}
            />
          ))}

          {/* Buffered */}
          <div
            className="absolute top-0 left-0 h-full bg-white/40 rounded-full"
            style={{ width: `${progressPercent + 5}%` }}
          />

          {/* Progress */}
          <div
            className="absolute top-0 left-0 h-full bg-accent rounded-full"
            style={{ width: `${progressPercent}%` }}
          />

          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 bg-accent rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progressPercent}% - 6px)` }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Play/Pause */}
          <button
            onClick={onTogglePlay}
            className="p-1.5 md:p-2 text-white hover:text-accent transition-colors"
            title={isPlaying ? 'Pause (K)' : 'Play (K)'}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Seek back */}
          <button
            onClick={() => onSeekRelative(-10)}
            className="p-1.5 md:p-2 text-white hover:text-accent transition-colors"
            title="Back 10s (J)"
          >
            <SeekBackIcon />
          </button>

          {/* Seek forward */}
          <button
            onClick={() => onSeekRelative(10)}
            className="p-1.5 md:p-2 text-white hover:text-accent transition-colors"
            title="Forward 10s (L)"
          >
            <SeekForwardIcon />
          </button>

          {/* Volume (desktop only) */}
          {!isMobile && (
            <div className="flex items-center gap-1 group">
              <button
                onClick={onToggleMute}
                className="p-1.5 md:p-2 text-white hover:text-accent transition-colors"
                title="Mute (M)"
              >
                <VolumeIcon muted={isMuted} volume={volume} />
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => onSetVolume(parseFloat(e.target.value))}
                className="w-0 group-hover:w-16 transition-all duration-200 h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0"
              />
            </div>
          )}

          {/* Time display */}
          <div className="text-white text-xs md:text-sm ml-1">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Playback speed */}
          <div className="relative" ref={speedMenuRef}>
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="px-2 py-1 text-white text-xs md:text-sm hover:text-accent transition-colors"
              title="Playback speed"
            >
              {playbackRate}x
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-dark-secondary rounded-lg shadow-lg overflow-hidden">
                {speedOptions.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => {
                      onSetSpeed(speed);
                      localStorage.setItem('playbackSpeed', String(speed));
                      setShowSpeedMenu(false);
                    }}
                    className={`block w-full px-4 py-2 text-sm text-left hover:bg-white/10 transition-colors ${
                      playbackRate === speed ? 'text-accent' : 'text-white'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Theater mode (desktop only) */}
          {!isMobile && onToggleTheaterMode && (
            <button
              onClick={onToggleTheaterMode}
              className="p-1.5 md:p-2 text-white hover:text-accent transition-colors"
              title="Theater mode (T)"
            >
              <TheaterIcon active={isTheaterMode} />
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 md:p-2 text-white hover:text-accent transition-colors"
            title="Fullscreen (F)"
          >
            <FullscreenIcon active={isFullscreen} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(PlayerControls);
