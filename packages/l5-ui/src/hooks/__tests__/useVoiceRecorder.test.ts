import { renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useVoiceRecorder } from '../useVoiceRecorder';
import Uppy from '@uppy/core';

jest.mock('@uppy/core', () => {
  return jest.fn().mockImplementation(() => {
    const handlers: any = {};
    return {
      use: jest.fn(),
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
      getPlugin: jest.fn().mockReturnValue({
        startRecording: jest.fn(),
        stopRecording: jest.fn().mockResolvedValue(undefined),
      }),
      upload: jest.fn(),
      close: jest.fn(),
      emit: (event: string, ...args: any[]) => {
        if (handlers[event]) {
          handlers[event](...args);
        }
      },
    };
  });
});

jest.mock('../../utils/uppy-tus-client', () => ({
  configureUppyTus: jest.fn(),
}));

describe('useVoiceRecorder', () => {
  let mockGetUserMedia: jest.Mock;

  beforeEach(() => {
    mockGetUserMedia = jest.fn().mockResolvedValue({
      getTracks: () => [{ stop: jest.fn() }],
    });
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
    });
    jest.clearAllMocks();
  });

  it('should initialize with idle status', () => {
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.status).toBe('idle');
    expect(result.current.isRecording).toBe(false);
    expect(result.current.uploadProgress).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('should change status to recording when startRecording is called', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.startRecording();
    });
    expect(result.current.status).toBe('recording');
    expect(result.current.isRecording).toBe(true);
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it('should change status when stopRecording is called', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.startRecording();
    });
    
    await act(async () => {
      result.current.stopRecording();
    });
    
    expect(result.current.status).toBe('uploading');
    expect(result.current.isRecording).toBe(false);
  });

  it('should handle uppy upload progress and success', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    const uppyInstance = result.current.uppy as any;

    act(() => {
      uppyInstance.emit('upload-progress', {}, { bytesUploaded: 50, bytesTotal: 100 });
    });
    expect(result.current.status).toBe('uploading');
    expect(result.current.uploadProgress).toBe(50);

    act(() => {
      uppyInstance.emit('upload-success');
    });
    expect(result.current.status).toBe('completed');
    expect(result.current.uploadProgress).toBe(100);
  });

  it('should handle uppy error', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    const uppyInstance = result.current.uppy as any;

    act(() => {
      uppyInstance.emit('error', new Error('Upload failed'));
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Upload failed');
  });

  it('should handle microphone permission denial', async () => {
    mockGetUserMedia.mockRejectedValue(new Error('Permission denied'));
    const { result } = renderHook(() => useVoiceRecorder());
    
    await act(async () => {
      await result.current.startRecording();
    });
    
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Permission denied');
  });
});
