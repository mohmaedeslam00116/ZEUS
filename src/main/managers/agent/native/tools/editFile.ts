/**
 * Native tool: edit_file
 * Applies precise search/replace edits to a file and computes unified diff previews.
 */
import fs from 'node:fs';
import { assertInsideWorkspace } from './pathGuard';
import { computeUnifiedDiff } from './diff';
import type { NativeTool, NativeToolExecutionContext, NativeToolResult } from './types';

export const editFileTool: NativeTool = {
  name: 'edit_file',
  description:
    'Applies precise search/replace edits to an existing file within the workspace and computes unified diff previews for user review.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit, relative to the workspace root.',
      },
      target_content: {
        type: 'string',
        description: 'Exact text chunk in the file to be replaced.',
      },
      replacement_content: {
        type: 'string',
        description: 'Replacement text to insert in place of target_content.',
      },
    },
    required: ['path', 'target_content', 'replacement_content'],
  },

  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    const rawPath = String(input.path ?? input.file_path ?? '');
    if (!rawPath.trim()) {
      return { success: false, output: 'Missing required parameter: "path"', error: 'Missing path' };
    }

    const targetContent = String(
      input.target_content ?? input.old_str ?? input.old_content ?? '',
    );
    if (!targetContent) {
      return {
        success: false,
        output: 'Missing required parameter: "target_content"',
        error: 'Missing target_content',
      };
    }

    const replacementContent = String(
      input.replacement_content ?? input.new_str ?? input.new_content ?? '',
    );

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

    try {
      const originalContent = await fs.promises.readFile(absPath, 'utf8');

      if (!originalContent.includes(targetContent)) {
        return {
          success: false,
          output: `Target content not found in ${rawPath}. Ensure target_content matches the exact characters, indentation, and newlines in the file.`,
          error: 'Target content not found',
        };
      }

      // Check for multiple occurrences
      const firstIndex = originalContent.indexOf(targetContent);
      const nextIndex = originalContent.indexOf(targetContent, firstIndex + targetContent.length);
      if (nextIndex !== -1 && !input.allow_multiple) {
        return {
          success: false,
          output: `Target content occurs multiple times in ${rawPath}. Provide a larger surrounding context in target_content to disambiguate the replacement location.`,
          error: 'Ambiguous target content',
        };
      }

      const updatedContent = input.allow_multiple
        ? originalContent.split(targetContent).join(replacementContent)
        : originalContent.slice(0, firstIndex) +
          replacementContent +
          originalContent.slice(firstIndex + targetContent.length);

      const diff = computeUnifiedDiff(rawPath, originalContent, updatedContent);

      await fs.promises.writeFile(absPath, updatedContent, 'utf8');

      const summary = [
        `Successfully applied edit to ${rawPath}.`,
        'Unified diff preview:',
        diff ? `\`\`\`diff\n${diff}\n\`\`\`` : '[No net textual change]',
      ].join('\n');

      return {
        success: true,
        output: summary,
        diff,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Failed to edit file ${rawPath}: ${msg}`,
        error: msg,
      };
    }
  },
};
