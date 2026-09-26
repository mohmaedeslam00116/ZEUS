import { describe, it, expect, vi, beforeEach } from 'vitest';

const { MockBrowserWindow, mockBrowserWindowInstances, mockCustomSession, mockWebContents } =
  vi.hoisted(() => {
    const mockWebContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      getURL: vi.fn().mockReturnValue('https://example.com'),
      getTitle: vi.fn().mockReturnValue('Example Domain'),
      capturePage: vi.fn().mockResolvedValue({
        toJPEG: () => Buffer.from('fake-jpeg-bytes'),
      }),
      executeJavaScript: vi.fn().mockImplementation(async (code: string) => {
        if (code.includes('notFound')) {
          return null;
        }
        return { x: 150, y: 200 };
      }),
      sendInputEvent: vi.fn(),
    };

    const mockCustomSession = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      setDevicePermissionHandler: vi.fn(),
      clearStorageData: vi.fn().mockResolvedValue(undefined),
      webRequest: {
        onBeforeRequest: vi.fn(),
        onBeforeRedirect: vi.fn(),
        onHeadersReceived: vi.fn(),
      },
    };

    const mockBrowserWindowInstances: MockBrowserWindow[] = [];

    class MockBrowserWindow {
      webContents = mockWebContents;
      destroyed = false;
      bounds = { width: 1280, height: 800, x: 0, y: 0 };
      webPreferences: Record<string, unknown>;

      constructor(public options: Record<string, unknown>) {
        this.webPreferences = (options.webPreferences as Record<string, unknown>) ?? {};
        mockBrowserWindowInstances.push(this);
      }

      isDestroyed() {
        return this.destroyed;
      }

      destroy() {
        this.destroyed = true;
      }

      getBounds() {
        return this.bounds;
      }

      loadURL = vi.fn().mockResolvedValue(undefined);
    }

    return { MockBrowserWindow, mockBrowserWindowInstances, mockCustomSession, mockWebContents };
  });

vi.mock('electron', () => ({
  BrowserWindow: MockBrowserWindow,
  session: {
    fromPartition: vi.fn(() => mockCustomSession),
  },
}));

import { BrowserSession } from './BrowserSession';
import { BrowserActionManager } from './BrowserActionManager';

