import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../contexts/NotificationContext';
import { getUserFriendlyError } from '../utils/utils';
import {
  useScanImportFolder,
  useImportState,
  useResetImport,
  useSmartIdentify,
  useExecuteSmartImport,
  useSettings,
  useEncodeStatus,
  useSkipPendingItem,
} from '../api/queries';
import { LoadingSpinner } from '../components/ListFeedback';
import { CheckmarkIcon } from '../components/Icons';
import { ImportResultsModal } from '../components/ui/DiscoverModals';

// Inline prompt card for MKV re-encoding decision
function MkvPromptCard({ mkvCount, onInclude, onSkip }) {
  return (
    <div className="bg-dark-secondary border-l-4 border-l-accent border border-dark-border rounded-lg p-3 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text-primary">
            {mkvCount} MKV file{mkvCount !== 1 ? 's' : ''} need re-encoding
          </div>
          <div className="text-xs text-text-secondary">
            Must be converted to MP4 for browser playback.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onInclude} className="btn btn-primary btn-sm">
            Re-encode
          </button>
          <button onClick={onSkip} className="btn btn-secondary btn-sm">
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

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
// MAIN COMPONENT
// ============================================================================
export default function Import() {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  // MKV choice (session only, always asks)
  const [mkvChoice, setMkvChoice] = useState(null);

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
  const skipPendingItem = useSkipPendingItem();

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
  const hasRestoredRef = useRef(false);

  // Derived state
  const isEncoding = encodeStatus?.encoding || false;
  const hasPendingMatches = pendingMatches.length > 0 && currentPendingIdx < pendingMatches.length;
  const isComplete = currentPage === 'progress' && !isEncoding && !hasPendingMatches && !isProcessing;

  // Track if we've shown the completion notification
  const hasShownCompleteRef = useRef(false);

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

  // Show import complete notification
  useEffect(() => {
    if (isComplete && !hasShownCompleteRef.current && importedList.length > 0) {
      hasShownCompleteRef.current = true;
      const total = importedList.length + skippedList.length + failedList.length;
      if (failedList.length > 0) {
        showNotification(`Import complete: ${importedList.length} imported, ${failedList.length} failed`, 'warning');
      } else if (skippedList.length > 0) {
        showNotification(`Import complete: ${importedList.length} imported, ${skippedList.length} skipped`, 'success');
      } else {
        showNotification(`Import complete: ${importedList.length} video${importedList.length !== 1 ? 's' : ''} imported`, 'success');
      }
    }
    // Reset flag when starting new import
    if (currentPage === 'setup') {
      hasShownCompleteRef.current = false;
    }
  }, [isComplete, importedList.length, skippedList.length, failedList.length, currentPage, showNotification]);

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

  // Restore progress page if there's active import state
  useEffect(() => {
    if (hasRestoredRef.current || !stateData) return;

    const hasPending = stateData.pending?.length > 0;
    const hasEncoding = encodeStatus?.encoding;
    const hasImported = stateData.imported?.length > 0;
    const hasFailed = stateData.failed?.length > 0;
    const hasSkipped = stateData.skipped?.length > 0;

    // If there's any active import state, restore to progress page
    if (hasPending || hasEncoding || hasImported || hasFailed || hasSkipped) {
      hasRestoredRef.current = true;
      setCurrentPage('progress');
      setPendingMatches(stateData.pending || []);
      setCurrentPendingIdx(0);
      setImportedList(stateData.imported || []);
      setSkippedList(stateData.skipped || []);
      setFailedList(stateData.failed || []);
    }
  }, [stateData, encodeStatus?.encoding]);

  // Start import
  const handleStartImport = async (mode) => {
    hasRestoredRef.current = true; // Prevent restoration from overwriting new import
    hasShownCompleteRef.current = false; // Reset completion notification flag
    setCurrentPage('progress');
    setImportMode(mode);
    setPendingMatches([]);
    setCurrentPendingIdx(0);
    setSelectedVideoId(null);
    setImportedList([]);
    setSkippedList([]);
    setFailedList([]);
    setIsProcessing(true);

    showNotification(`Starting ${mode === 'auto' ? 'auto' : 'manual'} import...`, 'info');

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
      showNotification(getUserFriendlyError(error.message, 'scan import folder'), 'error');
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
      showNotification('Video matched and imported', 'success');
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'import video'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Skip match
  const handleSkipMatch = async () => {
    const pending = pendingMatches[currentPendingIdx];
    try {
      await skipPendingItem.mutateAsync(pending.file);
      setSkippedList(prev => [...prev, { filename: pending.filename, reason: 'Skipped by user' }]);
      setCurrentPendingIdx(prev => prev + 1);
      setSelectedVideoId(null);
      showNotification('File skipped', 'info');
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'skip file'), 'error');
    }
  };

  // Reset
  const handleReset = async (force = false) => {
    await resetImport.mutateAsync({ force });
    setMkvChoice(null);  // Reset MKV choice so user gets prompted again
    await refetchScan();
    setCurrentPage('setup');
    setPendingMatches([]);
    setCurrentPendingIdx(0);
    setImportedList([]);
    setSkippedList([]);
    setFailedList([]);
    setImportMode(null);
    // Allow restoration to work again in future
    hasRestoredRef.current = false;
  };

  // MKV choice - session only
  const handleMkvChoice = (choice) => {
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

    // Show upload complete notification
    const successCount = filesWithStatus.filter((_, i) => i <= currentUploadIndex).length;
    const errorCount = filesWithStatus.filter(f => f.status === 'error').length;
    if (errorCount > 0) {
      showNotification(`Uploaded ${successCount - errorCount} files, ${errorCount} failed`, 'warning');
    } else {
      showNotification(`Uploaded ${successCount} file${successCount !== 1 ? 's' : ''}`, 'success');
    }
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
          <ImportResultsModal
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

              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-text-secondary">Select the correct match:</div>
                <div className="text-xs text-text-muted">
                  {currentPending.matches?.length} option{currentPending.matches?.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
                {currentPending.matches?.map((video, idx) => {
                  // Calculate confidence percentage from title_similarity (0.0 to 1.0)
                  const confidence = Math.round((video.title_similarity || 0) * 100);
                  const isSelected = selectedVideoId === video.id;
                  const isBestMatch = idx === 0;

                  // Color bands: green 90%+, amber 70-89%, slate <70%
                  const getConfidenceColor = (conf) => {
                    if (conf >= 90) return { badge: 'bg-green-500/20 text-green-400', bar: 'bg-green-500/60', border: 'border-green-500/30' };
                    if (conf >= 70) return { badge: 'bg-amber-500/20 text-amber-400', bar: 'bg-amber-500/60', border: 'border-amber-500/30' };
                    return { badge: 'bg-slate-500/20 text-slate-400', bar: 'bg-slate-500/60', border: 'border-slate-500/30' };
                  };
                  const colors = getConfidenceColor(confidence);

                  return (
                    <button
                      key={video.id}
                      onClick={() => setSelectedVideoId(video.id)}
                      className={`relative w-full text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? `${colors.border} bg-dark-tertiary ring-1 ring-accent/50`
                          : 'border-dark-border bg-dark-tertiary hover:border-dark-border-light'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Radio indicator */}
                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                          isSelected ? 'border-accent bg-accent' : 'border-text-muted'
                        }`} />

                        {/* Confidence badge */}
                        <div className={`px-2 py-0.5 rounded font-mono text-sm font-bold flex-shrink-0 ${colors.badge}`}>
                          {confidence}%
                        </div>

                        {/* Video info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-text-primary text-sm truncate">{video.title}</div>
                          <div className="flex items-center gap-2 text-text-muted text-xs mt-0.5">
                            <span>{formatDuration(video.duration)}</span>
                            <span className="text-text-muted/50">•</span>
                            <span className="truncate">{video.channel_title}</span>
                          </div>

                          {/* Badges row */}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {video.duration_match && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">
                                ✓ duration match
                              </span>
                            )}
                            {isBestMatch && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent-text font-medium">
                                ★ BEST MATCH
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Confidence bar at bottom */}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-dark-border/50 rounded-b-lg overflow-hidden">
                        <div className={`h-full transition-all ${colors.bar}`} style={{ width: `${confidence}%` }} />
                      </div>
                    </button>
                  );
                })}
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
        {(() => {
          const pendingCount = pendingMatches.length - currentPendingIdx;
          const importedCount = importedList.length;

          // Determine button state (priority order)
          const needsWarning = isEncoding || pendingCount > 0;
          const warningText = isEncoding
            ? 'Encoding will be cancelled'
            : pendingCount > 0
              ? `${pendingCount} pending match${pendingCount !== 1 ? 'es' : ''} will be lost`
              : null;
          const buttonText = needsWarning
            ? 'Cancel & Start New'
            : importedCount > 0
              ? 'Start New Import'
              : 'New Import';

          return (
            <div className="flex flex-col gap-1">
              <div className="flex gap-3">
                <button
                  onClick={() => handleReset(true)}
                  className={`btn flex-1 ${
                    needsWarning
                      ? 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 border border-amber-600/50'
                      : 'btn-secondary'
                  }`}
                >
                  {buttonText}
                </button>
                <button
                  onClick={() => navigate('/library')}
                  className={`btn flex-1 ${isComplete ? 'btn-primary' : 'btn-secondary'}`}
                >
                  Go to Library
                </button>
              </div>
              {warningText && (
                <span className="text-xs text-amber-400/70 text-center">
                  {warningText}
                </span>
              )}
            </div>
          );
        })()}
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
      {hasSkippedMkv && mkvChoice === null && (
        <MkvPromptCard
          mkvCount={scanData.skipped_mkv.length}
          onInclude={() => handleMkvChoice('include')}
          onSkip={() => handleMkvChoice('skip')}
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
