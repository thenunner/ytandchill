// Shared formatting utilities

// Format file size in bytes to human-readable format
export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  const mb = bytes / (1024 * 1024);

  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  } else {
    return `${mb.toFixed(0)} MB`;
  }
};

// Format date from YYYYMMDD format to MM/DD/YYYY
export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return `${month}/${day}/${year}`;
};

// Format ISO datetime string to MM/DD/YYYY
export const formatDateTime = (dateTimeStr) => {
  if (!dateTimeStr) return '';
  const date = new Date(dateTimeStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};
