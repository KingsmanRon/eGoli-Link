import { useState, useEffect } from 'react';
import { usersApi } from '../../services/api';
import { useAssignJob } from '../../hooks/useJobs';

interface Technician {
  id: string;
  name: string;
  email: string;
  activeJobs: number;
}

interface AssignTechnicianModalProps {
  jobId: string;
  jobTitle: string;
  currentAssignee?: { id: string; name: string } | null;
  onClose: () => void;
  onAssigned: () => void;
}

export function AssignTechnicianModal({
  jobId,
  jobTitle,
  currentAssignee,
  onClose,
  onAssigned,
}: AssignTechnicianModalProps) {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTechnician, setSelectedTechnician] = useState<string>(currentAssignee?.id || '');
  const [error, setError] = useState<string | null>(null);
  const assignJob = useAssignJob();

  useEffect(() => {
    const fetchTechnicians = async () => {
      try {
        const list = await usersApi.getTechnicians();
        setTechnicians(list);
      } catch (err) {
        setError('Failed to load technicians');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTechnicians();
  }, []);

  const handleAssign = async () => {
    if (!selectedTechnician) {
      setError('Please select a technician');
      return;
    }

    try {
      await assignJob.mutateAsync({ jobId, technicianId: selectedTechnician });
      onAssigned();
    } catch (err) {
      setError('Failed to assign job');
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {currentAssignee ? 'Reassign Job' : 'Assign Job'}
          </h2>
          <p className="text-sm text-gray-500 truncate">{jobTitle}</p>
        </div>

        <div className="px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
            </div>
          ) : technicians.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No technicians available</p>
              <p className="text-sm mt-1">Create technician accounts in User Management</p>
            </div>
          ) : (
            <>
              {currentAssignee && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    Currently assigned to: <span className="font-medium">{currentAssignee.name}</span>
                  </p>
                </div>
              )}

              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Technician
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {technicians.map((tech) => (
                  <label
                    key={tech.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${
                      selectedTechnician === tech.id
                        ? 'bg-primary-50 border-primary-300'
                        : 'bg-gray-50 border-transparent hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="technician"
                      value={tech.id}
                      checked={selectedTechnician === tech.id}
                      onChange={(e) => setSelectedTechnician(e.target.value)}
                      className="h-4 w-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{tech.name}</p>
                      <p className="text-sm text-gray-500">{tech.email}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      tech.activeJobs === 0
                        ? 'bg-green-100 text-green-700'
                        : tech.activeJobs <= 3
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {tech.activeJobs} job{tech.activeJobs !== 1 ? 's' : ''}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedTechnician || assignJob.isPending || technicians.length === 0}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {assignJob.isPending ? 'Assigning...' : currentAssignee ? 'Reassign' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}
