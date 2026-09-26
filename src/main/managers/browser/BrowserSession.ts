/**
 * Sandboxed Headless Browser Session (SEC-01, SEC-02, SEC-03, SEC-18, Ticket #77).
 *
 * Wraps an offscreen Electron BrowserWindow running inside an ephemeral in-memory
 * partition, hardened with deep SSRF packet interception, permission lockdown,
 * and zero Node access.
 */
import { BrowserWindow, session as electronSession, type NativeImage } from 'electron';
import {
  installSsrfInterceptor,
  validateBrowserUrl,
  type BrowserTargetMode,
} from './ssrfBrowserInterceptor';
import { NATIVE_RUNTIME_LIMITS } from '@shared/constants';
import { logger } from '../../logger';

const {
  minViewportWidth,
  minViewportHeight,
  maxViewportWidth,
  maxViewportHeight,
  defaultViewportWidth,
  defaultViewportHeight,
  minQuality,
  maxQuality,
  defaultQuality,
  maxConsoleLogs,
  maxScreenshotSizeBytes,
  navigationTimeoutMs,
} = NATIVE_RUNTIME_LIMITS.browser;

export interface BrowserTargetConfig {
  targetMode?: BrowserTargetMode;
  allowedLoopbackPort?: number;
}

export interface ConsoleMessageEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  text: string;
  sourceUrl?: string;
  lineNumber?: number;
}

export interface ScreenshotResult {
  dataUrl: string;
  url: string;
  title: string;
  viewport: { width: number; height: number };
}

export class BrowserSession {
  private window: BrowserWindow | null = null;
  private consoleLogs: ConsoleMessageEntry[] = [];
  private currentTargetMode: BrowserTargetMode = 'remote_web';
  private allowedLoopbackPort?: number;

  constructor(
    public readonly sessionId: string,
    public readonly partitionId: string = `browser_action_${sessionId}`,
  ) {}

  get isLaunched(): boolean {
    return this.window !== null && !this.window.isDestroyed();
  }

