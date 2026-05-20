import { EQProcessor } from './EQProcessor';
import { CompressorProcessor } from './CompressorProcessor';
import type { AudioStatus } from '../shared/types';

// Owns the AudioContext and orchestrates the audio graph:
//   source -> EQ -> [compressor?] -> gain -> analyser -> destination
//
// Each subprocessor is responsible for its own internal nodes; AudioChain
// rebuilds the connections whenever the topology changes.
export class AudioChain {
  readonly ctx: AudioContext;
  readonly eq: EQProcessor;
  readonly compressor: CompressorProcessor;

  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private masterGain = 1.0;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.eq = new EQProcessor(this.ctx);
    this.compressor = new CompressorProcessor(this.ctx);
  }

  async attachStream(streamId: string, onEnded: () => void): Promise<void> {
    this.cleanup();
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as any,
      video: false,
    });
    const track = this.mediaStream.getAudioTracks()[0];
    if (track) track.addEventListener('ended', onEnded);

    this.sourceNode = this.ctx.createMediaStreamSource(this.mediaStream);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.rebuild();
  }

  // Re-wires the graph from scratch. Safe to call whenever a node is added,
  // removed, or the compressor's enable state flips.
  rebuild(): void {
    if (!this.sourceNode) return;

    this.sourceNode.disconnect();
    this.eq.disconnectAll();
    this.compressor.disconnect();
    if (this.gainNode) this.gainNode.disconnect();
    if (this.analyserNode) this.analyserNode.disconnect();

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this.masterGain;

    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 2048;

    let tail: AudioNode = this.eq.connectChain(this.sourceNode);

    if (this.compressor.isEnabled) {
      tail.connect(this.compressor.input);
      tail = this.compressor.output;
    }

    tail.connect(this.gainNode);
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);
  }

  setMasterGain(gain: number): void {
    this.masterGain = gain;
    if (this.gainNode) this.gainNode.gain.value = gain;
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyserNode) return null;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(data);
    return data;
  }

  getStatus(): AudioStatus {
    return {
      masterGain: this.masterGain,
      filters: this.eq.snapshot(),
      compressor: this.compressor.snapshot(),
    };
  }

  cleanup(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
  }
}
