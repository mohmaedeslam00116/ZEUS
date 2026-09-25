/**
 * Native tool: search_codebase
 * Executes ripgrep/regex file pattern queries across workspace files.
 */
import path from 'node:path';
import fs from 'node:fs';
import { assertInsideWorkspace } from './pathGuard';
import type { NativeTool, NativeToolExecutionContext, NativeToolResult } from './types';

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.vite',
  '.next',
  '.turbo',
  'coverage',
  '.cache',
  'tmp',
  'out',
]);

const IGNORED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.svg',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.wav',
  '.db',
  '.sqlite',
  '.wal',
  '.shm',
  '.map',
]);

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB per file limit
const DEFAULT_MAX_RESULTS = 50;

export const searchCodebaseTool: NativeTool = {
  name: 'search_codebase',
  description:
    'Executes ripgrep/regex file pattern queries across workspace files, returning matching file paths, line numbers, and contents.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Text or regular expression pattern to search for in files.',
      },
      path: {
        type: 'string',
        description: 'Optional sub-directory or file path to restrict the search to, relative to workspace root.',
      },
      is_regex: {
        type: 'boolean',
        description: 'Whether the query should be treated as a regular expression (default: false).',
      },
      max_results: {
        type: 'integer',
        description: 'Maximum number of matching lines to return (default: 50, maximum: 200).',
      },
    },
    required: ['query'],
  },

  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    const rawQuery = String(input.query ?? '');
    if (!rawQuery.trim()) {
      return { success: false, output: 'Missing required parameter: "query"', error: 'Missing query' };
    }

    const subPath = typeof input.path === 'string' && input.path.trim().length > 0 ? input.path.trim() : '.';
    let searchTarget: string;
    try {
      searchTarget = assertInsideWorkspace(context.workspaceRoot, subPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: msg, error: msg };
    }

    const isRegex = input.is_regex === true;
    let matcher: (line: string) => boolean;

    try {
      if (isRegex) {
        const regex = new RegExp(rawQuery, 'i');
        matcher = (line: string) => regex.test(line);
      } else {
        const lowerQuery = rawQuery.toLowerCase();
        matcher = (line: string) => line.toLowerCase().includes(lowerQuery);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Invalid regular expression "${rawQuery}": ${msg}`,
        error: msg,
      };
    }

    let maxResults = DEFAULT_MAX_RESULTS;
    if (typeof input.max_results === 'number' && Number.isFinite(input.max_results)) {
      maxResults = Math.min(200, Math.max(1, Math.floor(input.max_results)));
    }

    const matches: Array<{ relPath: string; lineNum: number; line: string }> = [];

    async function walk(currentPath: string): Promise<void> {
      if (matches.length >= maxResults) return;
      if (context.abortSignal?.aborted) return;

      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(currentPath);
      } catch {
        return;
      }

      if (stat.isDirectory()) {
        const base = path.basename(currentPath);
        if (IGNORED_DIRS.has(base)) return;

        let entries: string[] = [];
        try {
          entries = await fs.promises.readdir(currentPath);
        } catch {
          return;
        }

        for (const entry of entries) {
          if (matches.length >= maxResults) break;
          await walk(path.join(currentPath, entry));
        }
      } else if (stat.isFile()) {
        const ext = path.extname(currentPath).toLowerCase();
        if (IGNORED_EXTENSIONS.has(ext)) return;
        if (stat.size > MAX_FILE_SIZE_BYTES) return;

        let content: string;
        try {
          content = await fs.promises.readFile(currentPath, 'utf8');
        } catch {
          return;
        }

        const lines = content.split(/\r?\n/);
        const relPath = path.relative(context.workspaceRoot, currentPath).replace(/\\/g, '/');

        for (let idx = 0; idx < lines.length; idx++) {
          if (matches.length >= maxResults) break;
          const line = lines[idx];
          if (matcher(line)) {
            matches.push({
              relPath,
              lineNum: idx + 1,
              line: line.trim().slice(0, 300),
            });
          }
        }
      }
    }

    await walk(searchTarget);

    if (matches.length === 0) {
      return {
        success: true,
        output: `No matches found for "${rawQuery}" in ${subPath}`,
      };
    }

    const formatted = matches
      .map((m) => `${m.relPath}:${m.lineNum}: ${m.line}`)
      .join('\n');

    const header = `Found ${matches.length} match(es) for "${rawQuery}"${
      matches.length >= maxResults ? ` (capped at ${maxResults})` : ''
    }:\n`;

    return {
      success: true,
      output: header + formatted,
    };
  },
};