describe('Sandboxed Browser Session & Lifecycle Manager (SEC-01, SEC-02, SEC-18, Ticket #77)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowserWindowInstances.length = 0;
  });

  describe('BrowserSession', () => {
    it('initializes with isolated ephemeral in-memory partition ID', () => {
      const session = new BrowserSession('session-123');
      expect(session.sessionId).toBe('session-123');
      expect(session.partitionId).toBe('browser_action_session-123');
      expect(session.isLaunched).toBe(false);
    });

    it('launches offscreen window with hardened security preferences', async () => {
      const session = new BrowserSession('session-123');
      await session.launch({
        viewport: { width: 1024, height: 768 },
      });

      expect(session.isLaunched).toBe(true);
      expect(mockBrowserWindowInstances.length).toBe(1);
      const win = mockBrowserWindowInstances[0];

      // SEC-01 & SEC-02 Invariant Verification
      expect(win.webPreferences.offscreen).toBe(true);
      expect(win.webPreferences.contextIsolation).toBe(true);
      expect(win.webPreferences.nodeIntegration).toBe(false);
      expect(win.webPreferences.sandbox).toBe(true);
      expect(win.webPreferences.webSecurity).toBe(true);

      // Block window.open popups (SEC-03)
      expect(mockWebContents.setWindowOpenHandler).toHaveBeenCalled();

      // Deny permissions (SEC-02)
      expect(mockCustomSession.setPermissionRequestHandler).toHaveBeenCalled();
      expect(mockCustomSession.setPermissionCheckHandler).toHaveBeenCalled();
    });

    it('navigates to legitimate URL', async () => {
      const session = new BrowserSession('session-123');
      await session.launch();
      const win = mockBrowserWindowInstances[0];

      await session.navigate('https://example.com');
      expect(win.loadURL).toHaveBeenCalledWith('https://example.com');
      expect(session.getUrl()).toBe('https://example.com');
      expect(session.getTitle()).toBe('Example Domain');
    });

    it('denies navigation to SSRF cloud metadata endpoint', async () => {
      const session = new BrowserSession('session-123');
      await session.launch();
      const win = mockBrowserWindowInstances[0];

      await expect(
        session.navigate('http://169.254.169.254/latest/meta-data/'),
      ).rejects.toThrow(/Navigation denied/);
      expect(win.loadURL).not.toHaveBeenCalled();
    });

    it('registers will-navigate and will-redirect lockdown handlers', async () => {
      const session = new BrowserSession('session-123');
      await session.launch();

      const willNavCall = mockWebContents.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'will-navigate',
      );
      expect(willNavCall).toBeDefined();

      const willRedirectCall = mockWebContents.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'will-redirect',
      );
      expect(willRedirectCall).toBeDefined();

      // Trigger will-navigate to cloud metadata and ensure preventDefault is invoked
      const willNavHandler = willNavCall?.[1] as (
        event: { preventDefault: () => void },
        url: string,
      ) => void;
      const mockEvent = { preventDefault: vi.fn() };
      willNavHandler(mockEvent, 'http://169.254.169.254/');
      await new Promise((r) => setTimeout(r, 10));
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it('captures screenshots as base64 JPEG data URLs', async () => {
      const session = new BrowserSession('session-123');
      await session.launch();

      const result = await session.captureScreenshot(85);
      expect(result.dataUrl).toContain('data:image/jpeg;base64,');
      expect(result.url).toBe('https://example.com');
      expect(result.title).toBe('Example Domain');
      expect(result.viewport).toEqual({ width: 1280, height: 800 });
    });

    it('rejects screenshots exceeding maxScreenshotSizeBytes limit', async () => {
      const session = new BrowserSession('session-123');
      await session.launch();

      mockWebContents.capturePage.mockResolvedValueOnce({
        toJPEG: () => Buffer.alloc(3 * 1024 * 1024), // 3 MiB > 2 MiB limit
      });

      await expect(session.captureScreenshot()).rejects.toThrow(/exceeds limit/);
    });

    it('rejects captureScreenshot when browser is not launched', async () => {
      const session = new BrowserSession('session-unlaunched');
      await expect(session.captureScreenshot()).rejects.toThrow('Browser is not launched');
    });

    it('performs click via direct coordinate', async () => {
      const session = new BrowserSession('session-123');
      await session.launch();

      await session.click({ x: 300, y: 450 });

      expect(mockWebContents.sendInputEvent).toHaveBeenCalledWith({
        type: 'mouseMove',
        x: 300,
        y: 450,
      });
      expect(mockWebContents.sendInputEvent).toHaveBeenCalledWith({
        type: 'mouseDown',
        x: 300,
        y: 450,
        button: 'left',
        clickCount: 1,
      });
      expect(mockWebContents.sendInputEvent).toHaveBeenCalledWith({
        type: 'mouseUp',
        x: 300,
        y: 450,
        button: 'left',
        clickCount: 1,
      });
    });

    it('performs click via CSS selector querying element rect', async () => {
      const session = new BrowserSession('session-123');
      await session.launch();

      await session.click(undefined, '#submit-btn');

      expect(mockWebContents.executeJavaScript).toHaveBeenCalled();
      expect(mockWebContents.sendInputEvent).toHaveBeenCalledWith({
        type: 'mouseMove',
        x: 150,
        y: 200,
      });
    });

    it('throws error when selector is not found for click', async () => {
      const session = new BrowserSession('session-123');
      await session.launch();

      await expect(session.click(undefined, '#notFoundElement')).rejects.toThrow(
        'Element matching selector "#notFoundElement" was not found.',
      );
    });

    it('performs type action with character streaming and optional submit', async () => {
      const session = new BrowserSession('session-123');
      await session.launch();

      await session.type('hello', undefined, true, false);

      expect(mockWebContents.sendInputEvent).toHaveBeenCalledWith({ type: 'char', keyCode: 'h' });
      expect(mockWebContents.sendInputEvent).toHaveBeenCalledWith({ type: 'char', keyCode: 'e' });
      expect(mockWebContents.sendInputEvent).toHaveBeenCalledWith({ type: 'char', keyCode: 'l' });
      expect(mockWebContents.sendInputEvent).toHaveBeenCalledWith({ type: 'char', keyCode: 'o' });
      expect(mockWebContents.sendInputEvent).toHaveBeenCalledWith({
        type: 'keyDown',
        keyCode: 'Enter',
      });
    });

    it('performs scroll action sending mouseWheel input event', async () => {
      const session = new BrowserSession('session-123');
      await session.launch();

      await session.scroll(10, 200);

      expect(mockWebContents.sendInputEvent).toHaveBeenCalledWith({
        type: 'mouseWheel',
        x: 100,
        y: 100,
        deltaX: 10,
        deltaY: 200,
      });
    });

    it('captures console messages and allows filtering and clearing', async () => {
      const session = new BrowserSession('session-123');
      await session.launch();

      // Trigger captured console messages
      const consoleHandler = mockWebContents.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'console-message',
      )?.[1] as ((...args: unknown[]) => void) | undefined;
      expect(consoleHandler).toBeDefined();

      consoleHandler({}, 0, 'Info log message', 10, 'http://test.com/app.js');
      consoleHandler({}, 2, 'Warning log message', 20, 'http://test.com/app.js');
      consoleHandler({}, 3, 'Fatal error occurred', 30, 'http://test.com/app.js');

      const allLogs = session.getConsoleLogs('all');
      expect(allLogs.length).toBe(3);

      const errorLogs = session.getConsoleLogs('error');
      expect(errorLogs.length).toBe(1);
      expect(errorLogs[0].text).toBe('Fatal error occurred');

      // Clear logs
      session.getConsoleLogs('all', true);
      expect(session.getConsoleLogs('all').length).toBe(0);
    });

    it('destroys window and clears partition storage data on close', async () => {
      const session = new BrowserSession('session-123');
      await session.launch();
      const win = mockBrowserWindowInstances[0];

      await session.close();
      expect(win.isDestroyed()).toBe(true);
      expect(mockCustomSession.clearStorageData).toHaveBeenCalled();
      expect(session.isLaunched).toBe(false);
    });
  });

  describe('BrowserActionManager', () => {
    it('creates and reuses browser session for the same agent session ID', () => {
      const manager = new BrowserActionManager();
      const s1 = manager.getOrCreateSession('agent-sess-1');
      const s2 = manager.getOrCreateSession('agent-sess-1');
      expect(s1).toBe(s2);

      const s3 = manager.getOrCreateSession('agent-sess-2');
      expect(s3).not.toBe(s1);
    });

    it('closes session and cleans up resources', async () => {
      const manager = new BrowserActionManager();
      const session = manager.getOrCreateSession('agent-sess-1');
      await session.launch();

      await manager.closeSession('agent-sess-1');
      expect(session.isLaunched).toBe(false);
    });

    it('disposes all active sessions on shutdown', async () => {
      const manager = new BrowserActionManager();
      const s1 = manager.getOrCreateSession('agent-sess-1');
      const s2 = manager.getOrCreateSession('agent-sess-2');
      await s1.launch();
      await s2.launch();

      await manager.dispose();
      expect(s1.isLaunched).toBe(false);
      expect(s2.isLaunched).toBe(false);
    });
  });
});
