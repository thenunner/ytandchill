import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../contexts/NotificationContext';
import {
  useScanImportFolder,
  useImportState,
  useResetImport,
  useSmartIdentify,
  useExecuteSmartImport,
  useSettings,
  useEncodeStatus,
} from '../api/queries';
import LoadingSpinner from '../components/LoadingSpinner';
import { CheckmarkIcon } from '../components/icons';
import MkvPromptCard from '../components/MkvPromptCard';

const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50GB

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ============================================================================
// RESULTS DETAIL MODAL - Shows all imports with filtering
// ============================================================================
function ResultsDetailModal({ imported, skipped, failed, onClose }) {
  const [filter, setFilter] = useState('all'); // 'all', 'imported', 'skipped', 'failed'
  const [copied, setCopied] = useState(false);

  const allItems = [
    ...(imported || []).map(item => ({ ...item, _type: 'imported' })),
    ...(skipped || []).map(item => ({ ...item, _type: 'skipped' })),
    ...(failed || []).map(item => ({ ...item, _type: 'failed' })),
  ];

  const filteredItems = filter === 'all'
    ? allItems
    : allItems.filter(item => item._type === filter);

  const getTypeColor = (type) => {
    switch (type) {
      case 'imported': return 'text-green-400 bg-green-400/10';
      case 'skipped': return 'text-yellow-400 bg-yellow-400/10';
      case 'failed': return 'text-red-400 bg-red-400/10';
      default: return 'text-text-muted';
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'imported': return 'Imported';
      case 'skipped': return 'Skipped';
      case 'failed': return 'Failed';
      default: return type;
    }
  };

  const generateExportText = (items) => {
    let text = `IMPORT RESULTS (${items.length} files)\n${'='.repeat(30)}\n\n`;
    items.forEach(item => {
      text += `[${item._type.toUpperCase()}] ${item.filename}\n`;
      if (item.video?.title) text += `  Title: ${item.video.title}\n`;
      if (item.channel) text += `  Channel: ${item.channel}\n`;
      if (item.reason) text += `  Reason: ${item.reason}\n`;
      text += '\n';
    });
    return text;
  };

  const handleExport = async (items) => {
    try {
      await navigator.clipboard.writeText(generateExportText(items));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-primary border border-dark-border rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-lg font-semibold text-text-primary">Import Results</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter tabs */}
        <div className="px-4 py-2 border-b border-dark-border flex gap-2">
          {[
            { key: 'all', label: 'All', count: allItems.length },
            { key: 'imported', label: 'Imported', count: imported?.length || 0, color: 'text-green-400' },
            { key: 'skipped', label: 'Skipped', count: skipped?.length || 0, color: 'text-yellow-400' },
            { key: 'failed', label: 'Failed', count: failed?.length || 0, color: 'text-red-400' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-accent/20 text-accent-text'
                  : 'text-text-secondary hover:text-text-primary hover:bg-dark-tertiary'
              }`}
            >
              <span className={tab.color}>{tab.count}</span> {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredItems.length === 0 ? (
            <div className="text-center text-text-muted py-8">No items</div>
          ) : (
            filteredItems.map((item, idx) => (
              <div key={idx} className="bg-dark-secondary border border-dark-border rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${getTypeColor(item._type)}`}>
                        {getTypeLabel(item._type)}
                      </span>
                      <span className="text-text-primary font-medium truncate">{item.filename}</span>
                    </div>
                    {item.video?.title && (
                      <div className="text-sm text-text-secondary truncate">{item.video.title}</div>
                    )}
                    {item.channel && (
                      <div className="text-xs text-text-muted">{item.channel}</div>
                    )}
                    {item.reason && (
                      <div className="text-sm text-red-400 mt-1">{item.reason}</div>
                    )}
                  </div>
                  <span className="text-text-muted text-xs flex-shrink-0">
                    {formatBytes(item.file_size || item.video?.file_size || 0)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport(filteredItems)}
              className="btn btn-secondary text-sm"
            >
              Copy {filter === 'all' ? 'All' : getTypeLabel(filter)}
            </button>
            {filter !== 'failed' && failed?.length > 0 && (
              <button
                onClick={() => handleExport(failed.map(f => ({ ...f, _type: 'failed' })))}
                className="btn btn-secondary text-sm text-red-400"
              >
                Copy Failed Only
              </button>
            )}
            {copied && (
              <span className="text-green-400 text-sm animate-pulse">Copied to clipboard!</span>
            )}
          </div>
          <button onClick={onClose} className="btn btn-primary">Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function Import() {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  // MKV choice
  const [mkvChoice, setMkvChoice] = useState(null);
  const [rememberChoice, setRememberChoice] = useState(false);

  // Queries
  const { data: scanData, isLoading: scanLoading, refetch: refetchScan } = useScanImportFolder(mkvChoice === 'include');
  const { data: stateData, refetch: refetchState } = useImportState();
  const { data: settings } = useSettings();
  const { data: encodeStatus, refetch: refetchEncode } = useEncodeStatus(true);

  // Extensions
  const mkvSettingEnabled = settings?.import_reencode_mkv === 'true';
  const reencodeMkv = mkvSettingEnabled || mkvChoice === 'include';
  const allowedExtensions = reencodeMkv ? ['.mkv', '.mp4', '.m4v', '.webm'] : ['.mp4', '.m4v', '.webm'];
  const VIDEO_EXTENSIONS_REGEX = reencodeMkv ? /\.(mp4|webm|m4v|mkv)$/i : /\.(mp4|webm|m4v)$/i;

  // Mutations
  const smartIdentify = useSmartIdentify();
  const executeSmartImport = useExecuteSmartImport();
  const resetImport = useResetImport();

  // Page state: 'setup' or 'progress'
  const [currentPage, setCurrentPage] = useState('setup');

  // Progress state
  const [pendingMatches, setPendingMatches] = useState([]);
  const [currentPendingIdx, setCurrentPendingIdx] = useState(0);
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importMode, setImportMode] = useState(null); // 'auto' or 'manual'

  // Results state
  const [importedList, setImportedList] = useState([]);
  const [skippedList, setSkippedList] = useState([]);
  const [failedList, setFailedList] = useState([]);
  const [showResultsModal, setShowResultsModal] = useState(false);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const [currentUploadProgress, setCurrentUploadProgress] = useState(0);
  const [rejectionError, setRejectionError] = useState(null);
  const rejectionTimerRef = useRef(null);

  // Derived state
  const isEncoding = encodeStatus?.encoding || false;
  const hasPendingMatches = pendingMatches.length > 0 && currentPendingIdx < pendingMatches.length;
  const isComplete = currentPage === 'progress' && !isEncoding && !hasPendingMatches && !isProcessing;

  // Poll during progress page
  useEffect(() => {
    if (currentPage === 'progress') {
      const interval = setInterval(() => {
        refetchState();
        refetchEncode();
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [currentPage, refetchState, refetchEncode]);

  // Sync imported from backend
  useEffect(() => {
    if (stateData?.imported) {
      setImportedList(stateData.imported);
    }
  }, [stateData?.imported]);

  // Auto-dismiss rejection error
  useEffect(() => {
    if (rejectionError) {
      if (rejectionTimerRef.current) clearInterval(rejectionTimerRef.current);
      rejectionTimerRef.current = setInterval(() => {
        setRejectionError(prev => {
          if (!prev || prev.countdown <= 1) {
            clearInterval(rejectionTimerRef.current);
            return null;
          }
          return { ...prev, countdown: prev.countdown - 1 };
        });
      }, 1000);
      return () => { if (rejectionTimerRef.current) clearInterval(rejectionTimerRef.current); };
    }
  }, [rejectionError?.files]);

  // Start import
  const handleStartImport = async (mode) => {
    setCurrentPage('progress');
    setImportMode(mode);
    setPendingMatches([]);
    setCurrentPendingIdx(0);
    setSelectedVideoId(null);
    setImportedList([]);
    setSkippedList([]);
    setFailedList([]);
    setIsProcessing(true);

    try {
      const result = await smartIdentify.mutateAsync({ mode });

      // Set failed list from identify result
      setFailedList(result.failed || []);

      // Auto-import identified files
      if (result.identified?.length > 0) {
        await executeSmartImport.mutateAsync(result.identified);
        await refetchState();
      }

      // Set pending for manual review (only in manual mode, or if not auto-matched)
      if (result.pending?.length > 0) {
        setPendingMatches(result.pending);
        setCurrentPendingIdx(0);
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirm match selection
  const handleConfirmMatch = async () => {
    if (!selectedVideoId) return;

    const pending = pendingMatches[currentPendingIdx];
    const selectedVideo = pending.matches.find(m => m.id === selectedVideoId);
    if (!selectedVideo) return;

    setIsProcessing(true);
    try {
      await executeSmartImport.mutateAsync([{
        file: pending.file,
        filename: pending.filename,
        video: selectedVideo,
        match_type: 'user_selected',
        channel_info: {
          channel_id: selectedVideo.channel_id,
          channel_title: selectedVideo.channel_title,
          channel_url: `https://youtube.com/channel/${selectedVideo.channel_id}`,
        },
      }]);
      await refetchState();
      setCurrentPendingIdx(prev => prev + 1);
      setSelectedVideoId(null);
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Skip match
  const handleSkipMatch = () => {
    const pending = pendingMatches[currentPendingIdx];
    setSkippedList(prev => [...prev, { filename: pending.filename, reason: 'Skipped by user' }]);
    setCurrentPendingIdx(prev => prev + 1);
    setSelectedVideoId(null);
  };

  // Reset
  const handleReset = async () => {
    await resetImport.mutateAsync();
    await refetchScan();
    setCurrentPage('setup');
    setPendingMatches([]);
    setCurrentPendingIdx(0);
    setImportedList([]);
    setSkippedList([]);
    setFailedList([]);
    setImportMode(null);
  };

  // MKV choice
  const handleMkvChoice = async (choice) => {
    if (rememberChoice) {
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ import_reencode_mkv: choice === 'include' ? 'true' : 'false' })
        });
      } catch (e) { console.error(e); }
    }
    setMkvChoice(choice);
  };

  // Drag/drop handlers
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const allFiles = Array.from(e.dataTransfer.files);
    const videoFiles = allFiles.filter(f => VIDEO_EXTENSIONS_REGEX.test(f.name));
    const unsupportedFiles = allFiles.filter(f => !VIDEO_EXTENSIONS_REGEX.test(f.name));

    if (videoFiles.length === 0 && unsupportedFiles.length > 0) {
      setRejectionError({ files: unsupportedFiles.map(f => f.name), countdown: 4 });
      return;
    }

    if (unsupportedFiles.length > 0) {
      showNotification(`${unsupportedFiles.length} file(s) skipped (unsupported)`, 'warning');
    }

    if (videoFiles.length === 0) return;

    const droppedFiles = videoFiles.filter(f => f.size <= MAX_FILE_SIZE);
    if (droppedFiles.length === 0) {
      showNotification('All files exceed 50GB limit', 'error');
      return;
    }

    const filesWithStatus = droppedFiles.map(f => ({ file: f, name: f.name, size: f.size, status: 'pending' }));
    setUploadFiles(filesWithStatus);
    setCurrentUploadIndex(0);
    setIsUploading(true);

    for (let i = 0; i < filesWithStatus.length; i++) {
      setCurrentUploadIndex(i);
      setCurrentUploadProgress(0);
      setUploadFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f));

      try {
        await uploadFile(filesWithStatus[i].file, p => setCurrentUploadProgress(p));
        setUploadFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'done' } : f));
      } catch (err) {
        setUploadFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error' } : f));
      }
    }

    setIsUploading(false);
    refetchScan();
  };

  const uploadFile = (file, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    xhr.upload.addEventListener('progress', e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { const r = JSON.parse(xhr.responseText); r.success ? resolve(r) : reject(new Error(r.error)); }
        catch { reject(new Error('Invalid response')); }
      } else { reject(new Error(`HTTP ${xhr.status}`)); }
    });
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.open('POST', '/api/import/upload');
    xhr.send(formData);
  });

  // Loading
  if (scanLoading) return <LoadingSpinner />;

  // ============================================================================
  // PROGRESS PAGE
  // ============================================================================
  if (currentPage === 'progress') {
    const currentPending = hasPendingMatches ? pendingMatches[currentPendingIdx] : null;

    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        {/* Results Modal */}
        {showResultsModal && (
          <ResultsDetailModal
            imported={importedList}
            skipped={skippedList}
            failed={failedList}
            onClose={() => setShowResultsModal(false)}
          />
        )}

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-text-primary">
            {isComplete ? 'Import Complete!' : 'Importing...'}
          </h1>
        </div>

        {/* ENCODING SECTION */}
        {isEncoding && (
          <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Encoding</h3>
              {encodeStatus.queue_count > 0 && (
                <span className="text-xs text-text-muted">{encodeStatus.queue_count + 1} total</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-accent border-t-transparent rounded-full" />
              <div className="flex-1">
                <div className="text-sm text-text-primary truncate mb-1">{encodeStatus.current?.filename}</div>
                <div className="h-2 bg-dark-tertiary rounded-full overflow-hidden">
                  <div className="h-full bg-accent transition-all" style={{ width: `${encodeStatus.progress}%` }} />
                </div>
              </div>
              <span className="text-sm text-text-muted">{encodeStatus.progress}%</span>
            </div>
          </div>
        )}

        {/* MATCHING SECTION */}
        <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Matching</h3>
            {hasPendingMatches && (
              <span className="text-xs text-text-muted">
                {pendingMatches.length - currentPendingIdx} remaining
              </span>
            )}
          </div>

          {hasPendingMatches ? (
            <>
              <div className="bg-dark-tertiary rounded-lg p-3 mb-3">
                <div className="text-text-primary font-medium truncate">{currentPending.filename}</div>
                {currentPending.local_duration && (
                  <div className="text-sm text-text-muted">Duration: {formatDuration(currentPending.local_duration)}</div>
                )}
              </div>

              <div className="text-sm text-text-secondary mb-2">Select the correct match:</div>
              <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
                {currentPending.matches?.map(video => (
                  <button
                    key={video.id}
                    onClick={() => setSelectedVideoId(video.id)}
                    className={`w-full text-left p-2 rounded-lg border transition-colors ${
                      selectedVideoId === video.id
                        ? 'border-accent bg-accent/10'
                        : 'border-dark-border bg-dark-tertiary hover:border-dark-border-light'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full border-2 ${
                        selectedVideoId === video.id ? 'border-accent bg-accent' : 'border-text-muted'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-text-primary text-sm truncate">{video.title}</div>
                        <div className="text-text-muted text-xs">
                          {formatDuration(video.duration)} - {video.channel_title}
                          {video.duration_match && (
                            <span className="ml-2 text-green-400">duration match</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={handleSkipMatch} disabled={isProcessing} className="btn btn-secondary flex-1 py-2">
                  Skip
                </button>
                <button
                  onClick={handleConfirmMatch}
                  disabled={!selectedVideoId || isProcessing}
                  className="btn btn-primary flex-1 py-2"
                >
                  {isProcessing ? 'Importing...' : 'Confirm'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 text-green-400">
              <CheckmarkIcon className="w-5 h-5" />
              <span>{isProcessing ? 'Processing...' : 'All files matched'}</span>
            </div>
          )}
        </div>

        {/* RESULTS SECTION - Clickable boxes */}
        <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Results</h3>
            <button
              onClick={() => setShowResultsModal(true)}
              className="text-xs text-accent-text hover:underline"
            >
              View Details
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setShowResultsModal(true)}
              className="text-center py-3 bg-dark-tertiary rounded-lg hover:bg-dark-tertiary/80 transition-colors"
            >
              <div className="text-2xl font-bold text-green-400">{importedList.length}</div>
              <div className="text-xs text-text-secondary">Imported</div>
            </button>
            <button
              onClick={() => setShowResultsModal(true)}
              className="text-center py-3 bg-dark-tertiary rounded-lg hover:bg-dark-tertiary/80 transition-colors"
            >
              <div className="text-2xl font-bold text-yellow-400">{skippedList.length}</div>
              <div className="text-xs text-text-secondary">Skipped</div>
            </button>
            <button
              onClick={() => setShowResultsModal(true)}
              className="text-center py-3 bg-dark-tertiary rounded-lg hover:bg-dark-tertiary/80 transition-colors"
            >
              <div className="text-2xl font-bold text-red-400">{failedList.length}</div>
              <div className="text-xs text-text-secondary">Failed</div>
            </button>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex gap-3">
          <button onClick={handleReset} className="btn btn-secondary flex-1">
            New Import
          </button>
          <button
            onClick={() => navigate('/library')}
            className={`btn flex-1 ${isComplete ? 'btn-primary' : 'btn-secondary'}`}
          >
            Go to Library
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // SETUP PAGE
  // ============================================================================
  const hasFiles = scanData?.count > 0;
  const hasSkippedMkv = scanData?.skipped_mkv?.length > 0;
  const totalFiles = (scanData?.count || 0) + (scanData?.skipped_mkv?.length || 0);

  // Empty - drag/drop zone (with upload overlay)
  if (!hasFiles && !hasSkippedMkv) {
    const uploadCompleted = uploadFiles.filter(f => f.status === 'done').length;
    const currentFile = isUploading ? uploadFiles[currentUploadIndex] : null;

    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center min-h-[60vh] text-center px-4 mx-4 my-4 border-2 border-dashed rounded-xl transition-all ${
          rejectionError ? 'border-red-500/50 bg-red-500/5' :
          isDragging ? 'border-accent bg-accent/10' : 'border-dark-border'
        }`}
      >
        {/* Upload progress overlay */}
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-primary/95 rounded-xl z-20">
            <div className="w-full max-w-sm text-center px-4">
              <div className="text-4xl font-mono font-bold text-text-primary mb-2">
                {uploadCompleted}<span className="text-text-muted">/{uploadFiles.length}</span>
              </div>
              <div className="text-sm text-text-muted mb-4">Uploading files...</div>
              {currentFile?.status === 'uploading' && (
                <div className="bg-dark-secondary border border-dark-border rounded-lg p-4">
                  <div className="text-text-primary truncate mb-2">{currentFile.name}</div>
                  <div className="h-2 bg-dark-tertiary rounded-full overflow-hidden">
                    <div className="h-full bg-accent transition-all" style={{ width: `${currentUploadProgress}%` }} />
                  </div>
                  <div className="text-xs text-text-muted mt-1">{currentUploadProgress}%</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rejection error overlay */}
        {rejectionError && !isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-primary/95 rounded-xl z-10">
            <div className="text-center">
              <div className="text-xl font-semibold text-red-400 mb-2">Unsupported format</div>
              <div className="text-text-muted text-sm mb-4">Supported: {allowedExtensions.join(', ')}</div>
            </div>
          </div>
        )}

        {/* Drag overlay */}
        {isDragging && !rejectionError && !isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-primary/90 rounded-xl z-10">
            <div className="text-xl font-semibold text-accent-text">Drop files to upload</div>
          </div>
        )}

        <svg className="w-16 h-16 text-text-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <h2 className="text-xl font-semibold text-text-primary mb-2">Drag and drop video files</h2>
        <p className="text-text-secondary mb-4">or copy files to:</p>
        <code className="bg-dark-tertiary px-4 py-2 rounded-lg text-accent-text font-mono mb-6">
          {scanData?.import_path || 'downloads/imports/'}
        </code>
        <button onClick={() => refetchScan()} className="btn btn-secondary">Refresh</button>
      </div>
    );
  }

  // Has files - show list and import options
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary mb-2">Import Videos</h1>
        <p className="text-text-secondary">
          Found <span className="text-accent-text font-semibold">{totalFiles}</span> video file{totalFiles !== 1 ? 's' : ''}
        </p>
      </div>

      {/* MKV Prompt */}
      {hasSkippedMkv && !mkvSettingEnabled && mkvChoice === null && (
        <MkvPromptCard
          mkvCount={scanData.skipped_mkv.length}
          onInclude={() => handleMkvChoice('include')}
          onSkip={() => handleMkvChoice('skip')}
          rememberChoice={rememberChoice}
          onRememberChange={setRememberChoice}
        />
      )}

      {/* File List */}
      <div className="bg-dark-secondary border border-dark-border rounded-lg overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-dark-border">
          <h3 className="font-semibold text-text-primary">Files</h3>
        </div>
        <div className="divide-y divide-dark-border max-h-64 overflow-y-auto">
          {scanData.files?.map((file, idx) => (
            <div key={`f-${idx}`} className="px-4 py-3">
              <div className="text-text-primary truncate">{file.name}</div>
              <div className="text-text-muted text-sm">{formatBytes(file.size)}</div>
            </div>
          ))}
          {scanData.skipped_mkv?.map((file, idx) => (
            <div key={`m-${idx}`} className="px-4 py-3">
              <div className="text-text-primary truncate">{file.name}</div>
              <div className="text-text-muted text-sm">
                {formatBytes(file.size)} <span className="text-yellow-400">- needs re-encoding</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Import Buttons */}
      {(() => {
        const mkvPending = hasSkippedMkv && !mkvSettingEnabled && mkvChoice === null;
        const buttonsDisabled = smartIdentify.isLoading || mkvPending;

        return (
          <>
            <div className="flex gap-4">
              <button
                onClick={() => handleStartImport('auto')}
                disabled={buttonsDisabled}
                className={`btn btn-primary flex-1 py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed ${mkvPending ? 'opacity-40' : ''}`}
              >
                Auto Import
              </button>
              <button
                onClick={() => handleStartImport('manual')}
                disabled={buttonsDisabled}
                className={`btn btn-secondary flex-1 py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed ${mkvPending ? 'opacity-40' : ''}`}
              >
                Manual Import
              </button>
            </div>

            {mkvPending ? (
              <p className="text-center text-yellow-400/80 text-sm mt-4">
                Choose what to do with MKV files above before importing
              </p>
            ) : (
              <p className="text-center text-text-muted text-sm mt-4">
                <strong>Auto:</strong> Imports confident matches automatically.{' '}
                <strong>Manual:</strong> Review matches before importing.
              </p>
            )}
          </>
        );
      })()}
    </div>
  );
}
