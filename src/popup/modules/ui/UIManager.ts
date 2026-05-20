export class UIManager {
  private pendingTheme = 'system';
  private pendingViewMode = 'popup';
  private currentViewMode = 'popup';

  constructor() {
    this.setupTabs();
    this.setupTheme();
    this.setupViewMode();
    this.setupApplyButton();
  }

  private setupTabs(): void {
    // Limit to actual nav containers, not tab-content panels which also carry data-tab-group.
    const groups = document.querySelectorAll<HTMLElement>('.tab-nav[data-tab-group], .sub-tab-nav[data-tab-group]');
    groups.forEach((group) => {
      const groupName = group.dataset.tabGroup!;
      const tabBtns = group.querySelectorAll<HTMLButtonElement>('.tab-btn');
      const contents = document.querySelectorAll<HTMLElement>(`.tab-content[data-tab-group="${groupName}"]`);

      tabBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetId = btn.dataset.target!;
          tabBtns.forEach((b) => b.classList.remove('active'));
          contents.forEach((c) => c.classList.remove('active'));
          btn.classList.add('active');
          document.getElementById(targetId)?.classList.add('active');
        });
      });
    });
  }

  private setupTheme(): void {
    const themeBtns = document.querySelectorAll('#themeButtons .btn-toggle');

    chrome.storage.local.get(['theme'], (result) => {
      this.pendingTheme = (result.theme as string) || 'system';
      this.applyThemeLogic(this.pendingTheme);
      this.updateThemeButtons();
    });

    themeBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.pendingTheme = (e.currentTarget as HTMLButtonElement).dataset.themeVal!;
        this.updateThemeButtons();
      });
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      chrome.storage.local.get(['theme'], (result) => {
        if (!result.theme || result.theme === 'system') {
          this.pendingTheme = 'system';
          this.applyThemeLogic('system');
        }
      });
    });
  }

  private updateThemeButtons(): void {
    document.querySelectorAll('#themeButtons .btn-toggle').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLButtonElement).dataset.themeVal === this.pendingTheme);
    });
  }

  private applyThemeLogic(theme: string): void {
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    document.dispatchEvent(new Event('themeChanged'));
  }

  private setupViewMode(): void {
    const viewModeBtns = document.querySelectorAll('#viewModeButtons .btn-toggle');

    chrome.storage.local.get(['viewMode'], (result) => {
      this.currentViewMode = (result.viewMode as string) || 'popup';
      this.pendingViewMode = this.currentViewMode;
      this.updateViewModeButtons();
    });

    viewModeBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.pendingViewMode = (e.currentTarget as HTMLButtonElement).dataset.modeVal!;
        this.updateViewModeButtons();
      });
    });
  }

  private updateViewModeButtons(): void {
    document.querySelectorAll('#viewModeButtons .btn-toggle').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLButtonElement).dataset.modeVal === this.pendingViewMode);
    });
  }

  private setupApplyButton(): void {
    const applyBtn = document.getElementById('applySettingsBtn');
    if (!applyBtn) return;

    applyBtn.addEventListener('click', () => {
      chrome.storage.local.set({ theme: this.pendingTheme });
      this.applyThemeLogic(this.pendingTheme);

      const modeChanged = this.pendingViewMode !== this.currentViewMode;
      this.currentViewMode = this.pendingViewMode;
      chrome.storage.local.set({ viewMode: this.pendingViewMode });

      const sidePanel = (chrome as any).sidePanel;
      if (sidePanel?.setPanelBehavior) {
        sidePanel.setPanelBehavior({ openPanelOnActionClick: this.pendingViewMode === 'sidePanel' }).catch(() => {});
      }

      if (!modeChanged) return;

      if (this.pendingViewMode === 'sidePanel') {
        chrome.windows.getCurrent({ populate: false }, (win) => {
          if (win.id !== undefined && sidePanel) {
            sidePanel.open({ windowId: win.id }).then(() => window.close()).catch(() => window.close());
          }
        });
      } else if (this.pendingViewMode === 'newTab') {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/popup.html') }).then(() => window.close());
      } else {
        chrome.tabs.getCurrent((tab) => {
          if (tab && tab.id) chrome.tabs.remove(tab.id);
          else window.close();
        });
      }
    });
  }
}
