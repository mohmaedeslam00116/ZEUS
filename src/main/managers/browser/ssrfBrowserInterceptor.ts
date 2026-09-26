/**
 * Sandboxed Browser SSRF Interceptor (SEC-18, Ticket #77).
 *
 * Enforces strict SSRF protection, anti-DNS-rebinding checks, protocol gating,
 * and subresource packet filtering across full headless browser sessions.
 */
import * as dns from 'node:dns';
import * as net from 'node:net';
import type { Session as ElectronSession } from 'electron';
import { isPrivateIp, isCloudMetadataIp } from '../../net/ssrfGuard';
import { logger } from '../../logger';

export type BrowserTargetMode = 'remote_web' | 'local_dev';

export interface InterceptorOptions {
  targetMode: BrowserTargetMode;
  allowedLoopbackPort?: number;
}

export interface UrlValidationResult {
  ok: boolean;
  reason?: string;
  parsed?: URL;
}

/**
 * Validates a target URL against protocol, credential, and SSRF rules.
 */
export async function validateBrowserUrl(
  rawUrl: string,
  targetMode: BrowserTargetMode = 'remote_web',
  allowedLoopbackPort?: number,
): Promise<UrlValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: `Invalid URL format: "${rawUrl}"` };
  }

  // 1. Strict Protocol Guard: Only http and https permitted
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      reason: `Blocked protocol "${parsed.protocol}". Only "http:" and "https:" URLs are allowed.`,
    };
  }

  // 2. Embedded Credentials Guard: Disallow user:pass@host
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      reason: 'URLs containing embedded authentication credentials are forbidden.',
    };
  }

  const rawHostname = parsed.hostname.toLowerCase();
  const hostname =
    rawHostname.startsWith('[') && rawHostname.endsWith(']')
      ? rawHostname.slice(1, -1)
      : rawHostname;

  // 3. Unconditional Cloud Metadata Ban (SEC-18)
  if (
    hostname === '169.254.169.254' ||
    hostname === 'fd00:ec2::254' ||
    (net.isIP(hostname) !== 0 && isCloudMetadataIp(hostname))
  ) {
    return {
      ok: false,
      reason: 'Access to cloud metadata endpoints (169.254.169.254) is strictly forbidden.',
    };
  }

  const isLoopbackHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1';

  // 4. Remote Web Mode: Strictly block loopback and all private LAN IPs
  if (targetMode === 'remote_web') {
    if (isLoopbackHost) {
      return {
        ok: false,
        reason:
          'Loopback and localhost destinations are blocked in "remote_web" mode. Use "local_dev" mode for local development servers.',
      };
    }

    if (net.isIP(hostname) !== 0 && isPrivateIp(hostname)) {
      return {
        ok: false,
        reason: `Target IP address "${hostname}" is within private network space (SEC-18).`,
      };
    }

    // Anti-DNS-Rebinding Pre-Resolution: ensure domain resolves only to public IPs
    try {
      const addresses = await dns.promises.lookup(hostname, { all: true });
      if (!addresses || addresses.length === 0) {
        return { ok: false, reason: `Failed to resolve hostname: "${hostname}"` };
      }
      for (const record of addresses) {
        if (isCloudMetadataIp(record.address)) {
          return {
            ok: false,
            reason: `Hostname "${hostname}" resolved to cloud metadata IP "${record.address}" (SEC-18).`,
          };
        }
        if (isPrivateIp(record.address)) {
          return {
            ok: false,
            reason: `Hostname "${hostname}" resolved to private IP "${record.address}" (SEC-18).`,
          };
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `DNS resolution error for "${hostname}": ${msg}` };
    }

    return { ok: true, parsed };
  }

  // 5. Local Dev Mode: Allow loopback, restrict port if specified, and forbid external hosts
  if (targetMode === 'local_dev') {
    if (!isLoopbackHost) {
      return {
        ok: false,
        reason:
          'In "local_dev" mode, only loopback addresses (localhost, 127.0.0.1, ::1) are permitted.',
      };
    }

    const port = parsed.port
      ? parseInt(parsed.port, 10)
      : parsed.protocol === 'https:'
        ? 443
        : 80;

    if (allowedLoopbackPort !== undefined && port !== allowedLoopbackPort) {
      return {
        ok: false,
        reason: `Port ${port} does not match the approved local development server port (${allowedLoopbackPort}).`,
      };
    }

    return { ok: true, parsed };
  }

  return { ok: false, reason: `Unsupported target mode: "${targetMode}"` };
}

/**
 * Installs deep packet and subresource interception on an Electron session (SEC-18).
 */
export function installSsrfInterceptor(
  sess: ElectronSession,
  getOptions: () => InterceptorOptions,
): void {
  // 1. Intercept all outgoing subresources and navigation requests before socket creation (<all_urls>)
  sess.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const rawUrl = details.url;
    const { targetMode, allowedLoopbackPort } = getOptions();

    // Data-URIs for image subresources are harmless
    if (rawUrl.startsWith('data:image/')) {
      return callback({ cancel: false });
    }

    validateBrowserUrl(rawUrl, targetMode, allowedLoopbackPort)
      .then((res) => {
        if (!res.ok) {
          logger.warn(
            `[SSRF Interceptor] Blocked request to "${rawUrl}": ${res.reason}`,
          );
          callback({ cancel: true });
        } else {
          callback({ cancel: false });
        }
      })
      .catch((err) => {
        logger.error(`[SSRF Interceptor] Unexpected error validating URL: ${err}`);
        callback({ cancel: true });
      });
  });

  // 2. Audit redirects before navigation proceeds
  if (typeof sess.webRequest.onBeforeRedirect === 'function') {
    sess.webRequest.onBeforeRedirect({ urls: ['<all_urls>'] }, (details) => {
      const redirectUrl = details.redirectURL;
      const { targetMode, allowedLoopbackPort } = getOptions();
      validateBrowserUrl(redirectUrl, targetMode, allowedLoopbackPort).then((res) => {
        if (!res.ok) {
          logger.warn(
            `[SSRF Interceptor] Blocked redirect from "${details.url}" to "${redirectUrl}": ${res.reason}`,
          );
        }
      });
    });
  }

  // 3. Harden received responses with strict Content-Security-Policy
  sess.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
    const headers = { ...details.responseHeaders };
    headers['Content-Security-Policy'] = ["object-src 'none'; base-uri 'none';"];
    callback({ responseHeaders: headers });
  });
}
