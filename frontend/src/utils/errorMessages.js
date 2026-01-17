/**
 * Maps technical error messages to user-friendly messages with actionable advice
 */
export function getUserFriendlyError(errorMessage) {
  if (!errorMessage) return 'An unknown error occurred';

  const lowerError = errorMessage.toLowerCase();

  // Rate limit issues
  if (lowerError.includes('rate limit')) {
    return 'YouTube rate limit detected. Wait a few minutes and try again, or refresh your cookies.';
  }

  // Cookie issues
  if (lowerError.includes('cookie') || lowerError.includes('sign in') || lowerError.includes('login required')) {
    return 'Cookie authentication failed. Re-export cookies.txt from your browser. See Settings → Cookies for instructions.';
  }

  // Geoblocking
  if (lowerError.includes('geoblocked') || lowerError.includes('not available in your country') || lowerError.includes('geo restricted')) {
    return 'This video is geoblocked in your region and cannot be downloaded.';
  }

  // Private/deleted videos
  if (lowerError.includes('private video') || lowerError.includes('video unavailable') || lowerError.includes('video not found') || lowerError.includes('removed')) {
    return 'This video is private, deleted, or unavailable.';
  }

  // Members-only content
  if (lowerError.includes('members only') || lowerError.includes('join this channel')) {
    return 'This video is members-only content and cannot be downloaded.';
  }

  // Age verification
  if (lowerError.includes('age') && lowerError.includes('verif')) {
    return 'This video requires age verification and cannot be downloaded without signing in.';
  }

  // Copyright
  if (lowerError.includes('copyright')) {
    return 'This video has been taken down due to copyright.';
  }

  // Network issues
  if (lowerError.includes('network') || lowerError.includes('connection') || lowerError.includes('timeout')) {
    return 'Network connection issue. Check your internet connection and try again.';
  }

  // 403 Forbidden
  if (lowerError.includes('403') || lowerError.includes('forbidden')) {
    return 'Access forbidden (403). This usually means YouTube rate limiting. Update your cookies.txt and wait 30-60 minutes before trying again.';
  }

  // Generic HTTP errors
  if (lowerError.includes('500') || lowerError.includes('internal server error')) {
    return 'YouTube server error (500). This is a temporary issue on YouTube\'s end. Please try again later.';
  }

  if (lowerError.includes('502') || lowerError.includes('503') || lowerError.includes('504')) {
    return 'YouTube is experiencing service issues. Please try again later.';
  }

  // SSL/Certificate errors
  if (lowerError.includes('ssl') || lowerError.includes('certificate')) {
    return 'SSL certificate error. Try updating yt-dlp: pip install --upgrade yt-dlp certifi';
  }

  // Channel not found
  if (lowerError.includes('channel') && (lowerError.includes('not found') || lowerError.includes('does not exist'))) {
    return 'Channel not found. Check the URL and try again.';
  }

  // Invalid URL
  if (lowerError.includes('invalid url') || lowerError.includes('could not resolve')) {
    return 'Invalid URL. Make sure you\'re using the correct channel URL format.';
  }

  // Fallback: return original error if no match
  return errorMessage;
}

/**
 * Formats a download worker log message for display in the queue
 */
export function formatQueueError(logMessage) {
  if (!logMessage) return null;

  const lowerLog = logMessage.toLowerCase();

  // Rate limit messages (show as-is, they're already user-friendly)
  if (lowerLog.includes('rate limit detected')) {
    return { message: logMessage, icon: '⏸️', type: 'warning' };
  }

  // Geoblocked
  if (lowerLog.includes('geoblocked') || lowerLog.includes('geo restricted')) {
    return { message: '❌ Video is geoblocked in your region', icon: '🌍', type: 'error' };
  }

  // Private/unavailable
  if (lowerLog.includes('private') || lowerLog.includes('unavailable')) {
    return { message: '❌ Video is private or unavailable', icon: '🔒', type: 'error' };
  }

  // Members-only
  if (lowerLog.includes('members only')) {
    return { message: '❌ Members-only content', icon: '⭐', type: 'error' };
  }

  // Age verification
  if (lowerLog.includes('age verification')) {
    return { message: '❌ Age verification required', icon: '🔞', type: 'error' };
  }

  // Copyright
  if (lowerLog.includes('copyright')) {
    return { message: '❌ Copyright takedown', icon: '⚖️', type: 'error' };
  }

  // Timeout
  if (lowerLog.includes('timeout')) {
    return { message: '⏱️ Download timed out', icon: '⏱️', type: 'warning' };
  }

  // Generic error
  return { message: logMessage, icon: '⚠️', type: 'error' };
}
