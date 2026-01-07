import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi } from '../services/api';
import { saveJobs, getJob as getOfflineJob, saveJob } from '../services/offlineStorage';
import type { Job, JobStatus, JobPriority } from '../types';

export function useJobs(params?: {
  page?: number;
  limit?: number;
  status?: JobStatus | JobStatus[];
  priority?: JobPriority | JobPriority[];
  search?: string;
}) {
  return useQuery({
    queryKey: ['jobs', params],
    queryFn: () => jobsApi.list(params),
    staleTime: 30000, // 30 seconds
  });
}

export function useMyJobs() {
  return useQuery({
    queryKey: ['jobs', 'my'],
    queryFn: async () => {
      const jobs = await jobsApi.getMyJobs();
      // Save to offline storage
      await saveJobs(jobs);
      return jobs;
    },
    staleTime: 30000,
  });
}

export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: ['jobs', id],
    queryFn: async () => {
      if (!id) throw new Error('Job ID required');

      try {
        const job = await jobsApi.getById(id);
        await saveJob(job);
        return job;
      } catch (error) {
        // Try offline fallback
        const offlineJob = await getOfflineJob(id);
        if (offlineJob) {
          return offlineJob;
        }
        throw error;
      }
    },
    enabled: !!id,
    staleTime: 30000,
  });
}

export function useJobStats(technicianId?: string) {
  return useQuery({
    queryKey: ['jobs', 'stats', technicianId],
    queryFn: () => jobsApi.getStats(technicianId),
    staleTime: 60000, // 1 minute
  });
}

export function useUpdateJobStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      jobId,
      status,
      location,
      note,
    }: {
      jobId: string;
      status: JobStatus;
      location?: { lat: number; lng: number };
      note?: string;
    }) => {
      return jobsApi.updateStatus(jobId, status, location, note);
    },
    onSuccess: (updatedJob) => {
      // Update cache
      queryClient.setQueryData(['jobs', updatedJob.id], updatedJob);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });

      // Save to offline storage
      saveJob(updatedJob);
    },
  });
}

export function useAssignJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, technicianId }: { jobId: string; technicianId: string }) => {
      return jobsApi.assign(jobId, technicianId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      locationId: string;
      title: string;
      description?: string;
      equipmentType?: string;
      equipmentId?: string;
      priority?: JobPriority;
      assignedToId?: string;
      scheduledFor?: string;
    }) => {
      return jobsApi.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useUploadPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, file, caption }: { jobId: string; file: File; caption?: string }) => {
      return jobsApi.uploadPhoto(jobId, file, caption);
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      return jobsApi.delete(jobId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}
