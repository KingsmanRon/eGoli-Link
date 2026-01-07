import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { locationsApi } from '../../services/api';
import { openWazeNavigation, openGoogleMapsNavigation } from '../../services/wazeNavigation';
import { getMarkerColor, getPriorityLabel, getStatusLabel } from '../../utils/formatters';
import type { MapLocation, JobPriority } from '../../types';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Create custom marker icon
function createMarkerIcon(priority: JobPriority): L.DivIcon {
  const color = getMarkerColor(priority);
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

// Current location marker
function CurrentLocationMarker({ position }: { position: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.setView(position, 14);
    }
  }, [position, map]);

  if (!position) return null;

  return (
    <Marker
      position={position}
      icon={L.divIcon({
        className: 'current-location-marker',
        html: `
          <div style="
            background-color: #3b82f6;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.3);
          "></div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })}
    >
      <Popup>Your location</Popup>
    </Marker>
  );
}

interface JobMarkerProps {
  location: MapLocation;
  onSelect?: (location: MapLocation) => void;
}

function JobMarker({ location, onSelect }: JobMarkerProps) {
  if (!location.lat || !location.lng) return null;

  // Get highest priority job
  const highestPriorityJob = location.jobs.reduce((highest, job) => {
    const priorityOrder = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    return priorityOrder[job.priority] < priorityOrder[highest.priority] ? job : highest;
  }, location.jobs[0]);

  return (
    <Marker
      position={[location.lat, location.lng]}
      icon={createMarkerIcon(highestPriorityJob?.priority || 'NORMAL')}
      eventHandlers={{
        click: () => onSelect?.(location),
      }}
    >
      <Popup>
        <div className="min-w-[200px]">
          <h3 className="font-semibold text-gray-900">{location.township}</h3>
          <p className="text-sm text-gray-600 mb-2">{location.address}</p>

          {location.jobs.length > 0 && (
            <div className="space-y-2 mb-3">
              {location.jobs.slice(0, 3).map((job) => (
                <div key={job.id} className="text-sm">
                  <span className="font-medium">{job.title}</span>
                  <div className="flex gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded ${getStatusLabel(job.status)}`}>
                      {getStatusLabel(job.status)}
                    </span>
                    <span>{getPriorityLabel(job.priority)}</span>
                  </div>
                </div>
              ))}
              {location.jobs.length > 3 && (
                <p className="text-xs text-gray-500">+{location.jobs.length - 3} more jobs</p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => openWazeNavigation({ lat: location.lat!, lng: location.lng! })}
              className="flex-1 bg-primary-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-primary-700"
            >
              Waze
            </button>
            <button
              onClick={() => openGoogleMapsNavigation({ lat: location.lat!, lng: location.lng! })}
              className="flex-1 bg-gray-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-700"
            >
              Google
            </button>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

interface MapViewProps {
  onLocationSelect?: (location: MapLocation) => void;
  selectedLocationId?: string;
}

export function MapView({ onLocationSelect, selectedLocationId }: MapViewProps) {
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations', 'map'],
    queryFn: locationsApi.getMapLocations,
  });

  // Get current location
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentPosition([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => {
          console.warn('Could not get location:', err.message);
        },
        { enableHighAccuracy: true }
      );
    }
  }, []);

  // Default center: Johannesburg
  const defaultCenter: [number, number] = [
    parseFloat(import.meta.env.VITE_MAP_CENTER_LAT || '-26.2041'),
    parseFloat(import.meta.env.VITE_MAP_CENTER_LNG || '28.0473'),
  ];

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-2"></div>
          <p className="text-gray-600">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <MapContainer
      center={currentPosition || defaultCenter}
      zoom={12}
      className="h-full w-full"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <CurrentLocationMarker position={currentPosition} />

      {locations.map((location) => (
        <JobMarker
          key={location.id}
          location={location}
          onSelect={onLocationSelect}
        />
      ))}
    </MapContainer>
  );
}
