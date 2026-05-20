import { DEFAULT_COMPRESSOR_STATE, type CompressorConfig, type CompressorState } from '../shared/types';

// Wraps a DynamicsCompressorNode and remembers params even when bypassed
// so re-enabling restores the user's last configuration.
export class CompressorProcessor {
  private node: DynamicsCompressorNode;
  private state: CompressorState = { ...DEFAULT_COMPRESSOR_STATE };

  constructor(private readonly ctx: AudioContext) {
    this.node = ctx.createDynamicsCompressor();
    this.applyParams();
  }

  get input(): AudioNode {
    return this.node;
  }

  get output(): AudioNode {
    return this.node;
  }

  get isEnabled(): boolean {
    return this.state.enabled;
  }

  // Returns the live gain reduction in dB (always <= 0). 0 means no compression.
  getReduction(): number {
    return this.node.reduction;
  }

  setEnabled(enabled: boolean): void {
    this.state.enabled = enabled;
  }

  update(config: Partial<CompressorConfig>): void {
    if (config.threshold !== undefined) this.state.threshold = config.threshold;
    if (config.knee !== undefined) this.state.knee = config.knee;
    if (config.ratio !== undefined) this.state.ratio = config.ratio;
    if (config.attack !== undefined) this.state.attack = config.attack;
    if (config.release !== undefined) this.state.release = config.release;
    this.applyParams();
  }

  disconnect(): void {
    this.node.disconnect();
  }

  snapshot(): CompressorState {
    return { ...this.state };
  }

  private applyParams(): void {
    const now = this.ctx.currentTime;
    this.node.threshold.setValueAtTime(this.state.threshold, now);
    this.node.knee.setValueAtTime(this.state.knee, now);
    this.node.ratio.setValueAtTime(this.state.ratio, now);
    this.node.attack.setValueAtTime(this.state.attack, now);
    this.node.release.setValueAtTime(this.state.release, now);
  }
}
