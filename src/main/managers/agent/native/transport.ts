/**
 * SSRF-Guarded HTTP/HTTPS SSE Transport (SEC-18).
 * Provides streaming request capabilities with IP resolution pinning and AbortController integration.
 */
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { NATIVE_RUNTIME_LIMITS } from '@shared/constants';
import { makeGuardedLookup } from '../../../net/ssrfGuard';
import type { NativeStreamTransportOptions } from './types';

/**
 * Executes a POST request to an SSE streaming endpoint with SSRF guard and AbortSignal support.
 * Returns an AsyncIterable yielding string chunks from the server.
 */
export async function guardedPostSse(
  targetUrl: string,
  body: unknown,
  options: NativeStreamTransportOptions = {},
): Promise<AsyncIterable<string>> {
  const url = new URL(targetUrl);
  // SEC-18 / SEC-14: Credentials in URLs are strictly forbidden.
  if (url.username || url.password) {
    throw new Error('Credentials in URLs are forbidden');
  }

  // SEC-18: Remote providers must use HTTPS. Plain HTTP is only permitted when allowPrivate is explicitly true (e.g. local Ollama).
  const isHttps = url.protocol === 'https:';
  if (!isHttps && (!options.allowPrivate || url.protocol !== 'http:')) {
    throw new Error(`Only HTTPS is supported for remote providers (got: ${url.protocol})`);
  }

  const transport = isHttps ? https : http;
  const timeoutMs = options.timeoutMs ?? NATIVE_RUNTIME_LIMITS.defaultTimeoutMs;
  const payload = Buffer.from(JSON.stringify(body), 'utf8');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream, application/json',
    'Content-Length': String(payload.byteLength),
    ...(options.headers || {}),
  };

  const lookup = makeGuardedLookup({
    allowPrivate: options.allowPrivate ?? false,
  });

  return new Promise<AsyncIterable<string>>((resolve, reject) => {
    let settled = false;

    if (options.signal?.aborted) {
      return reject(new Error('Request aborted by caller'));
    }

    const req = transport.request(
      url,
      {
        method: 'POST',
        headers,
        lookup,
        timeout: timeoutMs,
      },
      (res) => {
        const statusCode = res.statusCode ?? 500;

        if (statusCode < 200 || statusCode >= 300) {
          settled = true;
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const rawBody = Buffer.concat(chunks).toString('utf8');
            let errorDetail = rawBody;
            try {
              const parsed = JSON.parse(rawBody);
              if (parsed?.error?.message) {
                errorDetail = parsed.error.message;
              } else if (parsed?.message) {
                errorDetail = parsed.message;
              }
            } catch {
              // keep raw
            }
            reject(new Error(`HTTP ${statusCode}: ${errorDetail || 'Request failed'}`));
          });
          return;
        }

        settled = true;

        // Create an async generator that yields chunks from the response stream
        async function* streamGenerator(): AsyncIterable<string> {
          res.setEncoding('utf8');

          const queue: string[] = [];
          let error: Error | null = null;
          let done = false;
          let notify: (() => void) | null = null;

          const onAbort = () => {
            error = new Error('Request aborted by caller');
            res.destroy();
            if (notify) notify();
          };

          if (options.signal) {
            options.signal.addEventListener('abort', onAbort, { once: true });
          }

          res.on('data', (chunk: string) => {
            queue.push(chunk);
            if (notify) {
              const cb = notify;
              notify = null;
              cb();
            }
          });

          res.on('end', () => {
            done = true;
            if (notify) {
              const cb = notify;
              notify = null;
              cb();
            }
          });

          res.on('error', (err) => {
            error = err;
            if (notify) {
              const cb = notify;
              notify = null;
              cb();
            }
          });

          try {
            while (true) {
              if (error) {
                throw error;
              }
              const next = queue.shift();
              if (next !== undefined) {
                yield next;
                continue;
              }
              if (done) {
                break;
              }
              await new Promise<void>((r) => {
                notify = r;
              });
            }
          } finally {
            if (options.signal) {
              options.signal.removeEventListener('abort', onAbort);
            }
            res.destroy();
          }
        }

        resolve(streamGenerator());
      },
    );

    req.on('timeout', () => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    if (options.signal) {
      options.signal.addEventListener(
        'abort',
        () => {
          if (!settled) {
            settled = true;
            req.destroy();
            reject(new Error('Request aborted by caller'));
          }
        },
        { once: true },
      );
    }

    req.write(payload);
    req.end();
  });
}

/**
 * Executes a GET request with SSRF guard (SEC-18) and AbortSignal support.
 * Returns the text response body.
 */
export async function guardedGet(
  targetUrl: string,
  options: {
    headers?: Record<string, string>;
    allowPrivate?: boolean;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  const url = new URL(targetUrl);
  // SEC-18 / SEC-14: Credentials in URLs are strictly forbidden.
  if (url.username || url.password) {
    throw new Error('Credentials in URLs are forbidden');
  }

  // SEC-18: Remote URLs must use HTTPS. Plain HTTP is only permitted when allowPrivate is explicitly true.
  const isHttps = url.protocol === 'https:';
  if (!isHttps && (!options.allowPrivate || url.protocol !== 'http:')) {
    throw new Error(`Only HTTPS is supported for remote requests (got: ${url.protocol})`);
  }

  const transport = isHttps ? https : http;
  const timeoutMs = options.timeoutMs ?? NATIVE_RUNTIME_LIMITS.defaultTimeoutMs;

  const headers: Record<string, string> = {
    'User-Agent': 'ZEUS-Native-Agent/1.0',
    Accept: 'text/html, application/xhtml+xml, text/plain, application/json, */*',
    ...(options.headers || {}),
  };

  const lookup = makeGuardedLookup({
    allowPrivate: options.allowPrivate ?? false,
  });

  return new Promise<string>((resolve, reject) => {
    let settled = false;

    if (options.signal?.aborted) {
      return reject(new Error('Request aborted by caller'));
    }

    const req = transport.request(
      url,
      {
        method: 'GET',
        headers,
        lookup,
        timeout: timeoutMs,
      },
      (res) => {
        const statusCode = res.statusCode ?? 500;
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        const MAX_GET_BYTES = 5 * 1024 * 1024; // 5 MiB ceiling (XP-01)

        res.on('data', (c: Buffer) => {
          totalBytes += c.length;
          if (totalBytes > MAX_GET_BYTES) {
            settled = true;
            req.destroy();
            reject(new Error(`Response exceeded maximum allowed size of ${MAX_GET_BYTES} bytes`));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          const body = Buffer.concat(chunks).toString('utf8');
          if (statusCode < 200 || statusCode >= 300) {
            return reject(new Error(`HTTP ${statusCode}: ${body.slice(0, 500) || 'Request failed'}`));
          }
          resolve(body);
        });

      },
    );

    req.on('timeout', () => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    if (options.signal) {
      options.signal.addEventListener(
        'abort',
        () => {
          if (!settled) {
            settled = true;
            req.destroy();
            reject(new Error('Request aborted by caller'));
          }
        },
        { once: true },
      );
    }

    req.end();
  });
}

