import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dns from 'node:dns';
import {
  validateBrowserUrl,
  installSsrfInterceptor,
  type BrowserTargetMode,
} from './ssrfBrowserInterceptor';

describe('Sandboxed Browser SSRF Interceptor (SEC-18, Ticket #77)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateBrowserUrl', () => {
    it('rejects malformed URLs', async () => {
      const res = await validateBrowserUrl('not-a-valid-url');
      expect(res.ok).toBe(false);
      expect(res.reason).toContain('Invalid URL format');
    });

    it('rejects non-http/https protocols (file:, javascript:, gopher:)', async () => {
      const res1 = await validateBrowserUrl('file:///etc/passwd');
      expect(res1.ok).toBe(false);
      expect(res1.reason).toContain('Blocked protocol "file:"');

      const res2 = await validateBrowserUrl('javascript:alert(1)');
      expect(res2.ok).toBe(false);
      expect(res2.reason).toContain('Blocked protocol "javascript:"');

      const res3 = await validateBrowserUrl('gopher://internal.lan');
      expect(res3.ok).toBe(false);
      expect(res3.reason).toContain('Blocked protocol "gopher:"');
    });

    it('rejects URLs containing embedded credentials', async () => {
      const res = await validateBrowserUrl('https://admin:secret@api.github.com');
      expect(res.ok).toBe(false);
      expect(res.reason).toContain('embedded authentication credentials');
    });

    it('unconditionally bans cloud metadata endpoints (169.254.169.254 & fd00:ec2::254)', async () => {
      // In remote_web mode
      const res1 = await validateBrowserUrl('http://169.254.169.254/latest/meta-data/', 'remote_web');
      expect(res1.ok).toBe(false);
      expect(res1.reason).toContain('cloud metadata');

      // In local_dev mode (MUST STILL BE BANNED!)
      const res2 = await validateBrowserUrl('http://169.254.169.254/latest/meta-data/', 'local_dev');
      expect(res2.ok).toBe(false);
      expect(res2.reason).toContain('cloud metadata');

      const res3 = await validateBrowserUrl('http://[fd00:ec2::254]/latest/meta-data/', 'remote_web');
      expect(res3.ok).toBe(false);
      expect(res3.reason).toContain('cloud metadata');
    });

    describe('remote_web mode', () => {
      it('blocks loopback and localhost destinations', async () => {
        const res1 = await validateBrowserUrl('http://localhost:3000', 'remote_web');
        expect(res1.ok).toBe(false);
        expect(res1.reason).toContain('Loopback and localhost destinations are blocked');

        const res2 = await validateBrowserUrl('http://127.0.0.1:8080', 'remote_web');
        expect(res2.ok).toBe(false);
        expect(res2.reason).toContain('Loopback and localhost destinations are blocked');

        const res3 = await validateBrowserUrl('http://[::1]:8080', 'remote_web');
        expect(res3.ok).toBe(false);
        expect(res3.reason).toContain('Loopback and localhost destinations are blocked');
      });

      it('blocks private IP literals directly', async () => {
        const res1 = await validateBrowserUrl('http://192.168.1.1/admin', 'remote_web');
        expect(res1.ok).toBe(false);
        expect(res1.reason).toContain('private network space');

        const res2 = await validateBrowserUrl('http://10.0.0.5/', 'remote_web');
        expect(res2.ok).toBe(false);
        expect(res2.reason).toContain('private network space');
      });

      it('blocks domains resolving to private or metadata addresses (DNS Rebinding Guard)', async () => {
        vi.spyOn(dns.promises, 'lookup').mockImplementation(async () => [
          { address: '10.200.0.1', family: 4 },
        ] as unknown as dns.LookupAddress);

        const res = await validateBrowserUrl('https://malicious-rebind.com', 'remote_web');
        expect(res.ok).toBe(false);
        expect(res.reason).toContain('resolved to private IP "10.200.0.1"');
      });

      it('permits public domains resolving to public IP addresses', async () => {
        vi.spyOn(dns.promises, 'lookup').mockImplementation(async () => [
          { address: '93.184.216.34', family: 4 },
        ] as unknown as dns.LookupAddress);

        const res = await validateBrowserUrl('https://example.com/docs', 'remote_web');
        expect(res.ok).toBe(true);
        expect(res.parsed?.hostname).toBe('example.com');
      });
    });

    describe('local_dev mode', () => {
      it('permits loopback destinations (localhost, 127.0.0.1)', async () => {
        const res1 = await validateBrowserUrl('http://localhost:3000', 'local_dev');
        expect(res1.ok).toBe(true);

        const res2 = await validateBrowserUrl('http://127.0.0.1:5173', 'local_dev');
        expect(res2.ok).toBe(true);
      });

      it('enforces approved loopback port when specified', async () => {
        const resAllowed = await validateBrowserUrl('http://localhost:3000', 'local_dev', 3000);
        expect(resAllowed.ok).toBe(true);

        const resDenied = await validateBrowserUrl('http://localhost:8080', 'local_dev', 3000);
        expect(resDenied.ok).toBe(false);
        expect(resDenied.reason).toContain('does not match the approved local development server port');
      });

      it('rejects external or non-loopback domains in local_dev mode', async () => {
        const res = await validateBrowserUrl('https://google.com', 'local_dev');
        expect(res.ok).toBe(false);
        expect(res.reason).toContain('only loopback addresses');
      });
    });
  });

  describe('installSsrfInterceptor', () => {
    it('registers onBeforeRequest and onHeadersReceived handlers on Electron Session', () => {
      let beforeRequestCallback: ((details: { url: string }, cb: (resp: { cancel: boolean }) => void) => void) | null = null;
      let headersReceivedCallback: ((details: { responseHeaders?: Record<string, string[]> }, cb: (resp: { responseHeaders?: Record<string, string[]> }) => void) => void) | null = null;

      const mockSession = {
        webRequest: {
          onBeforeRequest: vi.fn().mockImplementation((_filter, cb) => {
            beforeRequestCallback = cb;
          }),
          onBeforeRedirect: vi.fn(),
          onHeadersReceived: vi.fn().mockImplementation((_filter, cb) => {
            headersReceivedCallback = cb;
          }),
        },
      } as unknown as Electron.Session;

      const currentMode: BrowserTargetMode = 'remote_web';
      installSsrfInterceptor(mockSession, () => ({
        targetMode: currentMode,
      }));

      expect(mockSession.webRequest.onBeforeRequest).toHaveBeenCalledWith(
        { urls: ['<all_urls>'] },
        expect.any(Function),
      );
      expect(mockSession.webRequest.onHeadersReceived).toHaveBeenCalledWith(
        { urls: ['<all_urls>'] },
        expect.any(Function),
      );
      expect(beforeRequestCallback).toBeDefined();
      expect(headersReceivedCallback).toBeDefined();

      // Test safe data:image subresource is not cancelled
      const dataUriResp = vi.fn();
      if (beforeRequestCallback) {
        beforeRequestCallback({ url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=' }, dataUriResp);
      }
      expect(dataUriResp).toHaveBeenCalledWith({ cancel: false });

      // Test headersReceived injects Content-Security-Policy
      const headersResp = vi.fn();
      if (headersReceivedCallback) {
        headersReceivedCallback({ responseHeaders: { 'content-type': ['text/html'] } }, headersResp);
      }
      expect(headersResp).toHaveBeenCalledWith({
        responseHeaders: {
          'content-type': ['text/html'],
          'Content-Security-Policy': ["object-src 'none'; base-uri 'none';"],
        },
      });
    });
  });
});
