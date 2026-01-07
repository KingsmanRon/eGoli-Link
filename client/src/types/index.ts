export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'TECHNICIAN';
export type JobStatus = 'PENDING' | 'ASSIGNED' | 'EN_ROUTE' | 'ON_SITE' | 'COMPLETED' | 'CANCELLED';
export type JobPriority = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
export type ExtractionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
}

export interface Location {
  id: string;
  standNo: string;
  township: string;
  address: string;
  normalizedAddress?: string;
  lat?: number;
  lng?: number;
  geocoded: boolean;
  geocodeFailed: boolean;
  geocodeSource?: string;
}

export interface Job {
  id: string;
  locationId: string;
  location: Location;
  status: JobStatus;
  priority: JobPriority;
  title: string;
  description?: string;
  equipmentType?: string;
  equipmentId?: string;
  assignedToId?: string;
  assignedTo?: Pick<User, 'id' | 'name' | 'email'>;
  createdById: string;
  createdBy: Pick<User, 'id' | 'name'>;
  pdfSourceId?: string;
  scheduledFor?: string;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  photos?: Photo[];
  _count?: {
    photos: number;
  };
}

export interface Photo {
  id: string;
  jobId: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  caption?: string;
  takenAt: string;
}

export interface PDFUpload {
  id: string;
  filename: string;
  originalName: string;
  url: string;
  substationName?: string;
  drawingNumber?: string;
  extractionStatus: ExtractionStatus;
  extractedCount: number;
  errorMessage?: string;
  createdAt: string;
  processedAt?: string;
}

export interface JobStatusHistory {
  id: string;
  jobId: string;
  fromStatus?: JobStatus;
  toStatus: JobStatus;
  changedById?: string;
  lat?: number;
  lng?: number;
  note?: string;
  createdAt: string;
}

export interface MapLocation extends Location {
  jobs: Array<{
    id: string;
    title: string;
    status: JobStatus;
    priority: JobPriority;
  }>;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface JobStats {
  byStatus: Record<JobStatus, number>;
  byPriority: Record<JobPriority, number>;
  completedToday: number;
}

export interface GeocodeStats {
  total: number;
  geocoded: number;
  pending: number;
  failed: number;
  sources: Record<string, number>;
}
