/**
 * Native Git Tools: git_checkpoint and git_commit (Ticket #75 / Wayfinder Map #67).
 *
 * Implements lightweight snapshot refs under refs/zeus/checkpoints/ (SEC-19 read/governance auto-allowed)
 * and Conventional Commits with path containment validation (SEC-11/12, SEC-19 mutating write tool).
 */
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { NATIVE_RUNTIME_LIMITS } from '@shared/constants';
import type { NativeTool, NativeToolExecutionContext, NativeToolResult } from './types';
import { assertInsideWorkspace } from './pathGuard';
import { runGit, gitText } from '../../../git/exec';

const { maxLabelLength, maxMessageLength, maxFilesCount } = NATIVE_RUNTIME_LIMITS.git;

/**
 * Standard Conventional Commit types.
 */
export const CONVENTIONAL_COMMIT_TYPES = new Set([
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
]);

const CONVENTIONAL_COMMIT_RE = /^([a-z]+)(?:\(([a-zA-Z0-9_\-./]+)\))?(!)?:\s*(.+)$/;

function truncateOutput(text: string, max = 500): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}...` : trimmed;
}

export const gitCheckpointTool: NativeTool = {
  name: 'git_checkpoint',
  description:
    'Create a lightweight, dedicated Git checkpoint snapshot of the current workspace state under refs/zeus/checkpoints/ without modifying branches or touching git history. Safe and non-destructive.',
  group: 'command',
  parameters: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
        description:
          'A concise human-readable description for this checkpoint snapshot (e.g. "before refactoring auth logic"). Max 140 chars.',
      },
    },
    required: ['label'],
    additionalProperties: false,
  },
  async execute(input: Record<string, unknown>, context: NativeToolExecutionContext): Promise<NativeToolResult> {
    const rawLabel = input.label;
    if (typeof rawLabel !== 'string' || !rawLabel.trim()) {
      return {
        success: false,
        output: '',
        error: 'Label must be a non-empty string.',
      };
    }

    const label = rawLabel.trim();
    if (label.length > maxLabelLength) {
      return {
        success: false,
        output: '',
        error: `Label exceeds maximum length of ${maxLabelLength} characters (received ${label.length}).`,
      };
    }

    try {
      if (context.gitManager && context.workspaceId) {
        const ckpt = await context.gitManager.createCheckpoint(
          context.workspaceId,
          context.sessionId,
          label,
          { auto: false },
        );
        if (!ckpt) {
          return {
            success: false,
            output: '',
            error: 'Failed to create checkpoint. Ensure workspace is a valid Git repository.',
          };
        }
        return {
          success: true,
          output: [
            'Successfully created git checkpoint:',
            `  Ref: ${ckpt.ref}`,
            `  Commit: ${ckpt.commit.slice(0, 8)}`,
            `  Label: ${ckpt.label}`,
            `  Files preserved: ${ckpt.files.length}`,
          ].join('\n'),
        };
      }

      // Standalone / direct git fallback using safe runGit and temporary index
      const isInsideWorkTree = await gitText(context.workspaceRoot, ['rev-parse', '--is-inside-work-tree']);
      if (isInsideWorkTree !== 'true') {
        return {
          success: false,
          output: '',
          error: 'Workspace is not a valid Git repository.',
        };
      }

      const tmpIndex = path.join(os.tmpdir(), `zeus-ckpt-fb-${crypto.randomUUID()}.index`);
      const env = { GIT_INDEX_FILE: tmpIndex };
      try {
        const head = await gitText(context.workspaceRoot, ['rev-parse', '--verify', 'HEAD']);
        if (head) await runGit(context.workspaceRoot, ['read-tree', 'HEAD'], { env });
        const addRes = await runGit(context.workspaceRoot, ['add', '-A'], { env });
        if (!addRes.ok) {
          return {
            success: false,
            output: '',
            error: `Failed to stage workspace state: ${truncateOutput(addRes.stderr)}`,
          };
        }

        const writeTreeRes = await runGit(context.workspaceRoot, ['write-tree'], { env });
        if (!writeTreeRes.ok) {
          return {
            success: false,
            output: '',
            error: `Failed to write git tree: ${truncateOutput(writeTreeRes.stderr)}`,
          };
        }
        const tree = writeTreeRes.stdout.trim();

        const commitArgs = [
          '-c', 'user.name=Zeus Checkpoint',
          '-c', 'user.email=checkpoint@zeus.local',
          'commit-tree',
          tree,
          '-m',
          `[zeus checkpoint] ${label}`,
        ];
        if (head) commitArgs.push('-p', head);

        const commitRes = await runGit(context.workspaceRoot, commitArgs, { env });
        if (!commitRes.ok) {
          return {
            success: false,
            output: '',
            error: `Failed to commit checkpoint tree: ${truncateOutput(commitRes.stderr)}`,
          };
        }
        const commitHash = commitRes.stdout.trim();

        const ts = Date.now();
        const ref = `refs/zeus/checkpoints/${context.sessionId}/${ts}`;
        const updateRefRes = await runGit(context.workspaceRoot, ['update-ref', ref, commitHash]);
        if (!updateRefRes.ok) {
          return {
            success: false,
            output: '',
            error: `Failed to update checkpoint ref: ${truncateOutput(updateRefRes.stderr)}`,
          };
        }

        return {
          success: true,
          output: [
            'Successfully created git checkpoint:',
            `  Ref: ${ref}`,
            `  Commit: ${commitHash.slice(0, 8)}`,
            `  Label: ${label}`,
          ].join('\n'),
        };
      } finally {
        try {
          if (fs.existsSync(tmpIndex)) fs.unlinkSync(tmpIndex);
        } catch {
          // cleanup best effort
        }
      }
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

export const gitCommitTool: NativeTool = {
  name: 'git_commit',
  description:
    'Stage specified files (or all changes) and generate a Git commit using Conventional Commits specification (e.g. feat(scope): subject, fix: subject). Mutating operation.',
  group: 'command',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description:
          'Conventional commit message following format: <type>(<scope>): <description> or <type>: <description>. Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. Max 500 chars.',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of file paths to stage and commit (workspace-relative). If omitted or empty, all modified and untracked files are staged (git add -A).',
      },
    },
    required: ['message'],
    additionalProperties: false,
  },
  async execute(input: Record<string, unknown>, context: NativeToolExecutionContext): Promise<NativeToolResult> {
    const rawMessage = input.message;
    if (typeof rawMessage !== 'string' || !rawMessage.trim()) {
      return {
        success: false,
        output: '',
        error: 'Commit message must be a non-empty string.',
      };
    }

    const message = rawMessage.trim();
    if (message.length > maxMessageLength) {
      return {
        success: false,
        output: '',
        error: `Commit message exceeds maximum length of ${maxMessageLength} characters (received ${message.length}).`,
      };
    }

    // Validate Conventional Commits format on the first line (subject)
    const firstLine = message.split(/\r?\n/)[0].trim();
    const match = firstLine.match(CONVENTIONAL_COMMIT_RE);
    if (!match) {
      return {
        success: false,
        output: '',
        error:
          'Commit message does not match Conventional Commits format (e.g. "feat(auth): add refresh token" or "fix: resolve timeout").',
      };
    }

    const type = match[1];
    if (!CONVENTIONAL_COMMIT_TYPES.has(type)) {
      return {
        success: false,
        output: '',
        error: `Invalid Conventional Commit type "${type}". Allowed types: ${Array.from(CONVENTIONAL_COMMIT_TYPES).join(', ')}.`,
      };
    }

    const description = match[4]?.trim();
    if (!description) {
      return {
        success: false,
        output: '',
        error: 'Commit message subject description cannot be empty.',
      };
    }

    // Path containment validation (SEC-11/12/14)
    const rawFiles = input.files;
    let targetFiles: string[] | undefined;
    if (rawFiles !== undefined && rawFiles !== null) {
      if (!Array.isArray(rawFiles)) {
        return {
          success: false,
          output: '',
          error: 'The "files" parameter must be an array of string paths.',
        };
      }
      if (rawFiles.length > maxFilesCount) {
        return {
          success: false,
          output: '',
          error: `Cannot stage more than ${maxFilesCount} files in a single commit (received ${rawFiles.length}).`,
        };
      }

      targetFiles = [];
      for (const item of rawFiles) {
        if (typeof item !== 'string' || !item.trim()) {
          return {
            success: false,
            output: '',
            error: 'Each item in "files" must be a non-empty string.',
          };
        }
        try {
          const resolved = assertInsideWorkspace(context.workspaceRoot, item.trim());
          const relPosix = path.relative(context.workspaceRoot, resolved).replace(/\\/g, '/');
          targetFiles.push(relPosix);
        } catch (err) {
          return {
            success: false,
            output: '',
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    }

    try {
      // 1. Stage files
      if (targetFiles && targetFiles.length > 0) {
        for (const file of targetFiles) {
          if (context.gitManager && context.workspaceId) {
            await context.gitManager.stage(context.workspaceId, file);
          } else {
            const addRes = await runGit(context.workspaceRoot, ['add', '--', file]);
            if (!addRes.ok) {
              return {
                success: false,
                output: '',
                error: `Failed to stage file "${file}": ${truncateOutput(addRes.stderr)}`,
              };
            }
          }
        }
      } else {
        if (context.gitManager && context.workspaceId) {
          await context.gitManager.stageAll(context.workspaceId);
        } else {
          const addRes = await runGit(context.workspaceRoot, ['add', '-A']);
          if (!addRes.ok) {
            return {
              success: false,
              output: '',
              error: `Failed to stage all changes: ${truncateOutput(addRes.stderr)}`,
            };
          }
        }
      }

      // 2. Check for staged changes
      if (context.gitManager && context.workspaceId) {
        const st = await context.gitManager.status(context.workspaceId);
        const hasStaged = st.files.some((f) => f.staged);
        if (!hasStaged) {
          return {
            success: false,
            output: '',
            error: 'No staged changes to commit. Working tree is clean or specified files have no modifications.',
          };
        }
      } else {
        const diffRes = await runGit(context.workspaceRoot, ['diff', '--cached', '--quiet']);
        if (diffRes.code === 0) {
          return {
            success: false,
            output: '',
            error: 'No staged changes to commit. Working tree is clean or specified files have no modifications.',
          };
        }
      }

      // 3. Execute commit
      let commitHash = '';
      let commitSubject = '';
      if (context.gitManager && context.workspaceId) {
        const commitObj = await context.gitManager.commit(context.workspaceId, message);
        if (!commitObj) {
          return {
            success: false,
            output: '',
            error: 'Git commit failed or produced no commit object.',
          };
        }
        commitHash = commitObj.hash;
        commitSubject = commitObj.subject;
      } else {
        const commitRes = await runGit(context.workspaceRoot, [
          '-c', 'user.name=Zeus Agent',
          '-c', 'user.email=agent@zeus.local',
          'commit',
          '-m',
          message,
        ]);
        if (!commitRes.ok) {
          return {
            success: false,
            output: '',
            error: `Git commit failed: ${truncateOutput(commitRes.stderr || commitRes.stdout)}`,
          };
        }
        const logRes = await runGit(context.workspaceRoot, ['log', '-1', '--pretty=format:%H\x1f%s']);
        if (logRes.ok && logRes.stdout.trim()) {
          const [h, s] = logRes.stdout.trim().split('\x1f');
          commitHash = h ?? '';
          commitSubject = s ?? firstLine;
        } else {
          commitSubject = firstLine;
        }
      }

      return {
        success: true,
        output: [
          'Successfully created git commit:',
          `  Hash: ${commitHash ? commitHash.slice(0, 8) : '(committed)'}`,
          `  Subject: ${commitSubject}`,
          ...(targetFiles ? [`  Staged files: ${targetFiles.length}`] : ['  Staged files: all modified/untracked']),
        ].join('\n'),
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
