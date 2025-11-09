import { useState } from 'react';

export default function ChannelRow({ channel, onScan, onEditFilters, onDelete, navigate }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className="card flex items-center gap-3 p-0 w-full cursor-pointer transition-colors group"
      onClick={(e) => {
        if (!e.target.closest('button')) {
          navigate(`/channel/${channel.id}`);
        }
      }}
    >
      {/* 3-Dot Menu Button - Left of thumbnail */}
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

      {/* Sliding Drawer Menu - slides in from left, pushing content right */}
      <div
        className={`flex flex-col gap-1 overflow-hidden transition-all duration-200 ease-in-out ${
          showMenu ? 'w-[140px] opacity-100 pr-3' : 'w-0 opacity-0'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onScan(channel.id, false);
            setShowMenu(false);
          }}
          className="px-3 py-1.5 text-left text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
        >
          Scan New
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onScan(channel.id, true);
            setShowMenu(false);
          }}
          className="px-3 py-1.5 text-left text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
        >
          Rescan All
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEditFilters(channel);
            setShowMenu(false);
          }}
          className="px-3 py-1.5 text-left text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
        >
          Edit Filters
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(channel.id);
            setShowMenu(false);
          }}
          className="px-3 py-1.5 text-left text-xs text-red-400 hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
        >
          Delete
        </button>
      </div>

      {/* Content Row */}
      <div className="flex items-center gap-4 flex-1 py-2 pr-3">
        {/* Thumbnail - Hidden on mobile */}
        <div className="relative w-[200px] h-[80px] flex-shrink-0 bg-dark-tertiary rounded-lg overflow-hidden hidden md:block">
          {channel.thumbnail ? (
            <img
              src={channel.thumbnail}
              alt={channel.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-10 h-10 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </div>
          )}

          {/* Last Scan Badge - Bottom Left */}
          <div className="absolute bottom-1.5 left-1.5 bg-dark-secondary/90 text-white px-2 py-0.5 rounded text-[10px] font-bold tracking-wide backdrop-blur-sm">
            {channel.last_scan_at ? new Date(channel.last_scan_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'}
          </div>
        </div>

        {/* Info Section */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors line-clamp-1 leading-tight" title={channel.title}>
            {channel.title}
          </h3>

          {/* Stats Row */}
          <div className="flex items-center gap-4 mt-2">
            {/* Downloaded */}
            <div className="flex items-center gap-1 text-sm font-semibold text-green-400" title="Downloaded videos">
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
            <div className="flex items-center gap-1 text-sm font-semibold text-gray-400" title="Ignored videos">
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
