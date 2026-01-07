import { useState, useRef } from 'react';
import { useCamera } from '../../hooks/useCamera';

interface PhotoCaptureProps {
  onCapture: (blob: Blob, caption?: string) => void;
  onCancel: () => void;
}

export function PhotoCapture({ onCapture, onCancel }: PhotoCaptureProps) {
  const [mode, setMode] = useState<'select' | 'camera' | 'preview'>('select');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [caption, setCaption] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startCamera, stopCamera, capturePhoto, preview, clearPreview, captureFromInput, hasCamera } = useCamera();

  const handleStartCamera = async () => {
    if (videoRef.current) {
      await startCamera(videoRef.current);
      setMode('camera');
    }
  };

  const handleCapture = async () => {
    const blob = await capturePhoto();
    if (blob) {
      setCapturedBlob(blob);
      stopCamera();
      setMode('preview');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const blob = await captureFromInput(file);
      if (blob) {
        setCapturedBlob(blob);
        setMode('preview');
      }
    }
  };

  const handleConfirm = () => {
    if (capturedBlob) {
      onCapture(capturedBlob, caption || undefined);
    }
  };

  const handleRetake = () => {
    setCapturedBlob(null);
    clearPreview();
    setMode('select');
  };

  if (mode === 'select') {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Add Photo</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {hasCamera && (
            <button
              onClick={handleStartCamera}
              className="w-full flex items-center justify-center gap-3 bg-primary-600 text-white py-4 rounded-lg font-medium hover:bg-primary-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Take Photo
            </button>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-3 bg-gray-100 text-gray-700 py-4 rounded-lg font-medium hover:bg-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Choose from Gallery
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>
    );
  }

  if (mode === 'camera') {
    return (
      <div className="bg-black">
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full aspect-[4/3] object-cover"
          />

          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60">
            <div className="flex items-center justify-center gap-8">
              <button
                onClick={() => {
                  stopCamera();
                  setMode('select');
                }}
                className="w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <button
                onClick={handleCapture}
                className="w-16 h-16 rounded-full bg-white flex items-center justify-center"
              >
                <div className="w-14 h-14 rounded-full border-4 border-primary-600" />
              </button>

              <div className="w-12" /> {/* Spacer for symmetry */}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'preview' && preview) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Review Photo</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <img
          src={preview}
          alt="Captured photo"
          className="w-full aspect-[4/3] object-cover rounded-lg mb-4"
        />

        <input
          type="text"
          placeholder="Add a caption (optional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
        />

        <div className="flex gap-3">
          <button
            onClick={handleRetake}
            className="flex-1 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
          >
            Retake
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
          >
            Use Photo
          </button>
        </div>
      </div>
    );
  }

  return null;
}
