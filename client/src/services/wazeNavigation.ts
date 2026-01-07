/**
 * Waze Navigation Service
 * Opens Waze app with destination coordinates for one-tap navigation
 */

interface NavigationOptions {
  lat: number;
  lng: number;
  name?: string;
}

/**
 * Open Waze navigation to specified coordinates
 * Tries to open the Waze app, falls back to web browser
 */
export function openWazeNavigation({ lat, lng }: NavigationOptions): void {
  // Waze deep link format
  const wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

  // Try to open in new window (works on mobile to open app)
  window.open(wazeUrl, '_blank');
}

/**
 * Open Google Maps navigation as fallback
 */
export function openGoogleMapsNavigation({ lat, lng }: NavigationOptions): void {
  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  window.open(googleUrl, '_blank');
}

/**
 * Open Apple Maps (iOS only)
 */
export function openAppleMapsNavigation({ lat, lng, name }: NavigationOptions): void {
  const label = name ? encodeURIComponent(name) : '';
  const appleUrl = `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d${label ? `&q=${label}` : ''}`;
  window.location.href = appleUrl;
}

/**
 * Detect if running on iOS
 */
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * Detect if running on Android
 */
function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

/**
 * Smart navigation - opens the best available navigation app
 * Priority: Waze > Google Maps > Apple Maps (iOS)
 */
export function openNavigation(options: NavigationOptions, preferredApp: 'waze' | 'google' | 'apple' = 'waze'): void {
  switch (preferredApp) {
    case 'waze':
      openWazeNavigation(options);
      break;
    case 'google':
      openGoogleMapsNavigation(options);
      break;
    case 'apple':
      if (isIOS()) {
        openAppleMapsNavigation(options);
      } else {
        openGoogleMapsNavigation(options);
      }
      break;
    default:
      openWazeNavigation(options);
  }
}

/**
 * Get available navigation options based on platform
 */
export function getNavigationOptions(): Array<{ id: string; name: string; icon: string }> {
  const options = [
    { id: 'waze', name: 'Waze', icon: '🚗' },
    { id: 'google', name: 'Google Maps', icon: '🗺️' },
  ];

  if (isIOS()) {
    options.push({ id: 'apple', name: 'Apple Maps', icon: '🍎' });
  }

  return options;
}

/**
 * Calculate estimated travel time (rough approximation)
 * Based on average urban speed of 30 km/h
 */
export function estimateTravelTime(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): { distance: number; minutes: number } {
  // Haversine formula for distance
  const R = 6371; // Earth's radius in km
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  // Estimate time at 30 km/h average urban speed
  const minutes = Math.ceil((distance / 30) * 60);

  return {
    distance: Math.round(distance * 10) / 10,
    minutes,
  };
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Format distance for display
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Format travel time for display
 */
export function formatTravelTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
