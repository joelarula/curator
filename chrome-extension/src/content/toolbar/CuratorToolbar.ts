/**
 * Curator In-Page Floating Toolbar
 * Injected into web pages via Shadow DOM to provide scrape status and active project context.
 */

export interface ToolbarState {
  status: 'UNSCRAPED' | 'SCRAPING' | 'SCRAPED';
  activeProjectName: string;
  activeProjectId: string;
  resourceId?: number;
  lastScraped?: string;
  minimized: boolean;
}

export class CuratorToolbar {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private state: ToolbarState = {
    status: 'UNSCRAPED',
    activeProjectName: 'Default Database',
    activeProjectId: 'default',
    minimized: false,
  };

  constructor() {
    this.init();
  }

  private init() {
    if (typeof document === 'undefined') return;

    // Avoid duplicate injection
    if (document.getElementById('curator-toolbar-host')) return;

    // Create host element
    this.host = document.createElement('curator-toolbar-host');
    this.host.id = 'curator-toolbar-host';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    document.body.appendChild(this.host);

    this.render();
    this.checkStatus();
  }

  public setState(partial: Partial<ToolbarState>) {
    this.state = { ...this.state, ...partial };
    this.render();
  }

  public checkStatus() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;

    try {
      chrome.runtime.sendMessage(
        {
          type: 'CHECK_PAGE_SCRAPE_STATUS',
          url: window.location.href,
        },
        (response) => {
          if (chrome.runtime.lastError || !response) return;

          this.setState({
            status: response.status || 'UNSCRAPED',
            activeProjectName: response.projectName || 'Default',
            activeProjectId: response.projectId || 'default',
            resourceId: response.resourceId,
            lastScraped: response.updatedAt,
          });
        }
      );
    } catch {
      // Extension context invalidated or not ready
    }
  }

  public triggerScrape() {
    this.setState({ status: 'SCRAPING' });

    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;

    chrome.runtime.sendMessage(
      {
        type: 'TRIGGER_PAGE_SCRAPE',
        url: window.location.href,
        title: document.title,
      },
      (response) => {
        if (chrome.runtime.lastError || !response || response.status === 'error') {
          console.error('[Curator Toolbar] Scrape failed:', response?.error || chrome.runtime.lastError);
          this.setState({ status: 'UNSCRAPED' });
          return;
        }

        this.setState({
          status: 'SCRAPED',
          resourceId: response.resourceId,
          lastScraped: new Date().toISOString(),
        });
      }
    );
  }

  public openStudio() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;

    chrome.runtime.sendMessage({
      type: 'OPEN_CURATOR_STUDIO',
      resourceId: this.state.resourceId,
    });
  }

  private render() {
    if (!this.shadow) return;

    const { status, activeProjectName, resourceId, minimized } = this.state;

    const styles = `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        color: #f1f5f9;
        z-index: 2147483647;
        position: fixed;
        bottom: 24px;
        right: 24px;
        user-select: none;
      }

      * {
        box-sizing: border-box;
      }

      .curator-pill {
        display: flex;
        align-items: center;
        gap: 10px;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
        padding: 6px 14px;
        border-radius: 9999px;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .curator-pill:hover {
        border-color: rgba(99, 102, 241, 0.4);
        box-shadow: 0 14px 30px -4px rgba(0, 0, 0, 0.6), 0 0 15px rgba(99, 102, 241, 0.25);
      }

      .logo-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: #ffffff;
      }

      .curator-icon {
        color: #818cf8;
        font-size: 15px;
      }

      .project-tag {
        background: rgba(99, 102, 241, 0.18);
        color: #a5b4fc;
        font-size: 11px;
        font-weight: 500;
        padding: 1px 7px;
        border-radius: 12px;
        border: 1px solid rgba(129, 140, 248, 0.25);
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .divider {
        width: 1px;
        height: 14px;
        background: rgba(255, 255, 255, 0.12);
      }

      .status-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
      }

      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
      }

      .dot.unscraped {
        background: #94a3b8;
      }

      .dot.scraping {
        background: #f59e0b;
        box-shadow: 0 0 8px #f59e0b;
        animation: pulse 1.2s infinite;
      }

      .dot.scraped {
        background: #10b981;
        box-shadow: 0 0 8px #10b981;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.85); }
      }

      .btn {
        background: #4f46e5;
        color: #ffffff;
        border: none;
        padding: 4px 10px;
        border-radius: 16px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .btn:hover {
        background: #6366f1;
        transform: translateY(-1px);
      }

      .btn:active {
        transform: translateY(0);
      }

      .btn-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: #cbd5e1;
      }

      .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.16);
        color: #ffffff;
      }

      .btn-icon {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 2px;
        font-size: 13px;
        line-height: 1;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease;
      }

      .btn-icon:hover {
        color: #ffffff;
      }

      /* Minimized Floating Circle */
      .minimized-pill {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        position: relative;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .minimized-pill:hover {
        transform: scale(1.1);
        border-color: rgba(99, 102, 241, 0.5);
      }

      .mini-status-dot {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        border: 1.5px solid #0f172a;
      }
    `;

    if (minimized) {
      let dotColor = '#94a3b8';
      if (status === 'SCRAPED') dotColor = '#10b981';
      if (status === 'SCRAPING') dotColor = '#f59e0b';

      this.shadow.innerHTML = `
        <style>${styles}</style>
        <div class="minimized-pill" id="expand-btn" title="Curator: ${activeProjectName} (${status})">
          <span class="curator-icon">◈</span>
          <span class="mini-status-dot" style="background: ${dotColor}"></span>
        </div>
      `;

      this.shadow.getElementById('expand-btn')?.addEventListener('click', () => {
        this.setState({ minimized: false });
      });
      return;
    }

    let statusContent = '';
    if (status === 'UNSCRAPED') {
      statusContent = `
        <div class="status-indicator">
          <span class="dot unscraped"></span>
          <span>Not saved</span>
        </div>
        <button class="btn" id="scrape-btn">
          <span>⚡</span> Scrape
        </button>
      `;
    } else if (status === 'SCRAPING') {
      statusContent = `
        <div class="status-indicator">
          <span class="dot scraping"></span>
          <span>Scraping...</span>
        </div>
      `;
    } else if (status === 'SCRAPED') {
      statusContent = `
        <div class="status-indicator">
          <span class="dot scraped"></span>
          <span>Saved #${resourceId || '✓'}</span>
        </div>
        <button class="btn btn-secondary" id="studio-btn" title="Open in Curator Studio">
          ◈ Studio
        </button>
        <button class="btn-icon" id="re-scrape-btn" title="Re-scrape current page">
          ⟳
        </button>
      `;
    }

    this.shadow.innerHTML = `
      <style>${styles}</style>
      <div class="curator-pill">
        <div class="logo-badge">
          <span class="curator-icon">◈</span>
          <span>Curator</span>
          <span class="project-tag" title="Active Project: ${activeProjectName}">${activeProjectName}</span>
        </div>
        <div class="divider"></div>
        ${statusContent}
        <button class="btn-icon" id="minimize-btn" title="Minimize toolbar">
          _
        </button>
      </div>
    `;

    // Attach listeners
    this.shadow.getElementById('scrape-btn')?.addEventListener('click', () => {
      this.triggerScrape();
    });

    this.shadow.getElementById('re-scrape-btn')?.addEventListener('click', () => {
      this.triggerScrape();
    });

    this.shadow.getElementById('studio-btn')?.addEventListener('click', () => {
      this.openStudio();
    });

    this.shadow.getElementById('minimize-btn')?.addEventListener('click', () => {
      this.setState({ minimized: true });
    });
  }
}
