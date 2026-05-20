// Thin wrapper around chrome.runtime.connect that gives modules a typed
// subscription API without each one having to manage its own port.
export type MessageHandler = (msg: any) => void;

export class BackgroundBridge {
  private port: chrome.runtime.Port;
  private handlers = new Set<MessageHandler>();

  constructor(portName = 'popup-port') {
    this.port = chrome.runtime.connect({ name: portName });
    this.port.onMessage.addListener((msg) => {
      for (const h of this.handlers) h(msg);
    });
  }

  send(msg: any): void {
    this.port.postMessage(msg);
  }

  on(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
