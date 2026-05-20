import type { FilterConfig } from '../shared/types';

// Manages an ordered chain of BiquadFilterNodes.
// Owns no connections to the wider graph — the caller (AudioChain) wires input/output.
export class EQProcessor {
  private filters = new Map<number, BiquadFilterNode>();
  private order: number[] = [];

  constructor(private readonly ctx: AudioContext) {}

  add(nodeId: number, frequency: number): boolean {
    if (this.filters.has(nodeId)) return false;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = frequency;
    filter.Q.value = 1.0;
    filter.gain.value = 0;
    this.filters.set(nodeId, filter);
    this.order.push(nodeId);
    return true;
  }

  remove(nodeId: number): boolean {
    const filter = this.filters.get(nodeId);
    if (!filter) return false;
    filter.disconnect();
    this.filters.delete(nodeId);
    this.order = this.order.filter((id) => id !== nodeId);
    return true;
  }

  update(nodeId: number, config: Partial<FilterConfig>): void {
    const filter = this.filters.get(nodeId);
    if (!filter) return;
    if (config.type) filter.type = config.type;
    if (config.frequency !== undefined) filter.frequency.value = config.frequency;
    if (config.Q !== undefined) filter.Q.value = config.Q;
    if (config.gain !== undefined) filter.gain.value = config.gain;
  }

  // Wires `source -> filter[0] -> filter[1] -> ... -> filter[N-1]`
  // and returns the tail of the chain. If empty, returns `source` unchanged.
  connectChain(source: AudioNode): AudioNode {
    let tail: AudioNode = source;
    for (const id of this.order) {
      const filter = this.filters.get(id);
      if (filter) {
        tail.connect(filter);
        tail = filter;
      }
    }
    return tail;
  }

  // Disconnects every owned filter from whatever it was connected to.
  disconnectAll(): void {
    for (const filter of this.filters.values()) filter.disconnect();
  }

  snapshot() {
    return this.order.map((id) => {
      const f = this.filters.get(id)!;
      return {
        nodeId: id,
        id,
        type: f.type,
        frequency: f.frequency.value,
        Q: f.Q.value,
        gain: f.gain.value,
      };
    });
  }
}
