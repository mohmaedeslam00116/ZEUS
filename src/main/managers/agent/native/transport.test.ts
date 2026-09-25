import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { guardedPostSse } from './transport';

describe('guardedPostSse', () => {
  it('streams chunks from HTTP server and completes cleanly', async () => {
    // Spin up an in-memory HTTP server
    const server = http.createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('data: {"text":"chunk1"}\n\n');
      setTimeout(() => {
        res.write('data: {"text":"chunk2"}\n\n');
        res.end();
      }, 20);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}/stream`;

    try {
      const stream = await guardedPostSse(
        url,
        { prompt: 'test' },
        { allowPrivate: true },
      );

      const received: string[] = [];
      for await (const chunk of stream) {
        received.push(chunk);
      }

      const combined = received.join('');
      expect(combined).toContain('chunk1');
      expect(combined).toContain('chunk2');
    } finally {
      server.close();
    }
  });

  it('rejects immediately when AbortSignal is already aborted or triggered mid-stream', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: line 1\n\n');
      // hangs indefinitely
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}/hang`;

    const controller = new AbortController();

    try {
      const stream = await guardedPostSse(
        url,
        {},
        { allowPrivate: true, signal: controller.signal },
      );

      // Trigger abort after getting first chunk
      const readPromise = (async () => {
        for await (const chunk of stream) {
          void chunk;
          controller.abort();
        }
      })();

      await expect(readPromise).rejects.toThrow();
    } finally {
      server.close();
    }
  });

  it('throws descriptive error on non-200 HTTP responses', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Incorrect API key provided' } }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}/error`;

    try {
      await expect(
        guardedPostSse(url, {}, { allowPrivate: true }),
      ).rejects.toThrow(/Incorrect API key provided|HTTP 401/);
    } finally {
      server.close();
    }
  });

  it('rejects URLs with embedded credentials or plain HTTP when allowPrivate is false (SEC-18)', async () => {
    await expect(
      guardedPostSse('https://user:pass@api.openai.com/v1/chat/completions', {}),
    ).rejects.toThrow('Credentials in URLs are forbidden');

    await expect(
      guardedPostSse('http://api.openai.com/v1/chat/completions', {}, { allowPrivate: false }),
    ).rejects.toThrow('Only HTTPS is supported for remote providers');
  });
});
