import { Link } from 'react-router-dom';
import type { Job } from '../../types';
import {
  getStatusColor,
  getStatusLabel,
  getPriorityColor,
  getPriorityLabel,
  formatRelativeTime,
} from '../../utils/formatters';
import { openWazeNavigation } from '../../services/wazeNavigation';

interface JobCardProps {
  job: Job;
  showNavigate?: boolean;
}

export function JobCard({ job, showNavigate = true }: JobCardProps) {
  const canNavigate = job.location.geocoded && job.location.lat && job.location.lng;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <Link to={`/jobs/${job.id}`} className="flex-1">
            <h3 className="font-semibold text-gray-900 hover:text-primary-600">
              {job.title}
            </h3>
          </Link>
          <span
            className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(
              job.priority
            )}`}
          >
            {getPriorityLabel(job.priority)}
          </span>
        </div>

        <div className="space-y-1 text-sm text-gray-600 mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span>{job.location.address}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <span>
              {job.location.township} - Stand {job.location.standNo}
            </span>
          </div>
          {job.equipmentId && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span>
                {job.equipmentId}
                {job.equipmentType && ` (${job.equipmentType})`}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(job.status)}`}>
              {getStatusLabel(job.status)}
            </span>
            <span className="text-xs text-gray-500">{formatRelativeTime(job.createdAt)}</span>
          </div>

          {showNavigate && canNavigate && (
            <button
              onClick={(e) => {
                e.preventDefault();
                openWazeNavigation({ lat: job.location.lat!, lng: job.location.lng! });
              }}
              className="flex items-center gap-1 bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Navigate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
