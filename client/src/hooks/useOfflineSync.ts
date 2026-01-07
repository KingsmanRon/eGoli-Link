import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  fullSync,
  isOnline,
  setupConnectivityListener,
  syncPendingUploads,
} from '../services/syncManager';
import { getOfflineStatus, addPendingUpload } from '../services/offlineStorage';
import type { JobStatus } from '../types';

interface OfflineSyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSync: Date | null;
  pendingCount: number;
  error: string | null;
}

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<OfflineSyncState>({
    isOnline: isOnline(),
    isSyncing: false,
    lastSync: null,
    pendingCount: 0,
    error: null,
  });

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    const status = await getOfflineStatus();
    setState((prev) => ({
      ...prev,
      pendingCount: status.pendingUploads + status.syncQueueSize,
    }));
  }, []);

  // Manual sync
  const sync = useCallback(async () => {
    if (!isOnline()) {
      setState((prev) => ({ ...prev, error: 'No internet connection' }));
      return;
    }

    setState((prev) => ({ ...prev, isSyncing: true, error: null }));

    try {
      const result = await fullSync();

      setState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSync: new Date(),
        error: result.upload.failed > 0 ? `${result.upload.failed} uploads failed` : null,
      }));

      // Refresh queries
      queryClient.invalidateQueries();
      await updatePendingCount();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      }));
    }
  }, [queryClient, updatePendingCount]);

  // Queue status update for offline sync
  const queueStatusUpdate = useCallback(
    async (jobId: string, status: JobStatus, lat?: number, lng?: number, note?: string) => {
      await addPendingUpload('status_update', jobId, { jobId, status, lat, lng, note });
      await updatePendingCount();
    },
    [updatePendingCount]
  );

  // Queue photo upload for offline sync
  const queuePhotoUpload = useCallback(
    async (jobId: string, file: Blob, caption?: string) => {
      await addPendingUpload('photo', jobId, { jobId, file, caption });
      await updatePendingCount();
    },
    [updatePendingCount]
  );

  // Listen for connectivity changes
  useEffect(() => {
    const cleanup = setupConnectivityListener(
      async () => {
        setState((prev) => ({ ...prev, isOnline: true }));
        // Auto-sync when coming online
        await syncPendingUploads();
        await updatePendingCount();
      },
      () => {
        setState((prev) => ({ ...prev, isOnline: false }));
      }
    );

    return cleanup;
  }, [updatePendingCount]);

  // Initial pending count
  useEffect(() => {
    updatePendingCount();
  }, [updatePendingCount]);

  return {
    ...state,
    sync,
    queueStatusUpdate,
    queuePhotoUpload,
    updatePendingCount,
  };
}
