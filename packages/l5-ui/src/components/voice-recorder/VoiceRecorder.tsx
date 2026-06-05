import React from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';

export const VoiceRecorder: React.FC = () => {
  const { status, isRecording, uploadProgress, startRecording, stopRecording, pauseRecording, resumeRecording, error } = useVoiceRecorder();

  return (
    <div data-testid="voice-recorder" className="voice-recorder-container" style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', maxWidth: '400px' }}>
      <h3 style={{ margin: '0 0 16px' }}>Voice Recorder</h3>
      
      <div data-testid="recorder-status" style={{ marginBottom: '12px', fontWeight: 'bold' }}>
        {status}
      </div>

      {error && (
        <div data-testid="recorder-error" style={{ color: 'red', marginBottom: '12px', padding: '8px', background: '#ffebee', borderRadius: '4px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {!isRecording && status !== 'uploading' && (
          <button data-testid="start-btn" onClick={startRecording} style={{ padding: '8px 16px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Start Recording
          </button>
        )}
        
        {isRecording && (
          <button data-testid="stop-btn" onClick={stopRecording} style={{ padding: '8px 16px', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Stop & Upload
          </button>
        )}
      </div>

      {status === 'uploading' && (
        <div style={{ width: '100%', background: '#eee', borderRadius: '4px', overflow: 'hidden', height: '12px', marginBottom: '8px' }}>
          <div 
            role="progressbar" 
            aria-valuenow={uploadProgress} 
            aria-valuemin={0} 
            aria-valuemax={100} 
            style={{ width: `${uploadProgress}%`, background: '#2196F3', height: '100%', transition: 'width 0.3s ease' }} 
          />
        </div>
      )}
      <div data-testid="upload-progress" style={{ fontSize: '14px', color: '#666' }}>
        {uploadProgress}%
      </div>
    </div>
  );
};
