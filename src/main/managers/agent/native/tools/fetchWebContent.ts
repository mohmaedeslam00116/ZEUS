/**
 * Native tool: fetch_web_content
 * Fetches and parses readable text/markdown from public URLs with SSRF protection (SEC-18).
 */
import { guardedGet } from '../transport';
import type { NativeTool, NativeToolExecutionContext, NativeToolResult } from './types';

const DEFAULT_MAX_LENGTH = 50_000;
const MAX_LENGTH_CEILING = 100_000;

/**
 * Basic HTML to clean text/markdown converter.
 * Strips scripts, styles, metadata, and collapses whitespace.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, '\n\n# $2\n\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const fetchWebContentTool: NativeTool = {
  name: 'fetch_web_content',
  description:
    'Fetches text and markdown documentation content from a public HTTP/HTTPS URL with strict SSRF protection.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Public URL to fetch content from.',
      },
      max_length: {
        type: 'integer',
        description: 'Maximum characters to return (default: 50000, maximum: 100000).',
      },
    },
    required: ['url'],
  },

  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    const rawUrl = String(input.url ?? '');
    if (!rawUrl.trim()) {
      return { success: false, output: 'Missing required parameter: "url"', error: 'Missing url' };
    }

    let maxLength = DEFAULT_MAX_LENGTH;
    if (typeof input.max_length === 'number' && Number.isFinite(input.max_length)) {
      maxLength = Math.min(MAX_LENGTH_CEILING, Math.max(500, Math.floor(input.max_length)));
    }

    try {
      const rawBody = await guardedGet(rawUrl, {
        signal: context.abortSignal,
        allowPrivate: false,
        timeoutMs: 20_000,
      });

      const isHtml = /<html|<body|<div|<p\b/i.test(rawBody.slice(0, 1000));
      let content = isHtml ? htmlToText(rawBody) : rawBody.trim();

      let truncated = false;
      if (content.length > maxLength) {
        content = content.slice(0, maxLength);
        truncated = true;
      }

      const output = [
        `URL: ${rawUrl}`,
        `Content:`,
        content,
        truncated ? `\n[Content truncated at ${maxLength} characters]` : '',
      ]
        .filter(Boolean)
        .join('\n');

      return {
        success: true,
        output,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Failed to fetch URL ${rawUrl}: ${msg}`,
        error: msg,
      };
    }
  },
};
