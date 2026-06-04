import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VoiceRecorder } from '../VoiceRecorder';
import { useVoiceRecorder } from '../../../hooks/useVoiceRecorder';

// Mock the hook to control state for tests
jest.mock('../../../hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: jest.fn(),
}));

describe('VoiceRecorder Component', () => {
  beforeEach(() => {
    (useVoiceRecorder as jest.Mock).mockReturnValue({
      status: 'idle',
      isRecording: false,
      uploadProgress: 0,
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly in idle state', () => {
    render(<VoiceRecorder />);
    expect(screen.getByTestId('recorder-status')).toHaveTextContent('idle');
    expect(screen.getByTestId('upload-progress')).toHaveTextContent('0%');
  });

  it('calls startRecording when Start button is clicked', () => {
    const mockStart = jest.fn();
    (useVoiceRecorder as jest.Mock).mockReturnValue({
      status: 'idle',
      isRecording: false,
      uploadProgress: 0,
      startRecording: mockStart,
      stopRecording: jest.fn(),
      error: null,
    });

    render(<VoiceRecorder />);
    fireEvent.click(screen.getByTestId('start-btn'));
    expect(mockStart).toHaveBeenCalled();
  });

  it('displays recording state appropriately', () => {
    (useVoiceRecorder as jest.Mock).mockReturnValue({
      status: 'recording',
      isRecording: true,
      uploadProgress: 0,
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      error: null,
    });

    render(<VoiceRecorder />);
    expect(screen.getByTestId('recorder-status')).toHaveTextContent('recording');
    // Ensure that UI indicates active recording (we'll add actual UI elements later, this will just fail for now or pass based on basic implementation)
  });

  it('displays progress correctly during upload', () => {
    (useVoiceRecorder as jest.Mock).mockReturnValue({
      status: 'uploading',
      isRecording: false,
      uploadProgress: 45,
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      error: null,
    });

    render(<VoiceRecorder />);
    expect(screen.getByTestId('recorder-status')).toHaveTextContent('uploading');
    
    // We expect a progress bar with aria-valuenow to exist (this will fail as we don't have it)
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '45');
  });

  it('displays error message if error occurs', () => {
    (useVoiceRecorder as jest.Mock).mockReturnValue({
      status: 'error',
      isRecording: false,
      uploadProgress: 0,
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      error: 'Microphone permission denied',
    });

    render(<VoiceRecorder />);
    expect(screen.getByTestId('recorder-error')).toHaveTextContent('Microphone permission denied');
  });
});
