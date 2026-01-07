import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../models/index.js';
import { setManualCoordinates, getGeocodeStats } from '../services/geocodeQueue.js';
import { isValidJohannesburgCoords } from '../services/geocoder.js';
import { NotFoundError, BadRequestError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

// Validation schemas
const listLocationsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).default(100),
  geocoded: z.coerce.boolean().optional(),
  township: z.string().optional(),
  search: z.string().optional(),
});

const updateLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const createLocationSchema = z.object({
  standNo: z.string().min(1).max(50),
  township: z.string().min(1).max(100),
  address: z.string().min(1).max(500),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

/**
 * List all locations
 */
export async function listLocations(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listLocationsSchema.parse(req.query);

    const where: Record<string, unknown> = {};

    if (typeof filters.geocoded === 'boolean') {
      where.geocoded = filters.geocoded;
    }

    if (filters.township) {
      where.township = { contains: filters.township, mode: 'insensitive' };
    }

    if (filters.search) {
      where.OR = [
        { address: { contains: filters.search, mode: 'insensitive' } },
        { township: { contains: filters.search, mode: 'insensitive' } },
        { standNo: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const skip = (filters.page - 1) * filters.limit;

    const [locations, total] = await Promise.all([
      prisma.location.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: [{ township: 'asc' }, { standNo: 'asc' }],
        include: {
          _count: {
            select: { jobs: true },
          },
        },
      }),
      prisma.location.count({ where }),
    ]);

    res.json({
      success: true,
      data: locations,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get locations for map display (geocoded only)
 */
export async function getMapLocations(req: Request, res: Response, next: NextFunction) {
  try {
    const locations = await prisma.location.findMany({
      where: {
        geocoded: true,
        lat: { not: null },
        lng: { not: null },
      },
      select: {
        id: true,
        standNo: true,
        township: true,
        address: true,
        lat: true,
        lng: true,
        jobs: {
          where: {
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: locations,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get locations needing manual geocoding
 */
export async function getUngeocoded(req: Request, res: Response, next: NextFunction) {
  try {
    const locations = await prisma.location.findMany({
      where: {
        OR: [
          { geocodeFailed: true },
          { geocoded: false, geocodeAttempts: { gte: 3 } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { jobs: true },
        },
      },
    });

    res.json({
      success: true,
      data: locations,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get single location
 */
export async function getLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
          },
        },
      },
    });

    if (!location) {
      throw new NotFoundError('Location');
    }

    res.json({
      success: true,
      data: location,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update location coordinates manually
 */
export async function updateCoordinates(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { lat, lng } = updateLocationSchema.parse(req.body);

    // Verify location exists
    const existing = await prisma.location.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Location');
    }

    // Validate coordinates are in Johannesburg area
    if (!isValidJohannesburgCoords(lat, lng)) {
      logger.warn({ id, lat, lng }, 'Manual coordinates outside Johannesburg area');
    }

    await setManualCoordinates(id, lat, lng);

    const updated = await prisma.location.findUnique({ where: { id } });

    logger.info({ locationId: id, lat, lng }, 'Location coordinates updated manually');

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create new location
 */
export async function createLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createLocationSchema.parse(req.body);

    // Check for duplicate
    const existing = await prisma.location.findUnique({
      where: {
        standNo_township: {
          standNo: data.standNo,
          township: data.township,
        },
      },
    });

    if (existing) {
      throw new BadRequestError('Location with this stand number and township already exists');
    }

    const location = await prisma.location.create({
      data: {
        standNo: data.standNo,
        township: data.township,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        geocoded: data.lat !== undefined && data.lng !== undefined,
        geocodeSource: data.lat !== undefined ? 'manual' : undefined,
      },
    });

    logger.info({ locationId: location.id }, 'Location created');

    res.status(201).json({
      success: true,
      data: location,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get geocoding statistics
 */
export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getGeocodeStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get townships list
 */
export async function getTownships(req: Request, res: Response, next: NextFunction) {
  try {
    const townships = await prisma.location.groupBy({
      by: ['township'],
      _count: true,
      orderBy: {
        township: 'asc',
      },
    });

    res.json({
      success: true,
      data: townships.map((t) => ({
        name: t.township,
        count: t._count,
      })),
    });
  } catch (error) {
    next(error);
  }
}
