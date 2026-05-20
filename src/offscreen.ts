import { AudioChain } from './audio/AudioChain';

// Thin message router connecting the background service worker to AudioChain.
// All audio logic lives in src/audio/*; this file only translates port messages.
class OffscreenBridge {
  private chain = new AudioChain();
  private port: chrome.runtime.Port | null = null;

  constructor() {
    this.connect();
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'PING_OFFSCREEN') {
        this.connect();
        sendResponse({ success: true });
      }
    });
  }

  private connect(): void {
    if (this.port) this.port.disconnect();
    this.port = chrome.runtime.connect({ name: 'offscreen-port' });
    this.port.onDisconnect.addListener(() => { this.port = null; });
    this.port.onMessage.addListener((msg) => this.handle(msg));
  }

  private send(msg: any): void {
    try {
      this.port?.postMessage(msg);
    } catch {
      this.port = null;
    }
  }

  private async handle(msg: any): Promise<void> {
    switch (msg.type) {
      case 'SETUP_MEDIA_STREAM':
        try {
          await this.chain.attachStream(msg.streamId, () => this.send({ type: 'STREAM_ENDED' }));
        } catch (err) {
          console.error('[Offscreen] stream setup failed:', err);
        }
        break;

      case 'CLEANUP_MEDIA_STREAM':
        this.chain.cleanup();
        break;

      case 'ADD_FILTER':
        if (this.chain.eq.add(msg.nodeId, msg.frequency)) this.chain.rebuild();
        break;

      case 'UPDATE_FILTER':
        this.chain.eq.update(msg.nodeId, msg.config);
        break;

      case 'REMOVE_FILTER':
        if (this.chain.eq.remove(msg.nodeId)) this.chain.rebuild();
        break;

      case 'SET_MASTER_GAIN':
        this.chain.setMasterGain(msg.gain);
        break;

      case 'UPDATE_COMPRESSOR':
        this.chain.compressor.update(msg.config);
        break;

      case 'SET_COMPRESSOR_ENABLED':
        this.chain.compressor.setEnabled(!!msg.enabled);
        this.chain.rebuild();
        break;

      case 'GET_STATUS':
        this.send({ type: 'SYNC_STATUS', data: this.chain.getStatus() });
        break;

      case 'GET_FREQUENCY_DATA': {
        const data = this.chain.getFrequencyData();
        if (data) this.send({ type: 'SYNC_FREQUENCY_DATA', data: Array.from(data) });
        break;
      }

      case 'GET_COMPRESSOR_REDUCTION':
        this.send({ type: 'SYNC_COMPRESSOR_REDUCTION', reduction: this.chain.compressor.getReduction() });
        break;
    }
  }
}

new OffscreenBridge();
export {};
