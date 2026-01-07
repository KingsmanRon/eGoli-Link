import { useState, useEffect } from 'react';
import { pdfApi } from '../../services/api';
import type { PDFUpload, ExtractionStatus } from '../../types';
import { PDFDetailModal } from './PDFDetailModal';

export function PDFManagement() {
  const [pdfs, setPdfs] = useState<(PDFUpload & { _count?: { jobs: number } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPdf, setSelectedPdf] = useState<PDFUpload | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchPdfs = async () => {
    try {
      const response = await pdfApi.list(page, 10);
      setPdfs(response.data as (PDFUpload & { _count?: { jobs: number } })[]);
      setTotalPages(response.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch PDFs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPdfs();
  }, [page]);

  const getStatusBadge = (status: ExtractionStatus) => {
    const styles: Record<ExtractionStatus, string> = {
      PENDING: 'bg-gray-100 text-gray-800',
      PROCESSING: 'bg-blue-100 text-blue-800',
      COMPLETED: 'bg-green-100 text-green-800',
      FAILED: 'bg-red-100 text-red-800',
    };

    const labels: Record<ExtractionStatus, string> = {
      PENDING: 'Pending',
      PROCESSING: 'Processing',
      COMPLETED: 'Completed',
      FAILED: 'Failed',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
        {status === 'PROCESSING' && (
          <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        )}
        {labels[status]}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Uploaded PDFs</h3>
          <p className="text-sm text-gray-500">View extraction status and create jobs from locations</p>
        </div>

        {pdfs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>No PDFs uploaded yet</p>
            <p className="text-sm">Upload a PDF above to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {pdfs.map((pdf) => (
              <div
                key={pdf.id}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setSelectedPdf(pdf)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                      <span className="font-medium text-gray-900 truncate">{pdf.originalName}</span>
                      {getStatusBadge(pdf.extractionStatus)}
                    </div>

                    <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                      {pdf.substationName && (
                        <span>Substation: {pdf.substationName}</span>
                      )}
                      {pdf.drawingNumber && (
                        <span>Drawing: {pdf.drawingNumber}</span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                      <span>Uploaded: {formatDate(pdf.createdAt)}</span>
                      {pdf.extractionStatus === 'COMPLETED' && (
                        <>
                          <span className="text-green-600">
                            {pdf.extractedCount} locations extracted
                          </span>
                          {pdf._count && (
                            <span className="text-blue-600">
                              {pdf._count.jobs} jobs created
                            </span>
                          )}
                        </>
                      )}
                      {pdf.extractionStatus === 'FAILED' && pdf.errorMessage && (
                        <span className="text-red-500 truncate max-w-xs" title={pdf.errorMessage}>
                          Error: {pdf.errorMessage}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="ml-4 flex-shrink-0">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedPdf && (
        <PDFDetailModal
          pdf={selectedPdf}
          onClose={() => setSelectedPdf(null)}
          onJobsCreated={() => {
            fetchPdfs();
            setSelectedPdf(null);
          }}
        />
      )}
    </>
  );
}
