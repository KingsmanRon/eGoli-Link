import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, JobStatus, JobPriority } from '../models/index.js';
import {
  createJob,
  updateJobStatus,
  assignJob,
  getJobs,
  getJobById,
  getTechnicianJobs,
  getJobStats,
} from '../services/dispatchService.js';
import { storage } from '../services/fileStorage.js';
import { NotFoundError, BadRequestError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

// Validation schemas
const createJobSchema = z.object({
  locationId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  equipmentType: z.string().max(100).optional(),
  equipmentId: z.string().max(50).optional(),
  priority: z.nativeEnum(JobPriority).optional(),
  assignedToId: z.string().uuid().optional(),
  scheduledFor: z.string().datetime().optional(),
});

const updateJobSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  priority: z.nativeEnum(JobPriority).optional(),
  notes: z.string().max(5000).optional(),
  scheduledFor: z.string().datetime().optional().nullable(),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(JobStatus),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  note: z.string().max(500).optional(),
});

const assignJobSchema = z.object({
  technicianId: z.string().uuid(),
});

const listJobsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.union([z.nativeEnum(JobStatus), z.array(z.nativeEnum(JobStatus))]).optional(),
  priority: z.union([z.nativeEnum(JobPriority), z.array(z.nativeEnum(JobPriority))]).optional(),
  assignedToId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'scheduledFor', 'priority', 'status']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  geocoded: z.coerce.boolean().optional(),
});

/**
 * List all jobs with filters
 */
export async function listJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listJobsSchema.parse(req.query);

    const result = await getJobs(
      {
        status: filters.status,
        priority: filters.priority,
        assignedToId: filters.assignedToId,
        search: filters.search,
        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
        endDate: filters.endDate ? new Date(filters.endDate) : undefined,
        geocoded: filters.geocoded,
      },
      {
        page: filters.page,
        limit: filters.limit,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      }
    );

    res.json({
      success: true,
      data: result.jobs,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get jobs assigned to current user
 */
export async function getMyJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const jobs = await getTechnicianJobs(req.user!.id);

    res.json({
      success: true,
      data: jobs,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get single job by ID
 */
export async function getJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const job = await getJobById(id);

    if (!job) {
      throw new NotFoundError('Job');
    }

    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create new job
 */
export async function createNewJob(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createJobSchema.parse(req.body);

    // Verify location exists
    const location = await prisma.location.findUnique({
      where: { id: data.locationId },
    });

    if (!location) {
      throw new BadRequestError('Location not found');
    }

    // If assigning, verify technician exists
    if (data.assignedToId) {
      const technician = await prisma.user.findUnique({
        where: { id: data.assignedToId },
      });

      if (!technician) {
        throw new BadRequestError('Technician not found');
      }
    }

    const job = await createJob({
      ...data,
      scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : undefined,
      createdById: req.user!.id,
    });

    res.status(201).json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update job details
 */
export async function updateJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateJobSchema.parse(req.body);

    const job = await prisma.job.update({
      where: { id },
      data: {
        ...data,
        scheduledFor: data.scheduledFor === null ? null : data.scheduledFor ? new Date(data.scheduledFor) : undefined,
      },
      include: {
        location: true,
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    logger.info({ jobId: id, updates: Object.keys(data) }, 'Job updated');

    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update job status
 */
export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { status, lat, lng, note } = updateStatusSchema.parse(req.body);

    const location = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;

    const job = await updateJobStatus(id, status, req.user!.id, location, note);

    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Assign job to technician
 */
export async function assignToTechnician(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { technicianId } = assignJobSchema.parse(req.body);

    // Verify technician exists and is active
    const technician = await prisma.user.findUnique({
      where: { id: technicianId },
    });

    if (!technician || !technician.isActive) {
      throw new BadRequestError('Technician not found or inactive');
    }

    const job = await assignJob(id, technicianId, req.user!.id);

    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Upload photo for job
 */
export async function uploadPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    // Verify job exists
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundError('Job');
    }

    // Get uploaded file from multer
    const file = req.file;
    if (!file) {
      throw new BadRequestError('No file uploaded');
    }

    // Upload to storage
    const uploaded = await storage.upload(
      file.buffer,
      file.originalname,
      file.mimetype
    );

    // Create photo record
    const photo = await prisma.photo.create({
      data: {
        jobId: id,
        filename: uploaded.filename,
        url: uploaded.url,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
        caption: req.body.caption,
      },
    });

    logger.info({ jobId: id, photoId: photo.id }, 'Photo uploaded');

    res.status(201).json({
      success: true,
      data: photo,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete job
 */
export async function deleteJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    // Verify job exists
    const job = await prisma.job.findUnique({
      where: { id },
      include: { photos: true },
    });

    if (!job) {
      throw new NotFoundError('Job');
    }

    // Delete photos from storage
    for (const photo of job.photos) {
      await storage.delete(photo.filename);
    }

    // Delete job (cascades to photos and status history)
    await prisma.job.delete({ where: { id } });

    logger.info({ jobId: id }, 'Job deleted');

    res.json({
      success: true,
      message: 'Job deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get job statistics
 */
export async function getStatistics(req: Request, res: Response, next: NextFunction) {
  try {
    const assignedToId = req.query.technicianId as string | undefined;

    const stats = await getJobStats({ assignedToId });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}
