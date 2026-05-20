import { UIManager } from './modules/ui/UIManager';
import { BackgroundBridge } from './modules/messaging';
import { EQVisualizer } from './modules/eq/EQVisualizer';
import { CompressorVisualizer } from './modules/compressor/CompressorVisualizer';

document.addEventListener('DOMContentLoaded', async () => {
  new UIManager();

  const bridge = new BackgroundBridge('popup-port');
  const eq = new EQVisualizer(bridge);
  new CompressorVisualizer(bridge);

  bridge.send({ type: 'START_CAPTURE' });

  const masterGainInput = document.getElementById('masterGain') as HTMLInputElement | null;
  masterGainInput?.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    const display = document.getElementById('masterGainValue');
    if (display) display.textContent = value.toFixed(1) + ' dB';
    eq.sendMasterGain(Math.pow(10, value / 20));
  });

  document.getElementById('deleteButton')?.addEventListener('click', () => eq.deleteSelectedNode());
  document.getElementById('resetButton')?.addEventListener('click', () => eq.reset());
  document.getElementById('resetBtn')?.addEventListener('click', () => chrome.runtime.reload());
});

export {};
