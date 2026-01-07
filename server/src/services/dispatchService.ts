import { prisma, JobStatus, JobPriority, Prisma } from '../models/index.js';
import { logger } from '../utils/logger.js';

export interface CreateJobInput {
  locationId: string;
  title: string;
  description?: string;
  equipmentType?: string;
  equipmentId?: string;
  priority?: JobPriority;
  assignedToId?: string;
  scheduledFor?: Date;
  pdfSourceId?: string;
  createdById: string;
}

export interface JobFilters {
  status?: JobStatus | JobStatus[];
  priority?: JobPriority | JobPriority[];
  assignedToId?: string;
  createdById?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  geocoded?: boolean;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Create a new job
 */
export async function createJob(input: CreateJobInput) {
  const job = await prisma.job.create({
    data: {
      locationId: input.locationId,
      title: input.title,
      description: input.description,
      equipmentType: input.equipmentType,
      equipmentId: input.equipmentId,
      priority: input.priority || JobPriority.NORMAL,
      assignedToId: input.assignedToId,
      scheduledFor: input.scheduledFor,
      pdfSourceId: input.pdfSourceId,
      createdById: input.createdById,
      status: input.assignedToId ? JobStatus.ASSIGNED : JobStatus.PENDING,
    },
    include: {
      location: true,
      assignedTo: {
        select: { id: true, name: true, email: true },
      },
      createdBy: {
        select: { id: true, name: true },
      },
    },
  });

  // Create initial status history
  await prisma.jobStatusHistory.create({
    data: {
      jobId: job.id,
      toStatus: job.status,
      changedById: input.createdById,
    },
  });

  logger.info({ jobId: job.id, title: job.title }, 'Job created');

  return job;
}

/**
 * Update job status with location tracking
 */
export async function updateJobStatus(
  jobId: string,
  newStatus: JobStatus,
  userId: string,
  location?: { lat: number; lng: number },
  note?: string
) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { status: true },
  });

  if (!job) {
    throw new Error('Job not found');
  }

  const updateData: Prisma.JobUpdateInput = {
    status: newStatus,
  };

  // Set timestamps based on status
  if (newStatus === JobStatus.EN_ROUTE || newStatus === JobStatus.ON_SITE) {
    if (!job.status || job.status === JobStatus.PENDING || job.status === JobStatus.ASSIGNED) {
      updateData.startedAt = new Date();
    }
  } else if (newStatus === JobStatus.COMPLETED) {
    updateData.completedAt = new Date();
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: updateData,
    include: {
      location: true,
      assignedTo: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Record status change
  await prisma.jobStatusHistory.create({
    data: {
      jobId,
      fromStatus: job.status,
      toStatus: newStatus,
      changedById: userId,
      lat: location?.lat,
      lng: location?.lng,
      note,
    },
  });

  logger.info(
    { jobId, fromStatus: job.status, toStatus: newStatus, userId },
    'Job status updated'
  );

  return updated;
}

/**
 * Assign job to technician
 */
export async function assignJob(
  jobId: string,
  technicianId: string,
  assignedBy: string
) {
  const job = await prisma.job.update({
    where: { id: jobId },
    data: {
      assignedToId: technicianId,
      status: JobStatus.ASSIGNED,
    },
    include: {
      location: true,
      assignedTo: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Record assignment
  await prisma.jobStatusHistory.create({
    data: {
      jobId,
      toStatus: JobStatus.ASSIGNED,
      changedById: assignedBy,
      note: `Assigned to ${job.assignedTo?.name}`,
    },
  });

  logger.info({ jobId, technicianId, assignedBy }, 'Job assigned');

  return job;
}

/**
 * Get jobs with filters and pagination
 */
export async function getJobs(
  filters: JobFilters,
  pagination: PaginationOptions
) {
  const where: Prisma.JobWhereInput = {};

  // Status filter
  if (filters.status) {
    where.status = Array.isArray(filters.status)
      ? { in: filters.status }
      : filters.status;
  }

  // Priority filter
  if (filters.priority) {
    where.priority = Array.isArray(filters.priority)
      ? { in: filters.priority }
      : filters.priority;
  }

  // User filters
  if (filters.assignedToId) {
    where.assignedToId = filters.assignedToId;
  }
  if (filters.createdById) {
    where.createdById = filters.createdById;
  }

  // Date range
  if (filters.startDate || filters.endDate) {
    where.scheduledFor = {};
    if (filters.startDate) {
      where.scheduledFor.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.scheduledFor.lte = filters.endDate;
    }
  }

  // Search
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
      { equipmentId: { contains: filters.search, mode: 'insensitive' } },
      { location: { address: { contains: filters.search, mode: 'insensitive' } } },
      { location: { township: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }

  // Geocoded filter
  if (typeof filters.geocoded === 'boolean') {
    where.location = {
      geocoded: filters.geocoded,
    };
  }

  // Pagination
  const skip = (pagination.page - 1) * pagination.limit;
  const take = pagination.limit;

  // Sorting
  const orderBy: Prisma.JobOrderByWithRelationInput = {};
  const sortField = pagination.sortBy || 'createdAt';
  const sortOrder = pagination.sortOrder || 'desc';

  if (sortField === 'priority') {
    // Custom priority ordering
    orderBy.priority = sortOrder;
  } else if (sortField === 'location') {
    orderBy.location = { township: sortOrder };
  } else {
    (orderBy as Record<string, string>)[sortField] = sortOrder;
  }

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        location: true,
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        createdBy: {
          select: { id: true, name: true },
        },
        _count: {
          select: { photos: true },
        },
      },
    }),
    prisma.job.count({ where }),
  ]);

  return {
    jobs,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
}

/**
 * Get job by ID with full details
 */
export async function getJobById(jobId: string) {
  return prisma.job.findUnique({
    where: { id: jobId },
    include: {
      location: true,
      assignedTo: {
        select: { id: true, name: true, email: true, role: true },
      },
      createdBy: {
        select: { id: true, name: true },
      },
      pdfSource: {
        select: { id: true, originalName: true, substationName: true },
      },
      photos: {
        orderBy: { takenAt: 'desc' },
      },
      statusHistory: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });
}

/**
 * Get jobs for a specific technician
 */
export async function getTechnicianJobs(technicianId: string) {
  return prisma.job.findMany({
    where: {
      assignedToId: technicianId,
      status: {
        in: [JobStatus.ASSIGNED, JobStatus.EN_ROUTE, JobStatus.ON_SITE],
      },
    },
    include: {
      location: true,
    },
    orderBy: [
      { priority: 'asc' }, // URGENT first
      { scheduledFor: 'asc' },
    ],
  });
}

/**
 * Get job statistics
 */
export async function getJobStats(filters?: { assignedToId?: string }) {
  const where: Prisma.JobWhereInput = filters?.assignedToId
    ? { assignedToId: filters.assignedToId }
    : {};

  const [statusCounts, priorityCounts, todayCompleted] = await Promise.all([
    prisma.job.groupBy({
      by: ['status'],
      where,
      _count: true,
    }),
    prisma.job.groupBy({
      by: ['priority'],
      where: { ...where, status: { notIn: [JobStatus.COMPLETED, JobStatus.CANCELLED] } },
      _count: true,
    }),
    prisma.job.count({
      where: {
        ...where,
        status: JobStatus.COMPLETED,
        completedAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
  ]);

  return {
    byStatus: Object.fromEntries(
      statusCounts.map((s) => [s.status, s._count])
    ),
    byPriority: Object.fromEntries(
      priorityCounts.map((p) => [p.priority, p._count])
    ),
    completedToday: todayCompleted,
  };
}
