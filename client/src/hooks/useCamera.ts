import { useState, useRef, useCallback } from 'react';

interface UseCameraOptions {
  facingMode?: 'user' | 'environment';
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}

interface CameraState {
  isCapturing: boolean;
  error: string | null;
  preview: string | null;
}

export function useCamera(options: UseCameraOptions = {}) {
  const { facingMode = 'environment', quality = 0.8, maxWidth = 1920, maxHeight = 1080 } = options;

  const [state, setState] = useState<CameraState>({
    isCapturing: false,
    error: null,
    preview: null,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start camera stream
  const startCamera = useCallback(async (video: HTMLVideoElement) => {
    try {
      setState((prev) => ({ ...prev, isCapturing: false, error: null }));

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: maxWidth },
          height: { ideal: maxHeight },
        },
        audio: false,
      });

      video.srcObject = stream;
      videoRef.current = video;
      streamRef.current = stream;

      await video.play();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to access camera';
      setState((prev) => ({ ...prev, error: message }));
    }
  }, [facingMode, maxWidth, maxHeight]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Capture photo from video stream
  const capturePhoto = useCallback(async (): Promise<Blob | null> => {
    if (!videoRef.current) {
      setState((prev) => ({ ...prev, error: 'Camera not started' }));
      return null;
    }

    setState((prev) => ({ ...prev, isCapturing: true }));

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');

      // Use video dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      ctx.drawImage(video, 0, 0);

      // Convert to blob
      return new Promise((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const preview = URL.createObjectURL(blob);
              setState((prev) => ({ ...prev, isCapturing: false, preview }));
            }
            resolve(blob);
          },
          'image/jpeg',
          quality
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to capture photo';
      setState((prev) => ({ ...prev, isCapturing: false, error: message }));
      return null;
    }
  }, [quality]);

  // Clear preview
  const clearPreview = useCallback(() => {
    if (state.preview) {
      URL.revokeObjectURL(state.preview);
    }
    setState((prev) => ({ ...prev, preview: null }));
  }, [state.preview]);

  // Use file input as fallback
  const captureFromInput = useCallback(async (file: File): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          // Resize if needed
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  const preview = URL.createObjectURL(blob);
                  setState((prev) => ({ ...prev, preview }));
                }
                resolve(blob);
              },
              'image/jpeg',
              quality
            );
          } else {
            resolve(null);
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }, [quality, maxWidth, maxHeight]);

  return {
    ...state,
    startCamera,
    stopCamera,
    capturePhoto,
    clearPreview,
    captureFromInput,
    hasCamera: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
  };
}
