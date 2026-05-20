import type { BackgroundBridge } from '../messaging';
import { DEFAULT_COMPRESSOR_STATE, type CompressorConfig, type CompressorState } from '../../../shared/types';

// Renders two views of the compressor:
//   1) Transfer curve  — static input/output plot, redrawn when params change.
//   2) Gain-reduction meter — live, polled at ~60fps via the analyser bridge.
//
// All parameter changes are pushed to the offscreen audio engine via the bridge;
// the engine's authoritative state is replayed back through SYNC_STATUS messages
// so multiple popup instances stay coherent.
export class CompressorVisualizer {
  private curveCanvas: HTMLCanvasElement;
  private curveCtx: CanvasRenderingContext2D;
  private meterCanvas: HTMLCanvasElement;
  private meterCtx: CanvasRenderingContext2D;

  private state: CompressorState = { ...DEFAULT_COMPRESSOR_STATE };
  private reduction = 0; // dB, always <= 0
  private peakReduction = 0;
  private peakResetTimer: number | null = null;

  private rafId: number | null = null;

  constructor(private readonly bridge: BackgroundBridge) {
    this.curveCanvas = document.getElementById('compressorCurve') as HTMLCanvasElement;
    this.curveCtx = this.curveCanvas.getContext('2d')!;
    this.meterCanvas = document.getElementById('compressorMeter') as HTMLCanvasElement;
    this.meterCtx = this.meterCanvas.getContext('2d')!;

    this.subscribeBridge();
    this.setupControls();
    this.startAnimation();
    this.draw();
  }

  private subscribeBridge(): void {
    this.bridge.on((msg) => {
      if (msg.type === 'SYNC_STATUS' && msg.data?.compressor) {
        this.state = { ...msg.data.compressor };
        this.syncControlsFromState();
        this.draw();
      } else if (msg.type === 'SYNC_COMPRESSOR_REDUCTION') {
        this.reduction = msg.reduction ?? 0;
        if (this.reduction < this.peakReduction) {
          this.peakReduction = this.reduction;
          if (this.peakResetTimer !== null) clearTimeout(this.peakResetTimer);
          this.peakResetTimer = window.setTimeout(() => { this.peakReduction = 0; }, 1500);
        }
      }
    });
  }

  private setupControls(): void {
    const toggle = document.getElementById('compressorEnabled') as HTMLInputElement | null;
    toggle?.addEventListener('change', () => {
      this.state.enabled = toggle.checked;
      this.bridge.send({ type: 'SET_COMPRESSOR_ENABLED', enabled: toggle.checked });
      this.draw();
    });

    this.bindParam('threshold', -100, 0, 1, (v) => `${v.toFixed(0)} dB`);
    this.bindParam('knee', 0, 40, 1, (v) => `${v.toFixed(0)} dB`);
    this.bindParam('ratio', 1, 20, 0.1, (v) => `${v.toFixed(1)} : 1`);
    this.bindParam('attack', 0, 1, 0.001, (v) => `${(v * 1000).toFixed(1)} ms`);
    this.bindParam('release', 0, 1, 0.01, (v) => `${(v * 1000).toFixed(0)} ms`);

    document.getElementById('compressorReset')?.addEventListener('click', () => this.resetParams());

    document.addEventListener('themeChanged', () => this.draw());
  }

