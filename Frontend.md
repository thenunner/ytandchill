# Frontend.md

Master inventory of all frontend source files in `/frontend/src/`.

**Total Files:** 56 | **Total Lines:** ~19,860

---

## Entry Points (2 files, 357 lines)

| File | Lines | Description |
|------|-------|-------------|
| `main.jsx` | 38 | React app bootstrap with providers (QueryClient, Notification, Preferences, ErrorBoundary, BrowserRouter) |
| `App.jsx` | 319 | Root component with routing, SSE connection, toast notifications, sidebar navigation, update checking, UpdateBanner |

---

## Routes (14 files, 10,094 lines)

| File | Lines | Description |
|------|-------|-------------|
| `routes/Discover.jsx` | 1,476 | Channel discovery with category system, duration filtering, sorting, bulk operations |
| `routes/Library.jsx` | 1,418 | Downloaded videos library with playlist/category management, bulk operations, filtering |
| `routes/PlaylistPlayer.jsx` | 1,322 | Video player for playlists/categories with navigation, progress saving, playlist management |
| `routes/Settings.jsx` | 1,090 | Settings configuration with auto-scan scheduling, password change, database maintenance, theme picker |
| `routes/Import.jsx` | 771 | Import folder scanning with MKV encoding options (MkvPromptCard inline), smart identification, progress tracking |
| `routes/DiscoverChannel.jsx` | 714 | Single channel video discovery with duration/date filtering, bulk operations, ignored video tracking |
| `routes/Playlist.jsx` | 566 | Playlist viewing with video management, bulk operations, playlist editing |
| `routes/Videos.jsx` | 536 | YouTube playlist scanning and video queueing interface |
| `routes/LibraryChannel.jsx` | 521 | Downloaded videos for a specific channel with filtering and bulk deletion |
| `routes/Queue.jsx` | 508 | Download queue management with drag-and-drop reordering, pause/resume, progress tracking |
| `routes/Player.jsx` | 440 | Single video player with progress saving, delete/mark watched options, history management |
| `routes/WatchHistory.jsx` | 289 | Watch history display with filtering, sorting, clear history functionality |
| `routes/Favs.jsx` | 258 | Favorite channels and videos display with new video indicators |
| `routes/Auth.jsx` | 185 | Login/setup authentication form with credential validation and session handling |

---

## Components (18 files, 3,611 lines)

### Root Components (8 files, 1,983 lines)

| File | Lines | Description |
|------|-------|-------------|
| `components/VideoCard.jsx` | 610 | Reusable video card with thumbnails, metadata, action menus, watch status |
| `components/AddToPlaylistMenu.jsx` | 371 | Dropdown menu for adding videos to playlists with playlist creation option |
| `components/Sidebar.jsx` | 250 | Navigation sidebar with route links, badges, favorites, collapse toggle |
| `components/Toast.jsx` | 199 | Toast notification system with auto-dismiss and cross-device sync support |
| `components/MobileBottomNav.jsx` | 156 | Mobile bottom navigation bar with route shortcuts and badge counters |
| `components/Icons.jsx` | 143 | All icon components consolidated (19 icons: Settings, ThreeDots, Checkmark, Trash, Play, Shuffle, Filter, ArrowLeft, Plus, Eye, Upload, Channels, Library, Queue, Logout, Menu, Collapse, Heart, History) |
| `components/ListFeedback.jsx` | 111 | List feedback components (LoadingSpinner, EmptyState, LoadMore, Pagination) |
| `components/ErrorBoundary.jsx` | 38 | React error boundary for catching component errors |

### StickyBar Components (6 files, 828 lines)

| File | Lines | Description |
|------|-------|-------------|
| `components/stickybar/StickyBarControls.jsx` | 270 | Combined controls: SortDropdown, StickyBarRightSection, BackButton, EditButton, TabGroup |
| `components/stickybar/ActionDropdown.jsx` | 224 | Generic action dropdown menu with custom items, mobile bottom sheet |
| `components/stickybar/CollapsibleSearch.jsx` | 179 | Responsive search: icon→overlay on mobile, full input on desktop; supports `alwaysExpanded` prop |
| `components/stickybar/SelectionBar.jsx` | 143 | Floating selection mode bar for bulk operations |
| `components/stickybar/StickyBar.jsx` | 7 | Wrapper for sticky top bar layout |
| `components/stickybar/index.js` | 5 | Barrel export for sticky bar components |

### UI Modal Components (5 files, 2,104 lines)

