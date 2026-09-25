/**
 * Native tool: write_file
 * Writes or creates a file within the workspace, creating any missing parent directories.
 */
import path from 'node:path';
import fs from 'node:fs';
import { assertInsideWorkspace } from './pathGuard';
import type { NativeTool, NativeToolExecutionContext, NativeToolResult } from './types';

export const writeFileTool: NativeTool = {
  name: 'write_file',
  description:
    'Writes or creates a file within the workspace. Automatically creates any missing parent directories.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write, relative to the workspace root.',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file.',
      },
    },
    required: ['path', 'content'],
  },

  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    const rawPath = String(input.path ?? input.file_path ?? '');
    if (!rawPath.trim()) {
      return { success: false, output: 'Missing required parameter: "path"', error: 'Missing path' };
    }

    if (input.content === undefined || input.content === null) {
      return {
        success: false,
        output: 'Missing required parameter: "content"',
        error: 'Missing content',
      };
    }

    const content = String(input.content);

    let absPath: string;
    try {
      absPath = assertInsideWorkspace(context.workspaceRoot, rawPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: msg, error: msg };
    }

    try {
      const parentDir = path.dirname(absPath);
      if (!fs.existsSync(parentDir)) {
        await fs.promises.mkdir(parentDir, { recursive: true });
      }

      await fs.promises.writeFile(absPath, content, 'utf8');
      const bytes = Buffer.byteLength(content, 'utf8');

      return {
        success: true,
        output: `Successfully wrote ${bytes} bytes to ${rawPath}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Failed to write file ${rawPath}: ${msg}`,
        error: msg,
      };
    }
  },
};