  private bindParam(
    name: keyof CompressorConfig,
    min: number,
    max: number,
    step: number,
    fmt: (v: number) => string,
  ): void {
    const slider = document.getElementById(`comp_${name}`) as HTMLInputElement | null;
    const display = document.getElementById(`comp_${name}_val`);
    if (!slider) return;
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(this.state[name]);
    if (display) display.textContent = fmt(this.state[name]);

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      (this.state[name] as number) = v;
      if (display) display.textContent = fmt(v);
      this.bridge.send({ type: 'UPDATE_COMPRESSOR', config: { [name]: v } });
      this.draw();
    });
  }

  private syncControlsFromState(): void {
    const toggle = document.getElementById('compressorEnabled') as HTMLInputElement | null;
    if (toggle) toggle.checked = this.state.enabled;

    const setSlider = (name: keyof CompressorConfig, fmt: (v: number) => string) => {
      const slider = document.getElementById(`comp_${name}`) as HTMLInputElement | null;
      const display = document.getElementById(`comp_${name}_val`);
      if (slider) slider.value = String(this.state[name]);
      if (display) display.textContent = fmt(this.state[name]);
    };
    setSlider('threshold', (v) => `${v.toFixed(0)} dB`);
    setSlider('knee', (v) => `${v.toFixed(0)} dB`);
    setSlider('ratio', (v) => `${v.toFixed(1)} : 1`);
    setSlider('attack', (v) => `${(v * 1000).toFixed(1)} ms`);
    setSlider('release', (v) => `${(v * 1000).toFixed(0)} ms`);
  }

  private resetParams(): void {
    this.state = { ...DEFAULT_COMPRESSOR_STATE, enabled: this.state.enabled };
    this.syncControlsFromState();
    const { enabled, ...config } = this.state;
    this.bridge.send({ type: 'UPDATE_COMPRESSOR', config });
    this.draw();
  }

  private startAnimation(): void {
    if (this.rafId !== null) return;
    const loop = () => {
      if (this.state.enabled) {
        this.bridge.send({ type: 'GET_COMPRESSOR_REDUCTION' });
      } else {
        this.reduction = 0;
        this.peakReduction = 0;
      }
      this.drawMeter();
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  private draw(): void {
    this.drawTransferCurve();
    this.drawMeter();
  }

  // Static input/output characteristic. X-axis spans -60..0 dB input,
  // Y-axis spans the same. The diagonal y=x is the no-compression reference.
  private drawTransferCurve(): void {
    const ctx = this.curveCtx;
    const W = this.curveCanvas.width;
    const H = this.curveCanvas.height;
    const padding = 32;
    const styles = getComputedStyle(document.documentElement);

    ctx.fillStyle = styles.getPropertyValue('--canvas-bg').trim() || '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    const minDb = -60;
    const maxDb = 0;
    const dbToX = (db: number) => padding + ((db - minDb) / (maxDb - minDb)) * (W - 2 * padding);
    const dbToY = (db: number) => H - padding - ((db - minDb) / (maxDb - minDb)) * (H - 2 * padding);

    // Grid
    ctx.strokeStyle = styles.getPropertyValue('--grid-line-1').trim() || '#2a2a2a';
    ctx.lineWidth = 1;
    [-60, -48, -36, -24, -12, 0].forEach((db) => {
      const x = dbToX(db);
      const y = dbToY(db);
      ctx.beginPath(); ctx.moveTo(x, padding); ctx.lineTo(x, H - padding); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(W - padding, y); ctx.stroke();
    });

    // Reference 1:1 diagonal (no compression)
    ctx.strokeStyle = styles.getPropertyValue('--grid-line-2').trim() || '#444444';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dbToX(minDb), dbToY(minDb));
    ctx.lineTo(dbToX(maxDb), dbToY(maxDb));
    ctx.stroke();
    ctx.setLineDash([]);

    // Threshold marker
    const thrX = dbToX(this.state.threshold);
    ctx.strokeStyle = 'rgba(255, 200, 80, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(thrX, padding); ctx.lineTo(thrX, H - padding); ctx.stroke();

    // Knee shading
    const halfKnee = this.state.knee / 2;
    if (halfKnee > 0) {
      const kneeStartX = dbToX(this.state.threshold - halfKnee);
      const kneeEndX = dbToX(this.state.threshold + halfKnee);
      ctx.fillStyle = 'rgba(255, 200, 80, 0.08)';
      ctx.fillRect(kneeStartX, padding, kneeEndX - kneeStartX, H - 2 * padding);
    }

    // Compression curve
    const curveColor = this.state.enabled
      ? (styles.getPropertyValue('--text-main').trim() || '#ffffff')
      : '#777777';
    ctx.strokeStyle = curveColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const steps = W - 2 * padding;
    for (let i = 0; i <= steps; i++) {
      const inputDb = minDb + (i / steps) * (maxDb - minDb);
      const outputDb = this.computeOutputLevel(inputDb);
      const x = dbToX(inputDb);
      const y = dbToY(Math.max(minDb, outputDb));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = styles.getPropertyValue('--text-dark').trim() || '#777777';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    [-60, -36, -24, -12, 0].forEach((db) => {
      ctx.fillText(`${db}`, dbToX(db), H - padding + 12);
    });
    ctx.textAlign = 'right';
    [-60, -36, -24, -12, 0].forEach((db) => {
      ctx.fillText(`${db}`, padding - 4, dbToY(db) + 3);
    });
    ctx.textAlign = 'left';
    ctx.fillText('IN dB', padding, padding - 8);
    ctx.fillText('OUT dB', W - padding - 36, padding - 8);
  }

  // Soft-knee compression curve, mirrors Web Audio's DynamicsCompressorNode behavior.
  private computeOutputLevel(inputDb: number): number {
    const { threshold, knee, ratio } = this.state;
    const halfKnee = knee / 2;
    if (inputDb < threshold - halfKnee) {
      return inputDb;
    }
    if (inputDb > threshold + halfKnee) {
      return threshold + (inputDb - threshold) / ratio;
    }
    // Quadratic interpolation across the knee region.
    const x = inputDb - threshold + halfKnee;
    return inputDb + ((1 / ratio - 1) * x * x) / (2 * knee);
  }

  // Horizontal gain-reduction bar. Fills right-to-left because reduction is negative.
  private drawMeter(): void {
    const ctx = this.meterCtx;
    const W = this.meterCanvas.width;
    const H = this.meterCanvas.height;
    const padding = 18;
    const styles = getComputedStyle(document.documentElement);

    ctx.fillStyle = styles.getPropertyValue('--canvas-bg').trim() || '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    const maxReductionDb = 24;
    const trackTop = padding + 14;
    const trackHeight = H - trackTop - padding - 8;
    const trackLeft = padding;
    const trackWidth = W - 2 * padding;

    // Track background
    ctx.fillStyle = styles.getPropertyValue('--grid-line-1').trim() || '#2a2a2a';
    ctx.fillRect(trackLeft, trackTop, trackWidth, trackHeight);

    // Gradient fill: green -> yellow -> red as reduction grows
    const reductionAmount = Math.min(maxReductionDb, -this.reduction);
    const fillWidth = (reductionAmount / maxReductionDb) * trackWidth;
    if (fillWidth > 0) {
      const grad = ctx.createLinearGradient(trackLeft, 0, trackLeft + trackWidth, 0);
      grad.addColorStop(0, '#4caf50');
      grad.addColorStop(0.5, '#ffeb3b');
      grad.addColorStop(1, '#f44336');
      ctx.fillStyle = grad;
      ctx.fillRect(trackLeft, trackTop, fillWidth, trackHeight);
    }

    // Peak hold marker
    const peakAmount = Math.min(maxReductionDb, -this.peakReduction);
    if (peakAmount > 0.1) {
      const peakX = trackLeft + (peakAmount / maxReductionDb) * trackWidth;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(peakX - 1, trackTop, 2, trackHeight);
    }

    // Tick marks
    ctx.strokeStyle = styles.getPropertyValue('--grid-line-2').trim() || '#444444';
    ctx.lineWidth = 1;
    [0, 6, 12, 18, 24].forEach((db) => {
      const x = trackLeft + (db / maxReductionDb) * trackWidth;
      ctx.beginPath();
      ctx.moveTo(x, trackTop);
      ctx.lineTo(x, trackTop + trackHeight);
      ctx.stroke();
    });

    // Labels
    ctx.fillStyle = styles.getPropertyValue('--text-dark').trim() || '#777777';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    [0, 6, 12, 18, 24].forEach((db) => {
      const x = trackLeft + (db / maxReductionDb) * trackWidth;
      ctx.fillText(`-${db}`, x, trackTop + trackHeight + 12);
    });

    ctx.fillStyle = styles.getPropertyValue('--text-muted').trim() || '#aaaaaa';
    ctx.textAlign = 'left';
    ctx.font = '11px Arial';
    ctx.fillText('Gain Reduction', trackLeft, padding + 4);
    ctx.textAlign = 'right';
    ctx.fillText(`${this.reduction.toFixed(1)} dB`, trackLeft + trackWidth, padding + 4);
  }
}
