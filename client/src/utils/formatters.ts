import type { JobStatus, JobPriority } from '../types';

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

export function getStatusColor(status: JobStatus): string {
  switch (status) {
    case 'PENDING':
      return 'bg-gray-100 text-gray-800';
    case 'ASSIGNED':
      return 'bg-blue-100 text-blue-800';
    case 'EN_ROUTE':
      return 'bg-yellow-100 text-yellow-800';
    case 'ON_SITE':
      return 'bg-purple-100 text-purple-800';
    case 'COMPLETED':
      return 'bg-green-100 text-green-800';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getStatusLabel(status: JobStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'ASSIGNED':
      return 'Assigned';
    case 'EN_ROUTE':
      return 'En Route';
    case 'ON_SITE':
      return 'On Site';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

export function getPriorityColor(priority: JobPriority): string {
  switch (priority) {
    case 'URGENT':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'HIGH':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'NORMAL':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'LOW':
      return 'bg-gray-100 text-gray-600 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

export function getPriorityLabel(priority: JobPriority): string {
  switch (priority) {
    case 'URGENT':
      return 'Urgent';
    case 'HIGH':
      return 'High';
    case 'NORMAL':
      return 'Normal';
    case 'LOW':
      return 'Low';
    default:
      return priority;
  }
}

export function getMarkerColor(priority: JobPriority): string {
  switch (priority) {
    case 'URGENT':
      return '#ef4444'; // red-500
    case 'HIGH':
      return '#f97316'; // orange-500
    case 'NORMAL':
      return '#3b82f6'; // blue-500
    case 'LOW':
      return '#6b7280'; // gray-500
    default:
      return '#3b82f6';
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}
