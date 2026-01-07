import { jobsApi, locationsApi } from './api';
import {
  saveJobs,
  saveLocations,
  getAllJobs,
  getPendingUploads,
  removePendingUpload,
  incrementRetryCount,
  getSyncQueue,
  removeFromSyncQueue,
} from './offlineStorage';
import type { Job, JobStatus } from '../types';

const MAX_RETRIES = 3;

interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

// Check if online
export function isOnline(): boolean {
  return navigator.onLine;
}

// Sync jobs from server to local storage
export async function syncJobsFromServer(): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] };

  try {
    const response = await jobsApi.getMyJobs();
    await saveJobs(response);
    result.synced = response.length;
  } catch (error) {
    result.success = false;
    result.failed = 1;
    result.errors.push(error instanceof Error ? error.message : 'Failed to sync jobs');
  }

  return result;
}

// Sync locations from server to local storage
export async function syncLocationsFromServer(): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] };

  try {
    const locations = await locationsApi.getMapLocations();
    await saveLocations(locations);
    result.synced = locations.length;
  } catch (error) {
    result.success = false;
    result.failed = 1;
    result.errors.push(error instanceof Error ? error.message : 'Failed to sync locations');
  }

  return result;
}

// Sync pending uploads to server
export async function syncPendingUploads(): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] };

  if (!isOnline()) {
    return result;
  }

  const pendingUploads = await getPendingUploads();

  for (const upload of pendingUploads) {
    if (upload.retryCount >= MAX_RETRIES) {
      result.failed++;
      result.errors.push(`Upload ${upload.id} exceeded max retries`);
      continue;
    }

    try {
      if (upload.type === 'status_update') {
        const payload = upload.payload as {
          jobId: string;
          status: JobStatus;
          lat?: number;
          lng?: number;
          note?: string;
        };

        await jobsApi.updateStatus(
          payload.jobId,
          payload.status,
          payload.lat && payload.lng ? { lat: payload.lat, lng: payload.lng } : undefined,
          payload.note
        );
      } else if (upload.type === 'photo') {
        const payload = upload.payload as {
          jobId: string;
          file: Blob;
          caption?: string;
        };

        const file = new File([payload.file], 'photo.jpg', { type: 'image/jpeg' });
        await jobsApi.uploadPhoto(payload.jobId, file, payload.caption);
      }

      await removePendingUpload(upload.id);
      result.synced++;
    } catch (error) {
      await incrementRetryCount(upload.id);
      result.failed++;
      result.errors.push(error instanceof Error ? error.message : 'Upload failed');
    }
  }

  return result;
}

// Process sync queue
export async function processSyncQueue(): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] };

  if (!isOnline()) {
    return result;
  }

  const queue = await getSyncQueue();

  for (const item of queue) {
    if (item.retryCount >= MAX_RETRIES) {
      result.failed++;
      continue;
    }

    try {
      // Process based on action and entity type
      if (item.action === 'update' && item.entity === 'status') {
        const data = item.data as { jobId: string; status: JobStatus };
        await jobsApi.updateStatus(data.jobId, data.status);
      }

      await removeFromSyncQueue(item.id);
      result.synced++;
    } catch (error) {
      result.failed++;
      result.errors.push(error instanceof Error ? error.message : 'Sync failed');
    }
  }

  return result;
}

// Full sync - downloads new data and uploads pending changes
export async function fullSync(): Promise<{
  download: SyncResult;
  upload: SyncResult;
}> {
  const [jobsResult, locationsResult, uploadResult] = await Promise.all([
    syncJobsFromServer(),
    syncLocationsFromServer(),
    syncPendingUploads(),
  ]);

  await processSyncQueue();

  return {
    download: {
      success: jobsResult.success && locationsResult.success,
      synced: jobsResult.synced + locationsResult.synced,
      failed: jobsResult.failed + locationsResult.failed,
      errors: [...jobsResult.errors, ...locationsResult.errors],
    },
    upload: uploadResult,
  };
}

// Get jobs - try online first, fallback to offline
export async function getJobsWithFallback(): Promise<{ jobs: Job[]; isOffline: boolean }> {
  if (isOnline()) {
    try {
      const jobs = await jobsApi.getMyJobs();
      await saveJobs(jobs);
      return { jobs, isOffline: false };
    } catch {
      // Fallback to offline
    }
  }

  const offlineJobs = await getAllJobs();
  return { jobs: offlineJobs, isOffline: true };
}

// Listen for online/offline events
export function setupConnectivityListener(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  const handleOnline = () => {
    console.log('Connection restored');
    onOnline();
  };

  const handleOffline = () => {
    console.log('Connection lost');
    onOffline();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// Background sync registration
export async function registerBackgroundSync(): Promise<void> {
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register('sync-data');
    } catch (error) {
      console.error('Background sync registration failed:', error);
    }
  }
}
