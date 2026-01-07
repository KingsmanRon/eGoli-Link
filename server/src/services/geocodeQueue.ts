import { prisma } from '../models/index.js';
import { geocode, isValidJohannesburgCoords } from './geocoder.js';
import { normalizeAddress } from '../utils/addressNormalizer.js';
import { logger } from '../utils/logger.js';

const MAX_RETRY_ATTEMPTS = 3;
const BATCH_SIZE = 50;

interface GeocodeQueueOptions {
  retryFailed?: boolean;
  limit?: number;
}

/**
 * Process pending geocoding for locations
 * Called after PDF upload or on a scheduled basis
 */
export async function processGeocodeQueue(options: GeocodeQueueOptions = {}): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  const { retryFailed = false, limit = BATCH_SIZE } = options;

  // Find locations needing geocoding
  const locations = await prisma.location.findMany({
    where: {
      geocoded: false,
      geocodeFailed: retryFailed ? undefined : false,
      geocodeAttempts: retryFailed ? { lt: MAX_RETRY_ATTEMPTS } : undefined,
    },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });

  if (locations.length === 0) {
    logger.debug('No locations pending geocoding');
    return { processed: 0, successful: 0, failed: 0 };
  }

  logger.info({ count: locations.length }, 'Processing geocode queue');

  let successful = 0;
  let failed = 0;

  for (const location of locations) {
    try {
      // Normalize address
      const { normalized } = normalizeAddress(location.address, location.township);

      // Attempt geocoding
      const result = await geocode(location.address, location.township);

      if (result) {
        // Validate coordinates are in Johannesburg area
        const isValid = isValidJohannesburgCoords(result.lat, result.lng);

        if (isValid) {
          // Update location with coordinates
          await prisma.location.update({
            where: { id: location.id },
            data: {
              lat: result.lat,
              lng: result.lng,
              geocoded: true,
              geocodeFailed: false,
              geocodeSource: result.source,
              normalizedAddress: normalized,
              geocodeAttempts: location.geocodeAttempts + 1,
              lastGeocodeError: null,
            },
          });

          successful++;
          logger.debug(
            { locationId: location.id, address: location.address, coords: { lat: result.lat, lng: result.lng } },
            'Location geocoded successfully'
          );
        } else {
          // Coordinates outside valid area
          await prisma.location.update({
            where: { id: location.id },
            data: {
              geocodeAttempts: location.geocodeAttempts + 1,
              lastGeocodeError: 'Coordinates outside Johannesburg area',
              geocodeFailed: location.geocodeAttempts + 1 >= MAX_RETRY_ATTEMPTS,
            },
          });

          failed++;
          logger.warn(
            { locationId: location.id, coords: { lat: result.lat, lng: result.lng } },
            'Geocoded coordinates outside valid area'
          );
        }
      } else {
        // No result from geocoder
        const attempts = location.geocodeAttempts + 1;
        await prisma.location.update({
          where: { id: location.id },
          data: {
            geocodeAttempts: attempts,
            lastGeocodeError: 'No geocoding result found',
            geocodeFailed: attempts >= MAX_RETRY_ATTEMPTS,
            normalizedAddress: normalized,
          },
        });

        failed++;
        logger.debug(
          { locationId: location.id, address: location.address, attempts },
          'Geocoding returned no results'
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const attempts = location.geocodeAttempts + 1;

      await prisma.location.update({
        where: { id: location.id },
        data: {
          geocodeAttempts: attempts,
          lastGeocodeError: errorMessage,
          geocodeFailed: attempts >= MAX_RETRY_ATTEMPTS,
        },
      });

      failed++;
      logger.error(
        { error, locationId: location.id },
        'Error during geocoding'
      );
    }
  }

  logger.info(
    { processed: locations.length, successful, failed },
    'Geocode queue processing complete'
  );

  return {
    processed: locations.length,
    successful,
    failed,
  };
}

/**
 * Get geocoding statistics
 */
export async function getGeocodeStats(): Promise<{
  total: number;
  geocoded: number;
  pending: number;
  failed: number;
  sources: Record<string, number>;
}> {
  const [total, geocoded, failed, sources] = await Promise.all([
    prisma.location.count(),
    prisma.location.count({ where: { geocoded: true } }),
    prisma.location.count({ where: { geocodeFailed: true } }),
    prisma.location.groupBy({
      by: ['geocodeSource'],
      where: { geocoded: true },
      _count: true,
    }),
  ]);

  const sourceStats: Record<string, number> = {};
  for (const source of sources) {
    if (source.geocodeSource) {
      sourceStats[source.geocodeSource] = source._count;
    }
  }

  return {
    total,
    geocoded,
    pending: total - geocoded - failed,
    failed,
    sources: sourceStats,
  };
}

/**
 * Retry failed geocoding with exponential backoff timing
 */
export async function retryFailedGeocoding(): Promise<{
  processed: number;
  recovered: number;
}> {
  // Only retry locations that haven't exceeded max attempts
  const result = await processGeocodeQueue({
    retryFailed: true,
    limit: 20, // Smaller batch for retries
  });

  return {
    processed: result.processed,
    recovered: result.successful,
  };
}

/**
 * Mark a location for manual coordinate entry
 */
export async function markForManualEntry(locationId: string, reason?: string): Promise<void> {
  await prisma.location.update({
    where: { id: locationId },
    data: {
      geocodeFailed: true,
      lastGeocodeError: reason || 'Marked for manual entry',
    },
  });

  logger.info({ locationId, reason }, 'Location marked for manual entry');
}

/**
 * Manually set coordinates for a location
 */
export async function setManualCoordinates(
  locationId: string,
  lat: number,
  lng: number
): Promise<void> {
  // Validate coordinates
  if (!isValidJohannesburgCoords(lat, lng)) {
    logger.warn({ locationId, lat, lng }, 'Manual coordinates outside Johannesburg area');
  }

  await prisma.location.update({
    where: { id: locationId },
    data: {
      lat,
      lng,
      geocoded: true,
      geocodeFailed: false,
      geocodeSource: 'manual',
      lastGeocodeError: null,
    },
  });

  logger.info({ locationId, lat, lng }, 'Manual coordinates set');
}
