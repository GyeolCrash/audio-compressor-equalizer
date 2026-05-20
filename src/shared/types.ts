// Shared types for audio processing & UI communication.
// Used by both popup (UI) and offscreen (audio engine).

export interface FilterConfig {
  type: BiquadFilterType;
  frequency: number;
  Q: number;
  gain: number;
}

export interface EQNodeState {
  id: number;
  frequency: number;
  Q: number;
  gain: number;
  type: BiquadFilterType;
}

export interface CompressorConfig {
  threshold: number; // dB, -100..0
  knee: number;      // dB, 0..40
  ratio: number;     // 1..20
  attack: number;    // seconds, 0..1
  release: number;   // seconds, 0..1
}

export interface CompressorState extends CompressorConfig {
  enabled: boolean;
}

export const DEFAULT_COMPRESSOR_STATE: CompressorState = {
  enabled: false,
  threshold: -24,
  knee: 30,
  ratio: 12,
  attack: 0.003,
  release: 0.25,
};

export interface AudioStatus {
  masterGain: number;
  filters: Array<EQNodeState & { nodeId: number }>;
  compressor: CompressorState;
}

// Message types crossing popup <-> background <-> offscreen.
export type MessageType =
  | 'GET_STATUS'
  | 'SYNC_STATUS'
  | 'SYNC_FREQUENCY_DATA'
  | 'GET_FREQUENCY_DATA'
  | 'GET_COMPRESSOR_REDUCTION'
  | 'SYNC_COMPRESSOR_REDUCTION'
  | 'ADD_FILTER'
  | 'UPDATE_FILTER'
  | 'REMOVE_FILTER'
  | 'SET_MASTER_GAIN'
  | 'UPDATE_COMPRESSOR'
  | 'SET_COMPRESSOR_ENABLED'
  | 'START_CAPTURE'
  | 'STOP_CAPTURE'
  | 'SETUP_MEDIA_STREAM'
  | 'CLEANUP_MEDIA_STREAM'
  | 'STREAM_ENDED'
  | 'OFFSCREEN_READY'
  | 'PING_OFFSCREEN';
