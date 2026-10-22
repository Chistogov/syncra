export function formatBytes(bytes?: number, decimals = 2): string {
  if (bytes === undefined || bytes === null || bytes < 0) return '-';
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDate(dateString?: string): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return dateString;
  }
}

export function formatSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  const k = 1024;
  if (bytesPerSec < k) {
    return `${Math.round(bytesPerSec)} B/s`;
  }
  if (bytesPerSec < k * k) {
    return `${(bytesPerSec / k).toFixed(2)} KB/s`;
  }
  if (bytesPerSec < k * k * k) {
    return `${(bytesPerSec / (k * k)).toFixed(2)} MB/s`;
  }
  return `${(bytesPerSec / (k * k * k)).toFixed(2)} GB/s`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--:--:--';
  const days = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (days > 0) {
    return `${days}:${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatUptimeHuman(seconds?: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return 'n/a';
  const days = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} дн. ${hrs} ч.`;
  if (hrs > 0) return `${hrs} ч. ${mins} мин.`;
  return `${mins} мин.`;
}

export function formatCompactNumber(num?: number): string {
  if (num === undefined || num === null) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString('ru-RU');
}
