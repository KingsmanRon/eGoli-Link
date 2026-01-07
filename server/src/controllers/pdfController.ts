import type { Request, Response, NextFunction } from 'express';
import { prisma, ExtractionStatus } from '../models/index.js';
import { extractFromBuffer, validateExtractionResult } from '../services/pdfExtractor.js';
import { storage } from '../services/fileStorage.js';
import { processGeocodeQueue } from '../services/geocodeQueue.js';
import { BadRequestError, NotFoundError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

/**
 * Upload and process PDF
 */
export async function uploadPDF(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) {
      throw new BadRequestError('No PDF file uploaded');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestError('File must be a PDF');
    }

    // Upload file to storage
    const uploaded = await storage.upload(file.buffer, file.originalname, file.mimetype);

    // Create PDF upload record
    const pdfUpload = await prisma.pDFUpload.create({
      data: {
        filename: uploaded.filename,
        originalName: file.originalname,
        url: uploaded.url,
        size: uploaded.size,
        uploadedById: req.user!.id,
        extractionStatus: ExtractionStatus.PROCESSING,
      },
    });

    logger.info({ pdfId: pdfUpload.id, filename: file.originalname }, 'PDF upload started');

    // Process PDF asynchronously
    processUploadedPDF(pdfUpload.id, file.buffer).catch((err) => {
      logger.error({ error: err, pdfId: pdfUpload.id }, 'PDF processing failed');
    });

    res.status(202).json({
      success: true,
      data: {
        id: pdfUpload.id,
        filename: pdfUpload.originalName,
        status: pdfUpload.extractionStatus,
        message: 'PDF uploaded and processing started',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Process uploaded PDF (runs in background)
 */
async function processUploadedPDF(pdfId: string, buffer: Buffer) {
  try {
    // Extract data from PDF
    const result = await extractFromBuffer(buffer);

    // Validate extraction
    const validation = validateExtractionResult(result);

    if (result.locations.length === 0) {
      await prisma.pDFUpload.update({
        where: { id: pdfId },
        data: {
          extractionStatus: ExtractionStatus.FAILED,
          errorMessage: result.errors.join('; ') || 'No locations extracted',
          processedAt: new Date(),
        },
      });
      return;
    }

    // Create or update locations
    let extractedCount = 0;
    const locationIds: string[] = [];

    for (const loc of result.locations) {
      try {
        const location = await prisma.location.upsert({
          where: {
            standNo_township: {
              standNo: loc.standNo,
              township: loc.township,
            },
          },
          create: {
            standNo: loc.standNo,
            township: loc.township,
            address: loc.address,
          },
          update: {
            // Only update address if it's more detailed
            address: loc.address.length > 10 ? loc.address : undefined,
          },
        });

        locationIds.push(location.id);
        extractedCount++;

        // Create PDF-Location relationship
        await prisma.pDFLocation.upsert({
          where: {
            pdfId_locationId: {
              pdfId,
              locationId: location.id,
            },
          },
          create: {
            pdfId,
            locationId: location.id,
          },
          update: {},
        });
      } catch (err) {
        logger.warn({ error: err, location: loc }, 'Failed to upsert location');
      }
    }

    // Update PDF record
    await prisma.pDFUpload.update({
      where: { id: pdfId },
      data: {
        substationName: result.substationName,
        drawingNumber: result.drawingNumber,
        extractionStatus: ExtractionStatus.COMPLETED,
        extractedCount,
        errorMessage: validation.issues.length > 0 ? validation.issues.join('; ') : null,
        processedAt: new Date(),
      },
    });

    logger.info(
      { pdfId, extractedCount, substationName: result.substationName },
      'PDF processing completed'
    );

    // Trigger geocoding for new locations
    if (extractedCount > 0) {
      processGeocodeQueue({ limit: extractedCount }).catch((err) => {
        logger.error({ error: err }, 'Geocode queue processing failed');
      });
    }
  } catch (error) {
    logger.error({ error, pdfId }, 'PDF processing error');

    await prisma.pDFUpload.update({
      where: { id: pdfId },
      data: {
        extractionStatus: ExtractionStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        processedAt: new Date(),
      },
    });
  }
}

/**
 * Get PDF upload status
 */
export async function getPDFStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const pdf = await prisma.pDFUpload.findUnique({
      where: { id },
      select: {
        id: true,
        originalName: true,
        extractionStatus: true,
        extractedCount: true,
        substationName: true,
        drawingNumber: true,
        errorMessage: true,
        createdAt: true,
        processedAt: true,
      },
    });

    if (!pdf) {
      throw new NotFoundError('PDF upload');
    }

    res.json({
      success: true,
      data: pdf,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get locations extracted from PDF
 */
export async function getPDFLocations(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    // Verify PDF exists and get extracted locations
    const pdf = await prisma.pDFUpload.findUnique({
      where: { id },
      include: {
        extractedLocations: {
          include: {
            location: true,
          },
        },
      },
    });

    if (!pdf) {
      throw new NotFoundError('PDF upload');
    }

    // Get job counts for each location
    const locationIds = pdf.extractedLocations.map((el) => el.locationId);
    const jobCounts = await prisma.job.groupBy({
      by: ['locationId'],
      where: {
        locationId: { in: locationIds },
        pdfSourceId: id,
      },
      _count: true,
    });

    const jobCountMap = new Map(jobCounts.map((jc) => [jc.locationId, jc._count]));

    // Build locations with job counts
    const locations = pdf.extractedLocations.map((el) => ({
      ...el.location,
      jobCount: jobCountMap.get(el.locationId) || 0,
    }));

    res.json({
      success: true,
      data: {
        pdf: {
          id: pdf.id,
          name: pdf.originalName,
          substationName: pdf.substationName,
          drawingNumber: pdf.drawingNumber,
        },
        locations,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List all PDF uploads
 */
export async function listPDFs(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;

    const [pdfs, total] = await Promise.all([
      prisma.pDFUpload.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          originalName: true,
          substationName: true,
          drawingNumber: true,
          extractionStatus: true,
          extractedCount: true,
          errorMessage: true,
          createdAt: true,
          processedAt: true,
          _count: {
            select: { jobs: true },
          },
        },
      }),
      prisma.pDFUpload.count(),
    ]);

    res.json({
      success: true,
      data: pdfs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create jobs from PDF locations
 */
export async function createJobsFromPDF(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { locationIds, priority, assignedToId } = req.body;

    // Verify PDF exists
    const pdf = await prisma.pDFUpload.findUnique({
      where: { id },
    });

    if (!pdf) {
      throw new NotFoundError('PDF upload');
    }

    // Get locations
    const locations = await prisma.location.findMany({
      where: {
        id: { in: locationIds },
      },
    });

    if (locations.length === 0) {
      throw new BadRequestError('No valid locations provided');
    }

    // Create jobs
    const jobs = await Promise.all(
      locations.map((location) =>
        prisma.job.create({
          data: {
            locationId: location.id,
            title: `${pdf.substationName || 'Field'} - ${location.standNo}`,
            description: `Auto-generated from PDF: ${pdf.originalName}`,
            priority: priority || 'NORMAL',
            assignedToId,
            pdfSourceId: pdf.id,
            createdById: req.user!.id,
            status: assignedToId ? 'ASSIGNED' : 'PENDING',
          },
          include: {
            location: true,
          },
        })
      )
    );

    logger.info(
      { pdfId: id, jobCount: jobs.length },
      'Jobs created from PDF'
    );

    res.status(201).json({
      success: true,
      data: {
        created: jobs.length,
        jobs,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retry geocoding for failed locations from PDF
 */
export async function retryGeocoding(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await processGeocodeQueue({ retryFailed: true, limit: 50 });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
