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

// Max file size (must match backend MAX_CONTENT_LENGTH)
const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50GB

// Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format duration from seconds
function formatDuration(seconds) {
  if (!seconds) return 'Unknown';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ============================================================================
// ENCODING SECTION - Shows MKV re-encoding progress
// ============================================================================
function EncodingSection({ encodeStatus }) {
  if (!encodeStatus?.encoding) return null;

  const { current, progress, queue_count } = encodeStatus;
  const totalInQueue = queue_count + 1; // Current + waiting
  const currentIndex = 1; // We're always on item 1

  return (
    <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Encoding
        </h3>
        {totalInQueue > 1 && (
          <span className="text-xs text-text-muted">
            {currentIndex} of {totalInQueue}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="animate-spin h-5 w-5 border-2 border-accent border-t-transparent rounded-full flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary truncate mb-2">
            {current?.filename || 'Processing...'}
          </div>
          <div className="h-2 bg-dark-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-text-muted">
              {progress}%
            </span>
            {queue_count > 0 && (
              <span className="text-xs text-text-muted">
                {queue_count} more in queue
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MATCHING SECTION - Shows pending files needing user input
// ============================================================================
function MatchingSection({
  pendingMatches,
  currentPendingIdx,
  selectedVideoId,
  onSelectVideo,
  onConfirm,
  onSkip,
  isImporting,
}) {
  // All matched - show success state
  if (pendingMatches.length === 0 || currentPendingIdx >= pendingMatches.length) {
    return (
      <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <CheckmarkIcon className="w-5 h-5 text-green-400" strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">All Matched</h3>
            <p className="text-xs text-text-muted">No manual selection needed</p>
          </div>
        </div>
      </div>
    );
  }

  const pending = pendingMatches[currentPendingIdx];
  const remaining = pendingMatches.length - currentPendingIdx;

  return (
    <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Needs Your Input
        </h3>
        <span className="text-xs text-text-muted">{remaining} remaining</span>
      </div>

      {/* Current file info */}
      <div className="bg-dark-tertiary rounded-lg p-3 mb-3">
        <div className="text-text-primary font-medium truncate">{pending.filename}</div>
        {pending.local_duration && (
          <div className="text-sm text-text-muted mt-1">
            Duration: {formatDuration(pending.local_duration)}
          </div>
        )}
      </div>

      {/* Question */}
      <div className="text-sm text-text-secondary mb-3">Which video is this?</div>

      {/* Options */}
      <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
        {pending.matches?.map((video) => (
          <button
            key={video.id}
            onClick={() => onSelectVideo(video.id)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              selectedVideoId === video.id
                ? 'border-accent bg-accent/10'
                : 'border-dark-border bg-dark-tertiary hover:border-dark-border-light'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                selectedVideoId === video.id ? 'border-accent bg-accent' : 'border-text-secondary'
              }`}>
                {selectedVideoId === video.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-text-primary text-sm truncate">{video.title}</div>
                <div className="text-text-muted text-xs flex items-center gap-2">
                  <span>{formatDuration(video.duration)}</span>
                  {video.duration_match && (
                    <span className="text-accent-text bg-accent/20 px-1 py-0.5 rounded text-[10px]">
                      Duration Match
                    </span>
                  )}
                  <span className="text-text-secondary">- {video.channel_title}</span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onSkip}
          disabled={isImporting}
          className="btn btn-secondary flex-1 py-2 text-sm disabled:opacity-50"
        >
          Skip
        </button>
        <button
          onClick={onConfirm}
          disabled={!selectedVideoId || isImporting}
          className="btn btn-primary flex-1 py-2 text-sm disabled:opacity-50"
        >
          {isImporting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
              Importing...
            </span>
          ) : 'Confirm Selection'}
        </button>
      </div>

      {/* More waiting indicator */}
      {remaining > 1 && (
        <div className="text-center text-xs text-text-muted mt-3">
          +{remaining - 1} more file{remaining - 1 !== 1 ? 's' : ''} waiting...
        </div>
      )}
    </div>
  );
}

// ============================================================================
// RESULTS SECTION - Shows live import stats
// ============================================================================
function ResultsSection({ imported, skipped, failed, onShowFailed }) {
  const importedCount = imported?.length || 0;
  const skippedCount = skipped?.length || 0;
  const failedCount = failed?.length || 0;

  return (
    <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Results
      </h3>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center py-3 bg-dark-tertiary rounded-lg">
          <div className="text-2xl font-bold text-green-400">{importedCount}</div>
          <div className="text-xs text-text-secondary">Imported</div>
        </div>
        <div className="text-center py-3 bg-dark-tertiary rounded-lg">
          <div className="text-2xl font-bold text-yellow-400">{skippedCount}</div>
          <div className="text-xs text-text-secondary">Skipped</div>
        </div>
        <div className="text-center py-3 bg-dark-tertiary rounded-lg">
          {failedCount > 0 ? (
            <button onClick={onShowFailed} className="w-full group">
              <div className="text-2xl font-bold text-red-400 group-hover:text-red-300">
                {failedCount}
              </div>
              <div className="text-xs text-text-secondary group-hover:text-text-primary underline decoration-dashed underline-offset-2">
                Failed
              </div>
            </button>
          ) : (
            <>
              <div className="text-2xl font-bold text-text-muted">0</div>
              <div className="text-xs text-text-secondary">Failed</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FAILED FILES MODAL
// ============================================================================
function FailedFilesModal({ failed, onClose }) {
  const grouped = {
    id_not_found: failed.filter(f => f.reason_code === 'id_not_found'),
    no_match: failed.filter(f => f.reason_code === 'no_match'),
    unsupported: failed.filter(f => f.reason_code === 'unsupported'),
    other: failed.filter(f => !['id_not_found', 'no_match', 'unsupported'].includes(f.reason_code)),
  };

  const generateCopyText = () => {
    let text = `IMPORT FAILURES (${failed.length} files)\n${'='.repeat(26)}\n\n`;
    failed.forEach(item => {
      text += `${item.filename} (${formatBytes(item.file_size || 0)})\n`;
      text += `  Status: ${getReasonLabel(item.reason_code)}\n`;
      text += `  Reason: ${item.reason}\n`;
      if (item.closest_match) {
        text += `  Closest: "${item.closest_match.title}"\n`;
        text += `  Video ID: ${item.closest_match.video_id}\n`;
      }
      text += '\n';
    });
    return text;
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(generateCopyText());
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getReasonLabel = (code) => {
    switch (code) {
      case 'id_not_found': return 'ID Not Found';
      case 'no_match': return 'No Match';
      case 'unsupported': return 'Unsupported';
      case 'no_results': return 'No Results';
      default: return 'Error';
    }
  };

  const getReasonColor = (code) => {
    switch (code) {
      case 'id_not_found': return 'text-orange-400';
      case 'no_match': return 'text-yellow-400';
      case 'unsupported': return 'text-red-400';
      default: return 'text-text-muted';
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-primary border border-dark-border rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-lg font-semibold text-text-primary">Failed Files ({failed.length})</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-2 bg-dark-secondary border-b border-dark-border flex gap-4 text-sm">
          {grouped.id_not_found.length > 0 && <span className="text-orange-400">ID Not Found: {grouped.id_not_found.length}</span>}
          {grouped.no_match.length > 0 && <span className="text-yellow-400">No Match: {grouped.no_match.length}</span>}
          {grouped.unsupported.length > 0 && <span className="text-red-400">Unsupported: {grouped.unsupported.length}</span>}
          {grouped.other.length > 0 && <span className="text-text-muted">Other: {grouped.other.length}</span>}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {failed.map((item, idx) => (
            <div key={idx} className="bg-dark-secondary border border-dark-border rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-text-primary font-medium truncate">{item.filename}</span>
                <span className="text-text-muted text-sm flex-shrink-0">{formatBytes(item.file_size || 0)}</span>
              </div>
              <div className={`text-sm font-medium ${getReasonColor(item.reason_code)}`}>
                {getReasonLabel(item.reason_code)}
              </div>
              <div className="text-sm text-text-muted mt-1">{item.reason}</div>
              {item.closest_match && (
                <div className="mt-2 bg-dark-tertiary rounded p-2 text-xs">
                  <div className="text-text-secondary font-medium mb-1">Closest Match</div>
                  <div className="text-text-primary truncate">{item.closest_match.title}</div>
                  <div className="text-text-muted mt-1">ID: {item.closest_match.video_id}</div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border">
          <button onClick={handleCopyAll} className="btn btn-secondary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy All
          </button>
          <button onClick={onClose} className="btn btn-primary">Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// MAIN IMPORT COMPONENT
// ============================================================================
export default function Import() {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  // MKV re-encode choice state
  const [mkvChoice, setMkvChoice] = useState(null);
  const [rememberChoice, setRememberChoice] = useState(false);

  // Queries
  const { data: scanData, isLoading: scanLoading, refetch: refetchScan } = useScanImportFolder(mkvChoice === 'include');
  const { data: stateData, refetch: refetchState } = useImportState();
  const { data: settings } = useSettings();

  // Dynamic extensions
  const mkvSettingEnabled = settings?.import_reencode_mkv === 'true';
  const reencodeMkv = mkvSettingEnabled || mkvChoice === 'include';
  const allowedExtensions = reencodeMkv ? ['.mkv', '.mp4', '.m4v', '.webm'] : ['.mp4', '.m4v', '.webm'];
  const VIDEO_EXTENSIONS_REGEX = reencodeMkv ? /\.(mp4|webm|m4v|mkv)$/i : /\.(mp4|webm|m4v)$/i;

  // Mutations
  const smartIdentify = useSmartIdentify();
  const executeSmartImport = useExecuteSmartImport();
  const resetImport = useResetImport();

  // === SIMPLIFIED STATE: 'setup' or 'progress' ===
  const [currentPage, setCurrentPage] = useState('setup');

  // Progress page state
  const [identifyResult, setIdentifyResult] = useState(null);
  const [pendingMatches, setPendingMatches] = useState([]);
  const [currentPendingIdx, setCurrentPendingIdx] = useState(0);
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showFailedModal, setShowFailedModal] = useState(false);
  const [importedFiles, setImportedFiles] = useState([]);
  const [skippedFiles, setSkippedFiles] = useState([]);

  // Encoding status - poll on progress page
  const { data: encodeStatus, refetch: refetchEncode } = useEncodeStatus(currentPage === 'progress');

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const [currentUploadProgress, setCurrentUploadProgress] = useState(0);
  const [rejectionError, setRejectionError] = useState(null);
  const rejectionTimerRef = useRef(null);

  // Check if import is complete
  const isComplete = currentPage === 'progress' &&
    (pendingMatches.length === 0 || currentPendingIdx >= pendingMatches.length) &&
    !encodeStatus?.encoding &&
    !isImporting;

  // Poll for state updates during progress
  useEffect(() => {
    if (currentPage === 'progress') {
      const interval = setInterval(() => {
        refetchState();
        refetchEncode();
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [currentPage, refetchState, refetchEncode]);

  // Update imported/skipped from state
  useEffect(() => {
    if (stateData) {
      setImportedFiles(stateData.imported || []);
      setSkippedFiles(stateData.skipped || []);
    }
  }, [stateData]);

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
      return () => {
        if (rejectionTimerRef.current) clearInterval(rejectionTimerRef.current);
      };
    }
  }, [rejectionError?.files]);

  // Start import - identifies and executes
  const handleStartImport = async (mode = 'auto') => {
    setCurrentPage('progress');
    setIdentifyResult(null);
    setPendingMatches([]);
    setCurrentPendingIdx(0);
    setSelectedVideoId(null);
    setImportedFiles([]);
    setSkippedFiles([]);

    try {
      // Step 1: Identify files
      const result = await smartIdentify.mutateAsync({ mode });
      setIdentifyResult(result);

      // Step 2: Execute auto-imports
      if (result.identified && result.identified.length > 0) {
        await executeSmartImport.mutateAsync(result.identified);
        await refetchState();
      }

      // Step 3: Set up pending for manual review
      if (result.pending && result.pending.length > 0) {
        setPendingMatches(result.pending);
        setCurrentPendingIdx(0);
      }

      // If nothing to review and no encoding, we're done
      if ((!result.pending || result.pending.length === 0) &&
          (!result.identified || result.identified.length === 0)) {
        showNotification('No videos could be identified', 'warning');
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
      setCurrentPage('setup');
    }
  };

  // Handle match selection
  const handleConfirmMatch = async () => {
    if (!selectedVideoId) {
      showNotification('Please select a video', 'error');
      return;
    }

    const pending = pendingMatches[currentPendingIdx];
    const selectedVideo = pending.matches.find(m => m.id === selectedVideoId);

    if (!selectedVideo) return;

    setIsImporting(true);
    try {
      const match = {
        file: pending.file,
        filename: pending.filename,
        video: selectedVideo,
        match_type: 'user_selected',
        channel_info: {
          channel_id: selectedVideo.channel_id,
          channel_title: selectedVideo.channel_title,
          channel_url: `https://youtube.com/channel/${selectedVideo.channel_id}`,
        },
      };

      await executeSmartImport.mutateAsync([match]);
      await refetchState();

      // Move to next
      setCurrentPendingIdx(prev => prev + 1);
      setSelectedVideoId(null);
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // Handle skip
  const handleSkipMatch = () => {
    const pending = pendingMatches[currentPendingIdx];
    setSkippedFiles(prev => [...prev, { file: pending.file, filename: pending.filename, reason: 'Skipped by user' }]);
    setCurrentPendingIdx(prev => prev + 1);
    setSelectedVideoId(null);
  };

  // Reset and start over
  const handleReset = async () => {
    await resetImport.mutateAsync();
    await refetchScan();
    setCurrentPage('setup');
    setIdentifyResult(null);
    setPendingMatches([]);
    setCurrentPendingIdx(0);
    setSelectedVideoId(null);
    setShowFailedModal(false);
    setImportedFiles([]);
    setSkippedFiles([]);
  };

  // Handle MKV choice
  const handleMkvChoice = async (choice) => {
    if (rememberChoice) {
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ import_reencode_mkv: choice === 'include' ? 'true' : 'false' })
        });
      } catch (error) {
        console.error('Failed to save MKV preference:', error);
      }
    }
    setMkvChoice(choice);
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
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
      showNotification(`${unsupportedFiles.length} file(s) skipped (unsupported format)`, 'warning');
    }

    if (videoFiles.length === 0) return;

    setRejectionError(null);

    const oversizedFiles = videoFiles.filter(f => f.size > MAX_FILE_SIZE);
    const droppedFiles = videoFiles.filter(f => f.size <= MAX_FILE_SIZE);

    if (oversizedFiles.length > 0) {
      showNotification(`${oversizedFiles.length} file(s) exceed 50GB limit`, 'warning');
    }

    if (droppedFiles.length === 0) {
      showNotification('All files exceed the 50GB size limit', 'error');
      return;
    }

    // Start upload
    const filesWithStatus = droppedFiles.map(f => ({
      file: f, name: f.name, size: f.size, status: 'pending', progress: 0,
    }));

    setUploadFiles(filesWithStatus);
    setCurrentUploadIndex(0);
    setCurrentUploadProgress(0);
    setIsUploading(true);

    for (let i = 0; i < filesWithStatus.length; i++) {
      setCurrentUploadIndex(i);
      setCurrentUploadProgress(0);
      setUploadFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f));

      try {
        await uploadFile(filesWithStatus[i].file, (progress) => setCurrentUploadProgress(progress));
        setUploadFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'done', progress: 100 } : f));
      } catch (err) {
        setUploadFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', error: err.message } : f));
      }
    }

    setIsUploading(false);
    showNotification('Upload complete', 'success');
    refetchScan();
  };

  const uploadFile = (file, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            response.success ? resolve(response) : reject(new Error(response.error || 'Upload failed'));
          } catch { reject(new Error('Invalid response')); }
        } else {
          try {
            const response = JSON.parse(xhr.responseText);
            reject(new Error(response.error || `HTTP ${xhr.status}`));
          } catch { reject(new Error(`HTTP ${xhr.status}`)); }
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
      xhr.open('POST', '/api/import/upload');
      xhr.send(formData);
    });
  };

  if (scanLoading) {
    return <LoadingSpinner />;
  }

  // ============================================================================
  // UPLOAD PROGRESS VIEW
  // ============================================================================
  if (isUploading) {
    const completed = uploadFiles.filter(f => f.status === 'done').length;
    const total = uploadFiles.length;
    const totalBytes = uploadFiles.reduce((sum, f) => sum + f.size, 0);
    const completedBytes = uploadFiles.reduce((sum, f, idx) => {
      if (f.status === 'done') return sum + f.size;
      if (f.status === 'uploading') return sum + (f.size * currentUploadProgress / 100);
      return sum;
    }, 0);
    const overallPercent = Math.round((completedBytes / totalBytes) * 100);
    const currentFile = uploadFiles[currentUploadIndex];

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-4xl font-mono font-bold text-text-primary mb-1">
              {completed}<span className="text-text-muted">/{total}</span>
            </div>
            <div className="text-sm text-text-secondary">
              {formatBytes(completedBytes)} of {formatBytes(totalBytes)}
            </div>
          </div>
          <div className="h-1 bg-dark-tertiary rounded-full mb-8 overflow-hidden">
            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${overallPercent}%` }} />
          </div>
          {currentFile?.status === 'uploading' && (
            <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-accent-text uppercase">Uploading</span>
                <span className="text-xs font-mono text-text-muted">{currentUploadProgress}%</span>
              </div>
              <div className="text-text-primary font-medium truncate mb-3">{currentFile.name}</div>
              <div className="h-2 bg-dark-tertiary rounded-full overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${currentUploadProgress}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // PAGE 2: PROGRESS PAGE - All sections visible together
  // ============================================================================
  if (currentPage === 'progress') {
    const failed = identifyResult?.failed || [];

    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        {/* Failed Files Modal */}
        {showFailedModal && failed.length > 0 && (
          <FailedFilesModal failed={failed} onClose={() => setShowFailedModal(false)} />
        )}

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-text-primary">
            {isComplete ? 'Import Complete!' : 'Import Progress'}
          </h1>
          {isComplete && (
            <p className="text-text-secondary mt-2">Your videos have been imported to the library</p>
          )}
        </div>

        {/* ENCODING SECTION - Only shows when encoding */}
        <EncodingSection encodeStatus={encodeStatus} />

        {/* MATCHING SECTION - Always visible */}
        <MatchingSection
          pendingMatches={pendingMatches}
          currentPendingIdx={currentPendingIdx}
          selectedVideoId={selectedVideoId}
          onSelectVideo={setSelectedVideoId}
          onConfirm={handleConfirmMatch}
          onSkip={handleSkipMatch}
          isImporting={isImporting}
        />

        {/* RESULTS SECTION - Always visible */}
        <ResultsSection
          imported={importedFiles}
          skipped={skippedFiles}
          failed={failed}
          onShowFailed={() => setShowFailedModal(true)}
        />

        {/* ACTION BUTTONS */}
        <div className="flex gap-3 mt-6">
          <button onClick={handleReset} className="btn btn-secondary flex-1">
            Start New Import
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
  // PAGE 1: SETUP PAGE - Drag/drop (if empty) OR file list + buttons
  // ============================================================================

  const hasFiles = scanData?.count > 0;
  const hasSkippedMkv = scanData?.skipped_mkv?.length > 0;
  const showMkvPrompt = hasSkippedMkv && !mkvSettingEnabled && mkvChoice === null;

  // Empty state - show drag/drop zone ONLY if no files AND no skipped MKVs
  if (!hasFiles && !hasSkippedMkv) {
    return (
      <div className="flex flex-col">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center min-h-[60vh] text-center px-4 mx-4 my-4 border-2 border-dashed rounded-xl transition-all duration-200 ${
            rejectionError ? 'border-red-500/50 bg-red-500/5' :
            isDragging ? 'border-accent bg-accent/10 scale-[1.02]' : 'border-dark-border hover:border-dark-border-light'
          }`}
        >
          {/* Rejection error overlay */}
          {rejectionError && (
            <div className="absolute inset-0 flex items-center justify-center bg-dark-primary/95 rounded-xl z-10">
              <div className="text-center max-w-sm px-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div className="text-xl font-semibold text-red-400 mb-3">Unsupported file format</div>
                <div className="text-text-secondary mb-4 text-sm">
                  {rejectionError.files.slice(0, 3).map((name, i) => <div key={i} className="truncate">{name}</div>)}
                  {rejectionError.files.length > 3 && <div className="text-text-muted">+{rejectionError.files.length - 3} more</div>}
                </div>
                <div className="text-sm text-text-muted mb-6">
                  Supported: <span className="text-text-secondary">{allowedExtensions.join(', ')}</span>
                </div>
                <div className="w-48 mx-auto h-1 bg-dark-tertiary rounded-full overflow-hidden">
                  <div className="h-full bg-red-500/50 transition-all duration-1000" style={{ width: `${(rejectionError.countdown / 4) * 100}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Drag overlay */}
          {isDragging && !rejectionError && (
            <div className="absolute inset-0 flex items-center justify-center bg-dark-primary/90 rounded-xl z-10">
              <div className="text-center">
                <svg className="w-16 h-16 text-accent mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <div className="text-xl font-semibold text-accent-text">Drop files to upload</div>
                <div className="text-sm text-text-secondary mt-2">{allowedExtensions.join(', ')} (max 50 GB)</div>
              </div>
            </div>
          )}

          <svg className="w-16 h-16 text-text-muted mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <h2 className="text-xl font-semibold text-text-primary mb-2">Drag and drop video files</h2>
          <p className="text-text-secondary mb-4">or copy files to:</p>
          <code className="bg-dark-tertiary px-4 py-2 rounded-lg text-accent-text font-mono mb-6">
            {scanData?.import_path || 'downloads/imports/'}
          </code>
          <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 max-w-xl">
            <p className="text-text-secondary text-sm mb-3"><strong>File naming tips:</strong></p>
            <pre className="bg-dark-tertiary rounded p-3 text-left text-sm font-mono text-text-muted">
{`dQw4w9WgXcQ.mp4      <- YouTube video ID (instant match)
My Video Title.mp4   <- Exact video title (searches YouTube)`}
            </pre>
          </div>
          <button onClick={() => refetchScan()} className="mt-6 btn btn-secondary">Refresh</button>
        </div>
      </div>
    );
  }

  // Files found - show file list + MKV prompt + import buttons
  const totalFileCount = (scanData?.count || 0) + (scanData?.skipped_mkv?.length || 0);

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary mb-2">Import Videos</h1>
        <p className="text-text-secondary">
          Found <span className="text-accent-text font-semibold">{totalFileCount}</span> video file{totalFileCount !== 1 ? 's' : ''} to import
        </p>
      </div>

      {/* MKV Prompt */}
      {scanData?.skipped_mkv?.length > 0 && !mkvSettingEnabled && mkvChoice === null && (
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
          {/* Regular video files */}
          {scanData.files?.slice(0, 20).map((file, idx) => (
            <div key={`file-${idx}`} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-text-primary truncate">{file.name}</div>
                <div className="text-text-muted text-sm">{formatBytes(file.size)}</div>
              </div>
            </div>
          ))}
          {/* Skipped MKV files (shown with indicator) */}
          {scanData.skipped_mkv?.slice(0, 20 - (scanData.files?.length || 0)).map((file, idx) => (
            <div key={`mkv-${idx}`} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-text-primary truncate">{file.name}</div>
                <div className="text-text-muted text-sm flex items-center gap-2">
                  {formatBytes(file.size)}
                  <span className="text-yellow-400 text-xs">needs re-encoding</span>
                </div>
              </div>
            </div>
          ))}
          {totalFileCount > 20 && (
            <div className="px-4 py-3 text-center text-text-muted text-sm">
              ...and {totalFileCount - 20} more files
            </div>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="bg-dark-tertiary border border-dark-border rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-text-primary mb-2">How Smart Import Works</h3>
        <ul className="text-sm text-text-secondary space-y-1">
          <li>Files named with video ID (11 chars) are matched instantly</li>
          <li>Other files are searched on YouTube by title</li>
          <li>Duration + channel from channels.txt used to verify matches</li>
        </ul>
      </div>

      {/* Import Buttons */}
      <div className="flex gap-4">
        <button
          onClick={() => handleStartImport('auto')}
          disabled={smartIdentify.isLoading}
          className="btn btn-primary flex-1 py-3 text-lg disabled:opacity-50"
        >
          {smartIdentify.isLoading ? 'Starting...' : 'Auto Import'}
        </button>
        <button
          onClick={() => handleStartImport('manual')}
          disabled={smartIdentify.isLoading}
          className="btn btn-secondary flex-1 py-3 text-lg disabled:opacity-50"
        >
          Manual Import
        </button>
      </div>

      <p className="text-center text-text-muted text-sm mt-4">
        <strong>Auto:</strong> Imports confident matches (title + duration).{' '}
        <strong>Manual:</strong> Review every match before importing.
      </p>
    </div>
  );
}
