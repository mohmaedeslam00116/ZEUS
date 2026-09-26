/**
 * Native tool: browser_action (SEC-01, SEC-02, SEC-18, Ticket #77).
 *
 * Performs sandboxed headless browser automation (navigation, screenshots,
 * clicking, typing, scrolling, console inspection) with strict SSRF protection.
 */
import { getBrowserActionManager } from '../../../browser/BrowserActionManager';
import type { NativeTool, NativeToolExecutionContext, NativeToolResult } from './types';
import type { BrowserTargetMode } from '../../../browser/ssrfBrowserInterceptor';
import { NATIVE_RUNTIME_LIMITS } from '@shared/constants';

export const browserActionTool: NativeTool = {
  name: 'browser_action',
  group: 'browser',
  description:
    'Performs sandboxed browser automation actions including navigating to web pages, capturing visual screenshots, clicking elements, entering text, scrolling, and reading console logs with strict SSRF protection.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['launch', 'click', 'type', 'scroll', 'screenshot', 'get_console_logs', 'close'],
        description: 'The browser action to execute.',
      },
      url: {
        type: 'string',
        description:
          'The URL to navigate to (required for "launch" when navigating or changing pages).',
      },
      target_mode: {
        type: 'string',
        enum: ['remote_web', 'local_dev'],
        description:
          'Target network mode. "remote_web" blocks all private and loopback IPs. "local_dev" permits loopback connections exclusively for local dev server testing.',
      },
      allowed_loopback_port: {
        type: 'integer',
        description:
          'Approved loopback server port when target_mode is "local_dev" (e.g. 3000, 5173, 8080).',
      },
      coordinate: {
        type: 'object',
        properties: {
          x: { type: 'integer', description: 'X coordinate in viewport pixels.' },
          y: { type: 'integer', description: 'Y coordinate in viewport pixels.' },
        },
        description: 'Viewport coordinates for "click".',
      },
      selector: {
        type: 'string',
        description: 'CSS selector target for "click", "type", or "scroll".',
      },
      text: {
        type: 'string',
        description: 'The text string to type when action is "type".',
      },
      submit: {
        type: 'boolean',
        description: 'Whether to press Enter after typing text.',
      },
      clear: {
        type: 'boolean',
        description: 'Whether to clear existing field content before typing.',
      },
      delta_x: {
        type: 'integer',
        description: 'Horizontal scroll offset in pixels for "scroll".',
      },
      delta_y: {
        type: 'integer',
        description: 'Vertical scroll offset in pixels for "scroll".',
      },
      viewport: {
        type: 'object',
        properties: {
          width: { type: 'integer', description: 'Viewport width in pixels (e.g. 1280).' },
          height: { type: 'integer', description: 'Viewport height in pixels (e.g. 800).' },
        },
        description: 'Viewport dimensions for browser window.',
      },
      quality: {
        type: 'integer',
        description: 'JPEG compression quality (10-100) for "screenshot". Default is 80.',
      },
      log_level: {
        type: 'string',
        enum: ['all', 'error', 'warn', 'info'],
        description: 'Filter level for "get_console_logs". Default is "all".',
      },
    },
    required: ['action'],
  },

  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    const action = String(input.action ?? '').trim();
    if (!action) {
      return { success: false, output: 'Missing required parameter: "action"', error: 'Missing action' };
    }

    const browserManager = getBrowserActionManager();
    const session = browserManager.getOrCreateSession(context.sessionId);

    try {
      switch (action) {
        case 'launch': {
          const url = typeof input.url === 'string' ? input.url.trim() : undefined;
          const targetMode = (input.target_mode as BrowserTargetMode) ?? 'remote_web';
          const allowedLoopbackPort =
            typeof input.allowed_loopback_port === 'number'
              ? input.allowed_loopback_port
              : undefined;

          const viewport =
            typeof input.viewport === 'object' && input.viewport !== null
              ? (input.viewport as { width: number; height: number })
              : undefined;

          await session.launch({
            url,
            viewport,
            targetMode,
            allowedLoopbackPort,
          });

          const currentUrl = session.getUrl() || url || '(blank)';
          const title = session.getTitle() || '(no title)';
          return {
            success: true,
            output: `Browser launched successfully.\nURL: ${currentUrl}\nTitle: ${title}`,
          };
        }

        case 'screenshot': {
          const quality = typeof input.quality === 'number' ? input.quality : undefined;
          const result = await session.captureScreenshot(quality);
          return {
            success: true,
            output: `Screenshot captured successfully for "${result.title}" (${result.url}).\nDimensions: ${result.viewport.width}x${result.viewport.height}\nData URL: ${result.dataUrl}`,
          };
        }

        case 'click': {
          const coordinate =
            typeof input.coordinate === 'object' && input.coordinate !== null
              ? (input.coordinate as { x: number; y: number })
              : undefined;
          const selector = typeof input.selector === 'string' ? input.selector : undefined;

          await session.click(coordinate, selector);
          const targetDesc = selector ? `selector "${selector}"` : `(${coordinate?.x}, ${coordinate?.y})`;
          return {
            success: true,
            output: `Clicked ${targetDesc} successfully.`,
          };
        }

        case 'type': {
          const text = String(input.text ?? '');
          const selector = typeof input.selector === 'string' ? input.selector : undefined;
          const submit = Boolean(input.submit);
          const clear = Boolean(input.clear);

          await session.type(text, selector, submit, clear);
          const targetDesc = selector ? `into selector "${selector}"` : 'at focused element';
          return {
            success: true,
            output: `Typed "${text}" ${targetDesc} successfully.`,
          };
        }

        case 'scroll': {
          const deltaX = typeof input.delta_x === 'number' ? input.delta_x : 0;
          const deltaY = typeof input.delta_y === 'number' ? input.delta_y : 0;

          await session.scroll(deltaX, deltaY);
          return {
            success: true,
            output: `Scrolled by (${deltaX}, ${deltaY}) pixels.`,
          };
        }

        case 'get_console_logs': {
          const logLevel = (input.log_level as 'all' | 'error' | 'warn' | 'info') ?? 'all';
          const clear = Boolean(input.clear);
          const logs = session.getConsoleLogs(logLevel, clear);

          if (logs.length === 0) {
            return {
              success: true,
              output: 'No console logs captured.',
            };
          }

          const { maxOutputLogChars, maxLogLineLength } = NATIVE_RUNTIME_LIMITS.browser;
          const lines: string[] = [];
          let currentLength = 0;

          for (const l of logs) {
            const rawText =
              l.text.length > maxLogLineLength
                ? `${l.text.slice(0, maxLogLineLength)}... [truncated]`
                : l.text;
            const line = `[${new Date(l.timestamp).toISOString()}] [${l.level.toUpperCase()}] ${rawText}${l.sourceUrl ? ` (${l.sourceUrl}:${l.lineNumber})` : ''}`;
            if (currentLength + line.length > maxOutputLogChars) {
              lines.push(`... [truncated past ${maxOutputLogChars} characters]`);
              break;
            }
            lines.push(line);
            currentLength += line.length + 1;
          }

          return {
            success: true,
            output: `Captured ${logs.length} console log entries:\n${lines.join('\n')}`,
          };
        }

        case 'close': {
          await browserManager.closeSession(context.sessionId);
          return {
            success: true,
            output: 'Browser session closed and isolated partition memory cleared.',
          };
        }

        default:
          return {
            success: false,
            output: `Unknown browser action: "${action}". Valid actions: launch, click, type, scroll, screenshot, get_console_logs, close.`,
            error: `Unknown action: ${action}`,
          };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Browser action "${action}" failed: ${msg}`,
        error: msg,
      };
    }
  },
};
