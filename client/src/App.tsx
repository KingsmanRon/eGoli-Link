import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Header } from './components/Layout/Header';
import { BottomNav } from './components/Layout/BottomNav';
import { JobList } from './components/DispatchQueue/JobList';
import { JobDetailView } from './components/JobDetail/JobDetailView';
import { MapView } from './components/Map/MapView';
import { UploadZone } from './components/PDFUpload/UploadZone';
import { PDFManagement } from './components/PDFUpload/PDFManagement';
import { getAccessToken, authApi } from './services/api';
import { initDB } from './services/offlineStorage';
import { AuthProvider, useAuth } from './hooks/useAuth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
});

// Login Page
function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await authApi.login(email, password);
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-citypower-gold rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-primary-900">eG</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">eGoli-Link</h1>
          <p className="text-gray-600">City Power Field Dispatch</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="technician@citypower.co.za"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Enter password"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Dashboard Page
function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header title="eGoli-Link" />
      <div className="p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">My Jobs</h2>
        <JobList showFilters={false} showAll={false} />
      </div>
      <BottomNav />
    </div>
  );
}

// All Jobs Page
function JobsPage() {
  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header title="All Jobs" />
      <JobList showFilters={true} showAll={true} />
      <BottomNav />
    </div>
  );
}

// Map Page
function MapPage() {
  return (
    <div className="h-screen flex flex-col">
      <Header title="Map View" />
      <div className="flex-1">
        <MapView />
      </div>
      <BottomNav />
    </div>
  );
}

// Upload Page (Admin/Supervisor only)
function UploadPage() {
  const { canUploadPDF } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  if (!canUploadPDF) {
    return <Navigate to="/" replace />;
  }

  const handleUploadComplete = () => {
    // Refresh the PDF management list after upload
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header title="PDF Management" />
      <div className="p-4 space-y-6">
        {/* Upload Zone */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Upload New PDF</h2>
          <UploadZone onUploadComplete={handleUploadComplete} />
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-2">Instructions</h3>
          <ul className="text-sm text-gray-600 space-y-2">
            <li>• Upload City Power operational diagrams (PDF format)</li>
            <li>• System extracts MSS, HVC, and Load Centre schedule tables</li>
            <li>• Locations are automatically geocoded for map display</li>
            <li>• Click on a PDF below to view locations and create jobs</li>
          </ul>
        </div>

        {/* PDF Management */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Manage Uploaded PDFs</h2>
          <PDFManagement key={refreshKey} />
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = getAccessToken();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Main App
function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initDB().then(() => setDbReady(true));
  }, []);

  if (!dbReady) {
    return (
      <div className="min-h-screen bg-primary-800 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin w-12 h-12 border-4 border-white border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading eGoli-Link...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/jobs"
              element={
                <ProtectedRoute>
                  <JobsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/jobs/:id"
              element={
                <ProtectedRoute>
                  <JobDetailView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/map"
              element={
                <ProtectedRoute>
                  <MapPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/upload"
              element={
                <ProtectedRoute>
                  <UploadPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
