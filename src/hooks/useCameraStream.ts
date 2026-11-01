import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';

export type CameraPermissionStatus = 'prompt' | 'granted' | 'denied' | 'unavailable' | 'unsupported';
export type CameraFacingMode = 'environment' | 'user';

export interface UseCameraStreamOptions {
  initialFacingMode?: CameraFacingMode;
  autoStart?: boolean;
}

export interface UseCameraStreamReturn {
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  isStreaming: boolean;
  permissionStatus: CameraPermissionStatus;
  facingMode: CameraFacingMode;
  hasCameraDevices: boolean;
  error: string | null;
  startStream: (mode?: CameraFacingMode) => Promise<boolean>;
  stopStream: () => void;
  switchCamera: () => void;
  captureFrame: (maxWidth?: number, maxHeight?: number) => string | null;
}

export const useCameraStream = (options: UseCameraStreamOptions = {}): UseCameraStreamReturn => {
  const { initialFacingMode = 'environment', autoStart = false } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [permissionStatus, setPermissionStatus] = useState<CameraPermissionStatus>('prompt');
  const [facingMode, setFacingMode] = useState<CameraFacingMode>(initialFacingMode);
  const [hasCameraDevices, setHasCameraDevices] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  const startStream = useCallback(
    async (mode?: CameraFacingMode): Promise<boolean> => {
      stopStream();
      const targetMode = mode || facingMode;

      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setPermissionStatus('unsupported');
        setError('Camera API is not supported in this browser environment');
        return false;
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: targetMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        setPermissionStatus('granted');
        setIsStreaming(true);
        setError(null);
        if (mode) setFacingMode(mode);
        return true;
      } catch (err: unknown) {
        const domErr = err as { name?: string; message?: string };
        const errName = domErr?.name || '';

        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setPermissionStatus('denied');
          setError('Camera permission was denied. Please allow camera access in your browser settings.');
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setPermissionStatus('unavailable');
          setHasCameraDevices(false);
          setError('No camera device detected.');
        } else {
          setPermissionStatus('unavailable');
          setError(domErr?.message || 'Unable to access camera.');
        }
        setIsStreaming(false);
        return false;
      }
    },
    [facingMode, stopStream]
  );

  const switchCamera = useCallback(() => {
    const nextMode: CameraFacingMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startStream(nextMode);
  }, [facingMode, startStream]);

  const captureFrame = useCallback((maxWidth = 800, maxHeight = 800): string | null => {
    if (!videoRef.current || videoRef.current.videoWidth === 0) {
      return null;
    }
    const video = videoRef.current;
    const canvas = document.createElement('canvas');

    let width = video.videoWidth;
    let height = video.videoHeight;

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  useEffect(() => {
    if (autoStart) {
      startStream();
    }
    return () => {
      stopStream();
    };
  }, [autoStart, startStream, stopStream]);

  return {
    videoRef,
    stream: streamRef.current,
    isStreaming,
    permissionStatus,
    facingMode,
    hasCameraDevices,
    error,
    startStream,
    stopStream,
    switchCamera,
    captureFrame,
  };
};
