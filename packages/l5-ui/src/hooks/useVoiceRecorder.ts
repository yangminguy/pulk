import { useState, useCallback, useEffect, useRef } from 'react';
import Uppy from '@uppy/core';
import Audio from '@uppy/audio';
import { configureUppyTus } from '../utils/uppy-tus-client';

type RecorderStatus = 'idle' | 'recording' | 'uploading' | 'completed' | 'error';

export const useVoiceRecorder = () => {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uppyRef = useRef<Uppy | null>(null);

  useEffect(() => {
    const uppy = new Uppy({
      restrictions: {
        maxNumberOfFiles: 1,
        allowedFileTypes: ['audio/*'],
      },
    });

    uppy.use(Audio, {
      target: null, // Headless or custom UI
    });

    configureUppyTus(uppy, '/upload'); // Mock endpoint

    uppy.on('upload-progress', (file, progress) => {
      setStatus('uploading');
      if (progress.bytesTotal) {
        setUploadProgress(Math.round((progress.bytesUploaded / progress.bytesTotal) * 100));
      }
    });

    uppy.on('upload-success', () => {
      setStatus('completed');
      setUploadProgress(100);
    });

    uppy.on('error', (err) => {
      setStatus('error');
      setError(err.message);
    });

    uppyRef.current = uppy;

    return () => {
      uppy.close({ reason: 'unmount' });
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      // Ensure microphone permissions
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatus('recording');
      
      const audioPlugin = uppyRef.current?.getPlugin('Audio');
      if (audioPlugin && (audioPlugin as any).startRecording) {
        (audioPlugin as any).startRecording();
      } else {
        // Mock fallback if UI plugin requires DOM
      }
    } catch (err) {
      setStatus('error');
      setError((err as Error).message || 'Microphone permission denied');
    }
  }, []);

  const stopRecording = useCallback(() => {
    const audioPlugin = uppyRef.current?.getPlugin('Audio');
    if (audioPlugin && (audioPlugin as any).stopRecording) {
      (audioPlugin as any).stopRecording().then(() => {
        setStatus('uploading');
        uppyRef.current?.upload();
      });
    } else {
      setStatus('uploading');
    }
  }, []);

  const pauseRecording = useCallback(() => {}, []);
  const resumeRecording = useCallback(() => {}, []);

  return {
    status,
    isRecording: status === 'recording',
    uploadProgress,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    setUploadProgress,
    setStatus,
    setError,
    uppy: uppyRef.current,
  };
};