  async launch(opts: {
    url?: string;
    viewport?: { width: number; height: number };
    targetMode?: BrowserTargetMode;
    allowedLoopbackPort?: number;
  } = {}): Promise<void> {
    if (this.isLaunched) {
      if (opts.url) {
        await this.navigate(opts.url, opts.targetMode, opts.allowedLoopbackPort);
      }
      return;
    }

    this.currentTargetMode = opts.targetMode ?? 'remote_web';
    this.allowedLoopbackPort = opts.allowedLoopbackPort;

    const width = Math.min(
      maxViewportWidth,
      Math.max(minViewportWidth, opts.viewport?.width ?? defaultViewportWidth),
    );
    const height = Math.min(
      maxViewportHeight,
      Math.max(minViewportHeight, opts.viewport?.height ?? defaultViewportHeight),
    );

    // Ephemeral in-memory partition: zero disk traces, SEC-14 isolation
    const customSession = electronSession.fromPartition(this.partitionId, { cache: false });

    // Hardened permission handlers: deny all web permissions (SEC-02)
    customSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    customSession.setPermissionCheckHandler(() => false);
    customSession.setDevicePermissionHandler(() => false);

    // Install deep SSRF subresource interceptor (SEC-18)
    installSsrfInterceptor(customSession, () => ({
      targetMode: this.currentTargetMode,
      allowedLoopbackPort: this.allowedLoopbackPort,
    }));

    this.window = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      webPreferences: {
        offscreen: true, // Headless offscreen rendering
        contextIsolation: true, // SEC-01
        nodeIntegration: false, // SEC-01
        sandbox: true, // Chromium OS sandbox
        webSecurity: true,
        allowRunningInsecureContent: false,
        session: customSession,
        backgroundThrottling: false,
      },
    });

    // Block popups and secondary window creation (SEC-03)
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    // Harden in-page navigations and server-side redirects (SEC-03)
    this.window.webContents.on('will-navigate', (event, navigationUrl) => {
      validateBrowserUrl(navigationUrl, this.currentTargetMode, this.allowedLoopbackPort).then(
        (res) => {
          if (!res.ok) {
            logger.warn(
              `[BrowserSession] will-navigate blocked to "${navigationUrl}": ${res.reason}`,
            );
            event.preventDefault();
          }
        },
      );
    });

    this.window.webContents.on('will-redirect', (event, redirectUrl) => {
      validateBrowserUrl(redirectUrl, this.currentTargetMode, this.allowedLoopbackPort).then(
        (res) => {
          if (!res.ok) {
            logger.warn(
              `[BrowserSession] will-redirect blocked to "${redirectUrl}": ${res.reason}`,
            );
            event.preventDefault();
          }
        },
      );
    });

    // Capture console messages up to maxConsoleLogs
    this.window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const levelMap: Record<number, 'info' | 'warn' | 'error'> = {
        0: 'info',
        1: 'info',
        2: 'warn',
        3: 'error',
      };
      this.consoleLogs.push({
        timestamp: Date.now(),
        level: levelMap[level] ?? 'info',
        text: message,
        sourceUrl: sourceId,
        lineNumber: line,
      });
      if (this.consoleLogs.length > maxConsoleLogs) {
        this.consoleLogs.shift();
      }
    });

    if (opts.url) {
      await this.navigate(opts.url, this.currentTargetMode, this.allowedLoopbackPort);
    }
  }

  async navigate(
    url: string,
    targetMode?: BrowserTargetMode,
    port?: number,
  ): Promise<void> {
    if (!this.isLaunched) {
      await this.launch({ url, targetMode, allowedLoopbackPort: port });
      return;
    }

    this.currentTargetMode = targetMode ?? this.currentTargetMode;
    this.allowedLoopbackPort = port ?? this.allowedLoopbackPort;

    const validation = await validateBrowserUrl(
      url,
      this.currentTargetMode,
      this.allowedLoopbackPort,
    );
    if (!validation.ok) {
      throw new Error(`Navigation denied: ${validation.reason}`);
    }
    if (!this.window || this.window.isDestroyed()) {
      throw new Error('Browser window is not available.');
    }

    // Enforce navigation timeout (XP-01)
    const loadPromise = this.window.loadURL(url);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Navigation timeout after ${navigationTimeoutMs}ms for "${url}"`));
      }, navigationTimeoutMs);
    });
    try {
      await Promise.race([loadPromise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async captureScreenshot(quality: number = defaultQuality): Promise<ScreenshotResult> {
    if (!this.window || this.window.isDestroyed()) {
      throw new Error('Browser is not launched. Call "launch" first.');
    }
    const nativeImg: NativeImage = await this.window.webContents.capturePage();
    const clampedQuality = Math.min(maxQuality, Math.max(minQuality, Math.floor(quality)));
    const jpegBuffer = nativeImg.toJPEG(clampedQuality);

    if (jpegBuffer.byteLength > maxScreenshotSizeBytes) {
      throw new Error(
        `Screenshot size (${jpegBuffer.byteLength} bytes) exceeds limit (${maxScreenshotSizeBytes} bytes).`,
      );
    }

    const bounds = this.window.getBounds();
    return {
      dataUrl: `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`,
      url: this.window.webContents.getURL(),
      title: this.window.webContents.getTitle(),
      viewport: { width: bounds.width, height: bounds.height },
    };
  }

  async click(coordinate?: { x: number; y: number }, selector?: string): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      throw new Error('Browser is not launched. Call "launch" first.');
    }

    let targetX = coordinate?.x;
    let targetY = coordinate?.y;

    if (selector && (targetX === undefined || targetY === undefined)) {
      const rect = (await this.window.webContents.executeJavaScript(`
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()
      `)) as { x: number; y: number } | null;

      if (!rect) {
        throw new Error(`Element matching selector "${selector}" was not found.`);
      }
      targetX = rect.x;
      targetY = rect.y;
    }

    if (targetX === undefined || targetY === undefined) {
      throw new Error('Either coordinate { x, y } or a valid selector is required for click.');
    }

    this.window.webContents.sendInputEvent({ type: 'mouseMove', x: targetX, y: targetY });
    this.window.webContents.sendInputEvent({
      type: 'mouseDown',
      x: targetX,
      y: targetY,
      button: 'left',
      clickCount: 1,
    });
    this.window.webContents.sendInputEvent({
      type: 'mouseUp',
      x: targetX,
      y: targetY,
      button: 'left',
      clickCount: 1,
    });
  }

  async type(
    text: string,
    selector?: string,
    submit = false,
    clear = false,
  ): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      throw new Error('Browser is not launched. Call "launch" first.');
    }

    if (selector) {
      await this.click(undefined, selector);
      if (clear) {
        await this.window.webContents.executeJavaScript(`
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (el && 'value' in el) {
              el.value = '';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()
        `);
      }
    }

    for (const char of text) {
      this.window.webContents.sendInputEvent({ type: 'char', keyCode: char });
    }

    if (submit) {
      this.window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      this.window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    }
  }

  async scroll(deltaX = 0, deltaY = 0): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      throw new Error('Browser is not launched. Call "launch" first.');
    }
    this.window.webContents.sendInputEvent({
      type: 'mouseWheel',
      x: 100,
      y: 100,
      deltaX,
      deltaY,
    });
  }

  getConsoleLogs(
    level?: 'all' | 'error' | 'warn' | 'info',
    clear = false,
  ): ConsoleMessageEntry[] {
    const filtered =
      level && level !== 'all'
        ? this.consoleLogs.filter((l) => l.level === level)
        : [...this.consoleLogs];
    if (clear) {
      this.consoleLogs = [];
    }
    return filtered;
  }

  getUrl(): string {
    return this.window && !this.window.isDestroyed() ? this.window.webContents.getURL() : '';
  }

  getTitle(): string {
    return this.window && !this.window.isDestroyed() ? this.window.webContents.getTitle() : '';
  }

  async close(): Promise<void> {
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.destroy();
      } catch (err) {
        logger.warn(`[BrowserSession] Error destroying window: ${err}`);
      }
      this.window = null;
    }
    try {
      const customSession = electronSession.fromPartition(this.partitionId);
      await customSession.clearStorageData();
    } catch {
      // best-effort cleanup
    }
    this.consoleLogs = [];
  }
}
