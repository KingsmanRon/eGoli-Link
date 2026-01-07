import { useState, useEffect } from 'react';
import { pdfApi, authApi } from '../../services/api';
import type { PDFUpload, Location, JobPriority, User } from '../../types';

interface PDFDetailModalProps {
  pdf: PDFUpload;
  onClose: () => void;
  onJobsCreated: () => void;
}

export function PDFDetailModal({ pdf, onClose, onJobsCreated }: PDFDetailModalProps) {
  const [locations, setLocations] = useState<(Location & { jobCount?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [priority, setPriority] = useState<JobPriority>('NORMAL');
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch locations from this PDF
        const result = await pdfApi.getLocations(pdf.id);
        setLocations(result.locations as (Location & { jobCount?: number })[]);

        // Fetch technicians for assignment (this would need an API endpoint)
        // For now, we'll leave this empty and add it later
      } catch (err) {
        console.error('Failed to fetch PDF locations:', err);
        setError('Failed to load locations');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [pdf.id]);

  const toggleLocation = (locationId: string) => {
    setSelectedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) {
        next.delete(locationId);
      } else {
        next.add(locationId);
      }
      return next;
    });
  };

  const selectAll = () => {
    const geocodedLocations = locations.filter((loc) => loc.geocoded);
    setSelectedLocations(new Set(geocodedLocations.map((loc) => loc.id)));
  };

  const deselectAll = () => {
    setSelectedLocations(new Set());
  };

  const handleCreateJobs = async () => {
    if (selectedLocations.size === 0) {
      setError('Please select at least one location');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const result = await pdfApi.createJobs(
        pdf.id,
        Array.from(selectedLocations),
        priority,
        selectedTechnician || undefined
      );

      setSuccess(`Successfully created ${result.created} jobs!`);
      setTimeout(() => {
        onJobsCreated();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create jobs');
    } finally {
      setCreating(false);
    }
  };

  const geocodedCount = locations.filter((l) => l.geocoded).length;
  const failedCount = locations.filter((l) => l.geocodeFailed).length;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{pdf.originalName}</h2>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              {pdf.substationName && <span>Substation: {pdf.substationName}</span>}
              {pdf.drawingNumber && <span>Drawing #: {pdf.drawingNumber}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
            </div>
          ) : locations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p>No locations extracted from this PDF</p>
              {pdf.errorMessage && (
                <p className="text-red-500 text-sm mt-2">{pdf.errorMessage}</p>
              )}
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="flex items-center gap-4 mb-4 text-sm">
                <span className="text-gray-600">
                  {locations.length} locations extracted
                </span>
                <span className="text-green-600">
                  {geocodedCount} geocoded
                </span>
                {failedCount > 0 && (
                  <span className="text-orange-600">
                    {failedCount} need manual coordinates
                  </span>
                )}
              </div>

              {/* Selection controls */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={selectAll}
                  className="text-sm text-primary-600 hover:text-primary-800"
                >
                  Select all geocoded
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={deselectAll}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Deselect all
                </button>
                {selectedLocations.size > 0 && (
                  <span className="ml-auto text-sm font-medium text-primary-600">
                    {selectedLocations.size} selected
                  </span>
                )}
              </div>

              {/* Location list */}
              <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {locations.map((location) => (
                  <label
                    key={location.id}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedLocations.has(location.id)
                        ? 'bg-primary-50 border border-primary-200'
                        : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
                    } ${!location.geocoded ? 'opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLocations.has(location.id)}
                      onChange={() => toggleLocation(location.id)}
                      disabled={!location.geocoded}
                      className="mt-1 h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          Stand {location.standNo}
                        </span>
                        <span className="text-gray-500 text-sm">
                          {location.township}
                        </span>
                        {location.geocoded && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
                            Geocoded
                          </span>
                        )}
                        {location.geocodeFailed && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                            Manual entry needed
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">{location.address}</p>
                      {location.lat && location.lng && (
                        <p className="text-xs text-gray-400">
                          {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              {/* Job creation options */}
              {selectedLocations.size > 0 && (
                <div className="mt-6 space-y-4 pt-4 border-t border-gray-200">
                  <h4 className="font-medium text-gray-900">Create Jobs</h4>

                  {/* Priority */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Priority
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as JobPriority)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="URGENT">Urgent</option>
                      <option value="HIGH">High</option>
                      <option value="NORMAL">Normal</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>

                  {/* Technician assignment (optional) */}
                  {technicians.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Assign to Technician (optional)
                      </label>
                      <select
                        value={selectedTechnician}
                        onChange={(e) => setSelectedTechnician(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="">Leave unassigned</option>
                        {technicians.map((tech) => (
                          <option key={tech.id} value={tech.id}>
                            {tech.name} ({tech.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <p className="text-sm text-gray-500">
                    This will create {selectedLocations.size} job(s) from the selected locations.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Messages */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 text-sm">{success}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateJobs}
            disabled={selectedLocations.size === 0 || creating || !locations.length}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Creating...
              </span>
            ) : (
              `Create ${selectedLocations.size} Job${selectedLocations.size !== 1 ? 's' : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
