import PQueue from 'p-queue';
import { logger } from '../utils/logger.js';
import { normalizeAddress } from '../utils/addressNormalizer.js';

export interface GeocodeResult {
  lat: number;
  lng: number;
  source: 'nominatim' | 'google' | 'manual';
  confidence: number;
  displayName?: string;
}

interface NominatimResponse {
  lat: string;
  lon: string;
  display_name: string;
  importance: number;
}

interface GoogleGeocodeResponse {
  status: string;
  results: Array<{
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
      location_type: string;
    };
    formatted_address: string;
  }>;
}

// Rate limiter for Nominatim (1 request per second)
const nominatimQueue = new PQueue({
  concurrency: 1,
  interval: 1100, // Slightly over 1 second to be safe
  intervalCap: 1,
});

// Rate limiter for Google (higher limits but costs money)
const googleQueue = new PQueue({
  concurrency: 5,
  interval: 1000,
  intervalCap: 10,
});

const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'eGoliLink/1.0 (citypower-dispatch)';

/**
 * Geocode using Nominatim (OpenStreetMap)
 * Free but rate-limited to 1 request per second
 */
async function geocodeWithNominatim(address: string): Promise<GeocodeResult | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', address);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'za');

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': NOMINATIM_USER_AGENT,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status, address },
        'Nominatim request failed'
      );
      return null;
    }

    const data: NominatimResponse[] = await response.json();

    if (data.length === 0) {
      logger.debug({ address }, 'No Nominatim results');
      return null;
    }

    const result = data[0];
    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      source: 'nominatim',
      confidence: result.importance,
      displayName: result.display_name,
    };
  } catch (error) {
    logger.error({ error, address }, 'Nominatim geocode error');
    return null;
  }
}

/**
 * Geocode using Google Geocoding API
 * Higher accuracy but costs money - use as fallback
 */
async function geocodeWithGoogle(address: string): Promise<GeocodeResult | null> {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;

  if (!apiKey) {
    logger.warn('Google Geocoding API key not configured');
    return null;
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('region', 'za');

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      logger.warn(
        { status: response.status, address },
        'Google Geocoding request failed'
      );
      return null;
    }

    const data: GoogleGeocodeResponse = await response.json();

    if (data.status !== 'OK' || data.results.length === 0) {
      logger.debug({ address, status: data.status }, 'No Google results');
      return null;
    }

    const result = data.results[0];
    const { lat, lng } = result.geometry.location;

    // Calculate confidence based on location_type
    let confidence = 0.5;
    switch (result.geometry.location_type) {
      case 'ROOFTOP':
        confidence = 1.0;
        break;
      case 'RANGE_INTERPOLATED':
        confidence = 0.8;
        break;
      case 'GEOMETRIC_CENTER':
        confidence = 0.6;
        break;
      case 'APPROXIMATE':
        confidence = 0.4;
        break;
    }

    return {
      lat,
      lng,
      source: 'google',
      confidence,
      displayName: result.formatted_address,
    };
  } catch (error) {
    logger.error({ error, address }, 'Google geocode error');
    return null;
  }
}

/**
 * Main geocoding function with fallback chain
 * 1. Try Nominatim (free)
 * 2. If fails, try Google (paid fallback)
 * 3. Return null if both fail
 */
export async function geocode(
  rawAddress: string,
  township: string
): Promise<GeocodeResult | null> {
  // Normalize the address for better geocoding
  const { normalized } = normalizeAddress(rawAddress, township);

  logger.debug({ original: rawAddress, normalized, township }, 'Geocoding address');

  // Try Nominatim first (rate-limited)
  const nominatimResult = await nominatimQueue.add(
    () => geocodeWithNominatim(normalized),
    { throwOnTimeout: true }
  );

  if (nominatimResult) {
    logger.info(
      { address: normalized, result: nominatimResult },
      'Geocoded with Nominatim'
    );
    return nominatimResult;
  }

  // Fallback to Google
  const googleResult = await googleQueue.add(
    () => geocodeWithGoogle(normalized),
    { throwOnTimeout: true }
  );

  if (googleResult) {
    logger.info(
      { address: normalized, result: googleResult },
      'Geocoded with Google'
    );
    return googleResult;
  }

  logger.warn({ address: normalized }, 'Geocoding failed - no results from any provider');
  return null;
}

/**
 * Batch geocode multiple addresses
 * Returns a map of original addresses to results
 */
export async function batchGeocode(
  addresses: Array<{ address: string; township: string; id: string }>
): Promise<Map<string, GeocodeResult | null>> {
  const results = new Map<string, GeocodeResult | null>();

  logger.info({ count: addresses.length }, 'Starting batch geocode');

  for (const { address, township, id } of addresses) {
    try {
      const result = await geocode(address, township);
      results.set(id, result);

      // Log progress
      if (results.size % 10 === 0) {
        logger.info(
          { progress: `${results.size}/${addresses.length}` },
          'Batch geocode progress'
        );
      }
    } catch (error) {
      logger.error({ error, id, address }, 'Batch geocode error for address');
      results.set(id, null);
    }
  }

  const successful = Array.from(results.values()).filter((r) => r !== null).length;
  logger.info(
    { total: addresses.length, successful, failed: addresses.length - successful },
    'Batch geocode complete'
  );

  return results;
}

/**
 * Validate coordinates are within South Africa bounds
 */
export function isValidSouthAfricaCoords(lat: number, lng: number): boolean {
  // Approximate bounding box for South Africa
  const SA_BOUNDS = {
    minLat: -35.0,
    maxLat: -22.0,
    minLng: 16.0,
    maxLng: 33.0,
  };

  return (
    lat >= SA_BOUNDS.minLat &&
    lat <= SA_BOUNDS.maxLat &&
    lng >= SA_BOUNDS.minLng &&
    lng <= SA_BOUNDS.maxLng
  );
}

/**
 * Validate coordinates are within Johannesburg metro area
 */
export function isValidJohannesburgCoords(lat: number, lng: number): boolean {
  // Approximate bounding box for Johannesburg metro
  const JHB_BOUNDS = {
    minLat: -26.5,
    maxLat: -25.8,
    minLng: 27.7,
    maxLng: 28.5,
  };

  return (
    lat >= JHB_BOUNDS.minLat &&
    lat <= JHB_BOUNDS.maxLat &&
    lng >= JHB_BOUNDS.minLng &&
    lng <= JHB_BOUNDS.maxLng
  );
}
