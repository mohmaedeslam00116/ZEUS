/**
 * Extended Code Navigation: list_directory_tree (Spec #67 / Issues #72 & #79).
 * Generates compact, hierarchical directory outlines respecting .gitignore and XP-01 ceilings.
 */
import path from 'node:path';
import fs from 'node:fs';
import { NATIVE_RUNTIME_LIMITS } from '@shared/constants';
import type { NativeTool, NativeToolExecutionContext, NativeToolResult } from './types';
import { assertInsideWorkspace, isCrownJewel } from './pathGuard';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.gemini',
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
  '.turbo',
  '.cache',
  '.agents',
  '.vscode',
  '.idea',
]);

const MAX_ENTRIES_CEILING = NATIVE_RUNTIME_LIMITS.navigation.directoryTreeMaxEntries;
const MAX_DEPTH_CEILING = NATIVE_RUNTIME_LIMITS.navigation.directoryTreeMaxDepth;

interface TreeNode {
  name: string;
  isDir: boolean;
  children?: TreeNode[];
}

export const listDirectoryTreeTool: NativeTool = {
  name: 'list_directory_tree',
  description:
    'List a compact, hierarchical ASCII tree representation of the workspace directory structure. ' +
    'Fast and token-efficient overview of folders and files without reading file bodies.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative directory path within workspace to inspect. Defaults to workspace root (".").',
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum depth to traverse (1 to 5, default 2).',
      },
      showFiles: {
        type: 'boolean',
        description: 'Whether to list individual files or only directory branches (default true).',
      },
    },
  },

  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    const rawPath = typeof input.path === 'string' && input.path.trim().length > 0 ? input.path.trim() : '.';
    let maxDepth = 2;
    if (typeof input.maxDepth === 'number' && Number.isFinite(input.maxDepth)) {
      maxDepth = Math.max(1, Math.min(MAX_DEPTH_CEILING, Math.floor(input.maxDepth)));
    }
    const showFiles = input.showFiles !== false;

    let targetDir: string;
    try {
      targetDir = assertInsideWorkspace(context.workspaceRoot, rawPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: msg, error: msg };
    }

    try {
      const stat = await fs.promises.stat(targetDir);
      if (!stat.isDirectory()) {
        return {
          success: false,
          output: `Error: path "${rawPath}" is not a directory.`,
          error: 'Not a directory',
        };
      }
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        return {
          success: false,
          output: `Directory not found: "${rawPath}"`,
          error: 'Directory not found',
        };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: `Cannot access directory: ${msg}`, error: msg };
    }

    let entryCount = 0;
    let truncated = false;

    async function buildSubTree(dirPath: string, depth: number): Promise<TreeNode[]> {
      if (depth > maxDepth || entryCount >= MAX_ENTRIES_CEILING) {
        if (entryCount >= MAX_ENTRIES_CEILING) truncated = true;
        return [];
      }

      let dirents: fs.Dirent[];
      try {
        dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
      } catch {
        return [];
      }

      // Filter ignored directories, crown jewels, and files if not showFiles
      const filtered = dirents.filter((d) => {
        const fullChildPath = path.join(dirPath, d.name);
        if (isCrownJewel(fullChildPath)) return false;
        if (d.isDirectory()) {
          return !IGNORED_DIRS.has(d.name);
        }
        return showFiles;
      });

      // Sort directories first, then alphabetical
      filtered.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      const nodes: TreeNode[] = [];
      for (const d of filtered) {
        if (entryCount >= MAX_ENTRIES_CEILING) {
          truncated = true;
          break;
        }
        entryCount++;

        const isDir = d.isDirectory();
        const fullChildPath = path.join(dirPath, d.name);

        if (isDir) {
          const children = await buildSubTree(fullChildPath, depth + 1);
          nodes.push({ name: d.name, isDir: true, children });
        } else {
          nodes.push({ name: d.name, isDir: false });
        }
      }

      return nodes;
    }

    const rootNodes = await buildSubTree(targetDir, 1);

    const rootName = rawPath === '.' ? path.basename(context.workspaceRoot) || '.' : rawPath;
    const lines: string[] = [`${rootName}/`];

    function renderTree(nodes: TreeNode[], prefix = ''): void {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isLast = i === nodes.length - 1;
        const pointer = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';

        lines.push(`${prefix}${pointer}${node.name}${node.isDir ? '/' : ''}`);
        if (node.children && node.children.length > 0) {
          renderTree(node.children, `${prefix}${childPrefix}`);
        }
      }
    }

    renderTree(rootNodes);

    if (truncated) {
      lines.push(`\n... [output truncated at ${MAX_ENTRIES_CEILING} entries (XP-01 ceiling)]`);
    }

    return {
      success: true,
      output: lines.join('\n'),
    };
  },
};
