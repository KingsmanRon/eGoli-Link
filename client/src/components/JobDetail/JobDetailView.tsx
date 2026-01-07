import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useJob, useUpdateJobStatus, useUploadPhoto } from '../../hooks/useJobs';
import { useCurrentPosition } from '../../hooks/useGeolocation';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import {
  getStatusColor,
  getStatusLabel,
  getPriorityColor,
  getPriorityLabel,
  formatDateTime,
} from '../../utils/formatters';
import { openWazeNavigation, openGoogleMapsNavigation } from '../../services/wazeNavigation';
import { Header } from '../Layout/Header';
import { PhotoCapture } from '../JobCompletion/PhotoCapture';
import type { JobStatus } from '../../types';

const STATUS_FLOW: JobStatus[] = ['ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED'];

export function JobDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading, error } = useJob(id);
  const updateStatus = useUpdateJobStatus();
  const uploadPhoto = useUploadPhoto();
  const { getCurrentPosition } = useCurrentPosition();
  const { isOnline, queueStatusUpdate, queuePhotoUpload } = useOfflineSync();
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [statusNote, setStatusNote] = useState('');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Header title="Job Details" showBack onBack={() => navigate(-1)} />
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Header title="Job Details" showBack onBack={() => navigate(-1)} />
        <div className="p-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-medium">Failed to load job</p>
            <button onClick={() => navigate(-1)} className="mt-2 text-red-700 underline">
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canNavigate = job.location.geocoded && job.location.lat && job.location.lng;
  const currentStatusIndex = STATUS_FLOW.indexOf(job.status as JobStatus);
  const nextStatus = currentStatusIndex >= 0 && currentStatusIndex < STATUS_FLOW.length - 1
    ? STATUS_FLOW[currentStatusIndex + 1]
    : null;

  const handleStatusUpdate = async (newStatus: JobStatus) => {
    const position = await getCurrentPosition();

    if (isOnline) {
      await updateStatus.mutateAsync({
        jobId: job.id,
        status: newStatus,
        location: position || undefined,
        note: statusNote || undefined,
      });
    } else {
      await queueStatusUpdate(
        job.id,
        newStatus,
        position?.lat,
        position?.lng,
        statusNote
      );
    }
    setStatusNote('');
  };

  const handlePhotoCapture = async (blob: Blob, caption?: string) => {
    if (isOnline) {
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await uploadPhoto.mutateAsync({ jobId: job.id, file, caption });
    } else {
      await queuePhotoUpload(job.id, blob, caption);
    }
    setShowPhotoCapture(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-24">
      <Header title={job.title} showBack onBack={() => navigate(-1)} />

      {/* Status Card */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(job.status)}`}>
            {getStatusLabel(job.status)}
          </span>
          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getPriorityColor(job.priority)}`}>
            {getPriorityLabel(job.priority)}
          </span>
        </div>

        {/* Navigation Buttons */}
        {canNavigate && (
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => openWazeNavigation({ lat: job.location.lat!, lng: job.location.lng! })}
              className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              Navigate with Waze
            </button>
            <button
              onClick={() => openGoogleMapsNavigation({ lat: job.location.lat!, lng: job.location.lng! })}
              className="flex items-center justify-center gap-2 bg-gray-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </button>
          </div>
        )}

        {/* Quick Status Update */}
        {nextStatus && (
          <button
            onClick={() => handleStatusUpdate(nextStatus)}
            disabled={updateStatus.isPending}
            className="w-full bg-citypower-gold text-primary-900 py-3 rounded-lg font-medium hover:bg-yellow-400 disabled:opacity-50"
          >
            {updateStatus.isPending ? 'Updating...' : `Mark as ${getStatusLabel(nextStatus)}`}
          </button>
        )}
      </div>

      {/* Location Info */}
      <div className="bg-white border-b border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-2">Location</h2>
        <div className="space-y-1 text-sm text-gray-600">
          <p><span className="font-medium">Address:</span> {job.location.address}</p>
          <p><span className="font-medium">Township:</span> {job.location.township}</p>
          <p><span className="font-medium">Stand No:</span> {job.location.standNo}</p>
          {!job.location.geocoded && (
            <p className="text-orange-600">⚠️ Location not geocoded - navigation unavailable</p>
          )}
        </div>
      </div>

      {/* Equipment Info */}
      {(job.equipmentId || job.equipmentType) && (
        <div className="bg-white border-b border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-2">Equipment</h2>
          <div className="space-y-1 text-sm text-gray-600">
            {job.equipmentId && <p><span className="font-medium">ID:</span> {job.equipmentId}</p>}
            {job.equipmentType && <p><span className="font-medium">Type:</span> {job.equipmentType}</p>}
          </div>
        </div>
      )}

      {/* Description */}
      {job.description && (
        <div className="bg-white border-b border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-2">Description</h2>
          <p className="text-sm text-gray-600">{job.description}</p>
        </div>
      )}

      {/* Notes */}
      <div className="bg-white border-b border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-2">Add Note</h2>
        <textarea
          value={statusNote}
          onChange={(e) => setStatusNote(e.target.value)}
          placeholder="Add a note about this job..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
          rows={3}
        />
      </div>

      {/* Photos Section */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Photos ({job.photos?.length || 0})</h2>
          <button
            onClick={() => setShowPhotoCapture(true)}
            className="flex items-center gap-1 text-primary-600 text-sm font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Add Photo
          </button>
        </div>

        {job.photos && job.photos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {job.photos.map((photo) => (
              <img
                key={photo.id}
                src={photo.url}
                alt={photo.caption || 'Job photo'}
                className="w-full h-24 object-cover rounded-lg"
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No photos yet</p>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white p-4">
        <h2 className="font-semibold text-gray-900 mb-3">Timeline</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Created</span>
            <span>{formatDateTime(job.createdAt)}</span>
          </div>
          {job.startedAt && (
            <div className="flex justify-between text-gray-600">
              <span>Started</span>
              <span>{formatDateTime(job.startedAt)}</span>
            </div>
          )}
          {job.completedAt && (
            <div className="flex justify-between text-green-600">
              <span>Completed</span>
              <span>{formatDateTime(job.completedAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Photo Capture Modal */}
      {showPhotoCapture && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-lg mx-4 rounded-lg overflow-hidden">
            <PhotoCapture
              onCapture={handlePhotoCapture}
              onCancel={() => setShowPhotoCapture(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
