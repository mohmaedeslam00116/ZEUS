/**
 * Native tool: read_file
 * Reads file content within workspace boundaries with optional 1-based line range slicing.
 */
import fs from 'node:fs';
import { assertInsideWorkspace } from './pathGuard';
import type { NativeTool, NativeToolExecutionContext, NativeToolResult } from './types';

export const readFileTool: NativeTool = {
  name: 'read_file',
  description:
    'Reads the content of a file within the workspace. Supports optional line range slicing with 1-based line numbers for precise inspection.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read, relative to the workspace root.',
      },
      start_line: {
        type: 'integer',
        description: 'Optional 1-based start line number (inclusive).',
      },
      end_line: {
        type: 'integer',
        description: 'Optional 1-based end line number (inclusive).',
      },
    },
    required: ['path'],
  },

  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    const rawPath = String(input.path ?? input.file_path ?? '');
    if (!rawPath.trim()) {
      return { success: false, output: 'Missing required parameter: "path"', error: 'Missing path' };
    }

    let absPath: string;
    try {
      absPath = assertInsideWorkspace(context.workspaceRoot, rawPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: msg, error: msg };
    }

    if (!fs.existsSync(absPath)) {
      return {
        success: false,
        output: `File not found: ${rawPath}`,
        error: `File not found: ${rawPath}`,
      };
    }

    const stat = await fs.promises.stat(absPath);
    if (stat.isDirectory()) {
      return {
        success: false,
        output: `Path is a directory, not a file: ${rawPath}`,
        error: 'Path is a directory',
      };
    }

    const buf = await fs.promises.readFile(absPath);
    // Quick binary detection: check first 512 bytes for null bytes
    const checkLen = Math.min(buf.length, 512);
    for (let i = 0; i < checkLen; i++) {
      if (buf[i] === 0) {
        return {
          success: true,
          output: `[Binary file (${stat.size} bytes): cannot display text content]`,
        };
      }
    }

    const text = buf.toString('utf8');
    const lines = text.split(/\r?\n/);
    const totalLines = lines.length;

    let start = 1;
    let end = totalLines;

    if (typeof input.start_line === 'number' && Number.isFinite(input.start_line)) {
      start = Math.max(1, Math.min(Math.floor(input.start_line), totalLines));
    }
    if (typeof input.end_line === 'number' && Number.isFinite(input.end_line)) {
      end = Math.max(start, Math.min(Math.floor(input.end_line), totalLines));
    }

    const sliced = lines.slice(start - 1, end);
    const maxLineNumWidth = String(end).length;
    const formatted = sliced
      .map((line, idx) => {
        const lineNum = String(start + idx).padStart(maxLineNumWidth, ' ');
        return `${lineNum} | ${line}`;
      })
      .join('\n');

    return {
      success: true,
      output: formatted || '[Empty file]',
    };
  },
};