| File | Lines | Description |
|------|-------|-------------|
| `components/ui/DiscoverModals.jsx` | 700 | Discover modals (duration settings, category management, import results) |
| `components/ui/SettingsModals.jsx` | 644 | Settings modals (database maintenance, metadata fix, shrink DB, not found videos) |
| `components/ui/LibraryModals.jsx` | 402 | Library modals (rename playlist, create category, rename category, select category) |
| `components/ui/SharedModals.jsx` | 337 | Shared modals (ResponsiveModal, ResponsiveModalActions, ConfirmModal, ConfirmDialog) |
| `components/ui/Tooltip.jsx` | 21 | Hover tooltip component |

---

## Hooks (9 files, 1,787 lines)

| File | Lines | Description |
|------|-------|-------------|
| `hooks/useVideoJsPlayer.js` | 736 | Video.js player initialization, controls, theater mode, seeking, progress saving, subtitles, SponsorBlock |
| `hooks/useNativeVideoPlayer.js` | 254 | Native HTML5 video player for mobile with progress saving and watch threshold |
| `hooks/useToastManager.js` | 212 | Toast notification management based on queue/scan state |
| `hooks/useDatabaseMaintenance.js` | 212 | Database maintenance operations (repair, shrink, find missing, fix metadata) |
| `hooks/useAutoScan.js` | 171 | Auto-scan scheduling with preset times and enable/disable |
| `hooks/usePasswordChange.js` | 84 | Password change form state and validation |
| `hooks/usePrefetchImage.js` | 43 | Image prefetching via Intersection Observer before viewport visibility |
| `hooks/useGridColumns.js` | 40 | Grid column responsive behavior with touch device orientation handling |
| `hooks/useMediaQuery.js` | 35 | Media query responsive breakpoint hook |

---

## Contexts (2 files, 250 lines)

| File | Lines | Description |
|------|-------|-------------|
| `contexts/NotificationContext.jsx` | 119 | Toast notification system with message queue, auto-dismiss, persistent toasts, progress tracking |
| `contexts/PreferencesContext.jsx` | 131 | Combined preferences: theme (9 themes), card sizes (channels/library), selection bar visibility |

---

## API (3 files, 1,453 lines)

| File | Lines | Description |
|------|-------|-------------|
| `api/queries.js` | 763 | React Query hooks for all API endpoints (channels, videos, queue, playlists, settings, auth) |
| `api/client.js` | 534 | HTTP API client with request handling, auth, channels, videos, playlists, categories, queue, settings, import endpoints |
| `api/useQueueSSE.js` | 156 | Server-Sent Events hook for real-time queue updates with auto-reconnection and fallback polling |

---

## Utils (2 files, 734 lines)

| File | Lines | Description |
|------|-------|-------------|
| `utils/utils.js` | 473 | Consolidated utilities (formatting: duration, file size, dates; grid system; error handling; settings helpers) |
| `utils/videoUtils.js` | 261 | Video player utilities (source detection, theater button, seek buttons, device detection, player constants) |

---

## Constants (2 files, 68 lines)

| File | Lines | Description |
|------|-------|-------------|
| `constants/stickyBarOptions.js` | 57 | Centralized sort options for video lists, channels, library with dividers and headers |
| `constants/toastIds.js` | 11 | Toast notification ID constants (scanning, paused, delay, download progress, cookie warning) |

---

## Plugins (1 file, 299 lines)

| File | Lines | Description |
|------|-------|-------------|
| `plugins/videojs-seek-coordinator.js` | 299 | Video.js plugin for handling seeking with yt-dlp videos (keyframe snapping, Chrome decoder support) |

---

## Summary by Category

| Category | Files | Lines | Purpose |
|----------|-------|-------|---------|
| Entry Points | 2 | 357 | App bootstrap and routing |
| Routes | 14 | 10,094 | Page components for all features |
| Components (root) | 8 | 1,983 | Reusable UI components |
| StickyBar | 6 | 828 | Sticky bar layout and controls |
| UI Modals | 5 | 2,104 | Modal dialogs for forms |
| Hooks | 9 | 1,787 | Custom React hooks |
| Contexts | 2 | 250 | React context providers |
| API | 3 | 1,453 | API client and queries |
| Utils | 2 | 734 | Utility functions |
| Constants | 2 | 68 | Configuration constants |
| Plugins | 1 | 299 | Video.js plugins |
| **TOTAL** | **56** | **~19,860** | **Complete frontend** |
