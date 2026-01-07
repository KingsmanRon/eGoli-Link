import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { AuthTokens, AuthResponse, ApiResponse, PaginatedResponse, Job, Location, MapLocation, PDFUpload, JobStats, GeocodeStats, User, JobStatus, JobPriority } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token management
let accessToken: string | null = localStorage.getItem('accessToken');

export function setTokens(tokens: AuthTokens) {
  accessToken = tokens.accessToken;
  localStorage.setItem('accessToken', tokens.accessToken);
  localStorage.setItem('refreshToken', tokens.refreshToken);
}

export function clearTokens() {
  accessToken = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

export function getAccessToken() {
  return accessToken || localStorage.getItem('accessToken');
}

// Request interceptor
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await axios.post<ApiResponse<AuthTokens>>(`${API_URL}/auth/refresh`, {
            refreshToken,
          });

          setTokens(response.data.data);
          originalRequest.headers.Authorization = `Bearer ${response.data.data.accessToken}`;
          return api(originalRequest);
        }
      } catch {
        clearTokens();
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    const response = await api.post<ApiResponse<AuthResponse>>('/auth/login', { email, password });
    setTokens({ accessToken: response.data.data.accessToken, refreshToken: response.data.data.refreshToken });
    return response.data.data;
  },

  logout: async () => {
    await api.post('/auth/logout');
    clearTokens();
  },

  getProfile: async (): Promise<User> => {
    const response = await api.get<ApiResponse<User>>('/auth/profile');
    return response.data.data;
  },

  updatePassword: async (currentPassword: string, newPassword: string) => {
    await api.put('/auth/password', { currentPassword, newPassword });
  },
};

// Jobs API
export const jobsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    status?: JobStatus | JobStatus[];
    priority?: JobPriority | JobPriority[];
    assignedToId?: string;
    search?: string;
  }): Promise<PaginatedResponse<Job>> => {
    const response = await api.get<PaginatedResponse<Job>>('/jobs', { params });
    return response.data;
  },

  getMyJobs: async (): Promise<Job[]> => {
    const response = await api.get<ApiResponse<Job[]>>('/jobs/my');
    return response.data.data;
  },

  getById: async (id: string): Promise<Job> => {
    const response = await api.get<ApiResponse<Job>>(`/jobs/${id}`);
    return response.data.data;
  },

  create: async (data: {
    locationId: string;
    title: string;
    description?: string;
    equipmentType?: string;
    equipmentId?: string;
    priority?: JobPriority;
    assignedToId?: string;
    scheduledFor?: string;
  }): Promise<Job> => {
    const response = await api.post<ApiResponse<Job>>('/jobs', data);
    return response.data.data;
  },

  update: async (id: string, data: Partial<Job>): Promise<Job> => {
    const response = await api.patch<ApiResponse<Job>>(`/jobs/${id}`, data);
    return response.data.data;
  },

  updateStatus: async (id: string, status: JobStatus, location?: { lat: number; lng: number }, note?: string): Promise<Job> => {
    const response = await api.patch<ApiResponse<Job>>(`/jobs/${id}/status`, {
      status,
      ...location,
      note,
    });
    return response.data.data;
  },

  assign: async (id: string, technicianId: string): Promise<Job> => {
    const response = await api.post<ApiResponse<Job>>(`/jobs/${id}/assign`, { technicianId });
    return response.data.data;
  },

  uploadPhoto: async (jobId: string, file: File, caption?: string): Promise<void> => {
    const formData = new FormData();
    formData.append('photo', file);
    if (caption) {
      formData.append('caption', caption);
    }
    await api.post(`/jobs/${jobId}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/jobs/${id}`);
  },

  getStats: async (technicianId?: string): Promise<JobStats> => {
    const response = await api.get<ApiResponse<JobStats>>('/jobs/stats', {
      params: technicianId ? { technicianId } : undefined,
    });
    return response.data.data;
  },
};

// Locations API
export const locationsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    geocoded?: boolean;
    township?: string;
    search?: string;
  }): Promise<PaginatedResponse<Location>> => {
    const response = await api.get<PaginatedResponse<Location>>('/locations', { params });
    return response.data;
  },

  getMapLocations: async (): Promise<MapLocation[]> => {
    const response = await api.get<ApiResponse<MapLocation[]>>('/locations/map');
    return response.data.data;
  },

  getUngeocode: async (): Promise<Location[]> => {
    const response = await api.get<ApiResponse<Location[]>>('/locations/ungeocode');
    return response.data.data;
  },

  getById: async (id: string): Promise<Location> => {
    const response = await api.get<ApiResponse<Location>>(`/locations/${id}`);
    return response.data.data;
  },

  updateCoordinates: async (id: string, lat: number, lng: number): Promise<Location> => {
    const response = await api.patch<ApiResponse<Location>>(`/locations/${id}`, { lat, lng });
    return response.data.data;
  },

  create: async (data: {
    standNo: string;
    township: string;
    address: string;
    lat?: number;
    lng?: number;
  }): Promise<Location> => {
    const response = await api.post<ApiResponse<Location>>('/locations', data);
    return response.data.data;
  },

  getStats: async (): Promise<GeocodeStats> => {
    const response = await api.get<ApiResponse<GeocodeStats>>('/locations/stats');
    return response.data.data;
  },

  getTownships: async (): Promise<Array<{ name: string; count: number }>> => {
    const response = await api.get<ApiResponse<Array<{ name: string; count: number }>>>('/locations/townships');
    return response.data.data;
  },
};

// PDF API
export const pdfApi = {
  upload: async (file: File): Promise<{ id: string; status: string }> => {
    const formData = new FormData();
    formData.append('pdf', file);
    const response = await api.post<ApiResponse<{ id: string; status: string }>>('/pdf/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  getStatus: async (id: string): Promise<PDFUpload> => {
    const response = await api.get<ApiResponse<PDFUpload>>(`/pdf/${id}/status`);
    return response.data.data;
  },

  list: async (page = 1, limit = 20): Promise<PaginatedResponse<PDFUpload>> => {
    const response = await api.get<PaginatedResponse<PDFUpload>>('/pdf', { params: { page, limit } });
    return response.data;
  },

  getLocations: async (id: string): Promise<{ pdf: Partial<PDFUpload>; locations: Location[] }> => {
    const response = await api.get<ApiResponse<{ pdf: Partial<PDFUpload>; locations: Location[] }>>(`/pdf/${id}/locations`);
    return response.data.data;
  },

  createJobs: async (pdfId: string, locationIds: string[], priority?: JobPriority, assignedToId?: string): Promise<{ created: number; jobs: Job[] }> => {
    const response = await api.post<ApiResponse<{ created: number; jobs: Job[] }>>(`/pdf/${pdfId}/create-jobs`, {
      locationIds,
      priority,
      assignedToId,
    });
    return response.data.data;
  },

  retryGeocoding: async (): Promise<{ processed: number; recovered: number }> => {
    const response = await api.post<ApiResponse<{ processed: number; recovered: number }>>('/pdf/geocode/retry');
    return response.data.data;
  },
};

export default api;
