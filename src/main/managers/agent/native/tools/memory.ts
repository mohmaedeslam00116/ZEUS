/**
 * Native Memory Tools for Persistent Project Knowledge (Spec #67 / Issues #71 & #78).
 * Provides memory_save, memory_recall, and memory_forget tools wired to MemoryManager / SQLite.
 */
import type { NativeTool, NativeToolExecutionContext, NativeToolResult } from './types';
import type { MemoryTier } from '@shared/types';
import { MEMORY_LIMITS } from '@shared/constants';

export const MEMORY_TIERS: MemoryTier[] = [
  'decision',
  'convention',
  'preference',
  'solution',
  'note',
  'project',
  'workspace',
  'session',
];

/** Tool 1: memory_save */
export const memorySaveTool: NativeTool = {
  name: 'memory_save',
  description:
    'Save durable project knowledge to the persistent local memory store ' +
    '(decisions, conventions, preferences, solutions, notes, architecture facts). ' +
    'Persisted in SQLite and indexed for future sessions.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: `Short, clear summary title of what is remembered (max ${MEMORY_LIMITS.titleMax} chars).`,
      },
      body: {
        type: 'string',
        description: `Detailed explanation, rationale, code snippets, or rules (max ${MEMORY_LIMITS.bodyMax} chars).`,
      },
      tier: {
        type: 'string',
        enum: [...MEMORY_TIERS],
        description:
          "Category of memory: 'decision' (architectural choices), 'convention' (coding style/patterns), 'preference' (user preferences), 'solution' (reusable fix for a tricky problem), 'note' (general knowledge), 'project' (repo facts).",
      },
      scope: {
        type: 'string',
        enum: ['workspace', 'global'],
        description:
          "Scope of the memory. 'workspace' belongs to current repository; 'global' applies across all projects. Defaults to 'workspace'.",
      },
    },
    required: ['title', 'body', 'tier'],
  },

  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    const rawTitle = input.title;
    const rawBody = input.body;
    const rawTier = input.tier;
    const rawScope = input.scope ?? 'workspace';

    if (typeof rawTitle !== 'string' || !rawTitle.trim()) {
      return {
        success: false,
        output: 'Error: "title" must be a non-empty string.',
        error: 'Invalid title',
      };
    }
    const title = rawTitle.trim();
    if (title.length > MEMORY_LIMITS.titleMax) {
      return {
        success: false,
        output: `Error: "title" exceeds maximum length of ${MEMORY_LIMITS.titleMax} characters.`,
        error: 'Title too long',
      };
    }

    if (typeof rawBody !== 'string' || !rawBody.trim()) {
      return {
        success: false,
        output: 'Error: "body" must be a non-empty string.',
        error: 'Invalid body',
      };
    }
    const body = rawBody.trim();
    if (body.length > MEMORY_LIMITS.bodyMax) {
      return {
        success: false,
        output: `Error: "body" exceeds maximum length of ${MEMORY_LIMITS.bodyMax} characters.`,
        error: 'Body too long',
      };
    }

    if (!MEMORY_TIERS.includes(rawTier as MemoryTier)) {
      return {
        success: false,
        output: `Error: invalid tier "${rawTier}". Must be one of: ${MEMORY_TIERS.join(', ')}`,
        error: 'Invalid tier',
      };
    }
    const tier = rawTier as MemoryTier;

    if (rawScope !== 'workspace' && rawScope !== 'global') {
      return {
        success: false,
        output: 'Error: "scope" must be either "workspace" or "global".',
        error: 'Invalid scope',
      };
    }
    const scope = rawScope;

    if (!context.memoryManager) {
      return {
        success: false,
        output: 'MemoryManager is not available in the current execution context.',
        error: 'MemoryManager unavailable',
      };
    }

    try {
      const workspaceId = scope === 'global' ? null : (context.workspaceId ?? null);
      const created = context.memoryManager.create({
        workspaceId,
        tier,
        title,
        body,
        source: 'auto',
        confidence: 0.85,
        sessionId: context.sessionId,
      });

      return {
        success: true,
        output: `Memory successfully saved [id: ${created.id}]: "${created.title}" (tier: ${created.tier}, scope: ${scope})`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Failed to save memory: ${msg}`,
        error: msg,
      };
    }
  },
};

/** Tool 2: memory_recall */
export const memoryRecallTool: NativeTool = {
  name: 'memory_recall',
  description:
    'Search the persistent local memory store for previously saved project knowledge, ' +
    'conventions, decisions, solutions, or user preferences matching a query.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keywords or search phrase to match against memories.',
      },
      tier: {
        type: 'string',
        enum: [...MEMORY_TIERS],
        description: 'Optional tier to filter results.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of memories to return (default 5, max 20).',
      },
    },
    required: ['query'],
  },

  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    const rawQuery = input.query;
    if (typeof rawQuery !== 'string' || !rawQuery.trim()) {
      return {
        success: false,
        output: 'Error: "query" must be a non-empty string.',
        error: 'Invalid query',
      };
    }
    const query = rawQuery.trim();
    if (query.length > MEMORY_LIMITS.queryMax) {
      return {
        success: false,
        output: `Error: query exceeds maximum length of ${MEMORY_LIMITS.queryMax} characters.`,
        error: 'Query too long',
      };
    }

    const rawTier = input.tier;
    if (rawTier !== undefined && !MEMORY_TIERS.includes(rawTier as MemoryTier)) {
      return {
        success: false,
        output: `Error: invalid tier filter "${rawTier}". Must be one of: ${MEMORY_TIERS.join(', ')}`,
        error: 'Invalid tier',
      };
    }

    let limit = 5;
    if (typeof input.limit === 'number' && Number.isFinite(input.limit)) {
      limit = Math.max(1, Math.min(20, Math.floor(input.limit)));
    }

    if (!context.memoryManager) {
      return {
        success: false,
        output: 'MemoryManager is not available in the current execution context.',
        error: 'MemoryManager unavailable',
      };
    }

    try {
      const hits = context.memoryManager.search(query, {
        workspaceId: context.workspaceId ?? null,
        tiers: rawTier ? [rawTier as MemoryTier] : undefined,
        limit,
      });

      if (!hits || hits.length === 0) {
        return {
          success: true,
          output: `No memories found matching query: "${query}"`,
        };
      }

      const formatted = hits
        .map((h, index) => {
          const bodyPreview = h.snippet
            ? h.snippet.replace(/\s+/g, ' ').trim()
            : h.body.replace(/\s+/g, ' ').trim().slice(0, 200);
          return `${index + 1}. [${h.tier}] ${h.title} (id: ${h.id})\n   ${bodyPreview}`;
        })
        .join('\n\n');

      return {
        success: true,
        output: `Found ${hits.length} matching memories:\n\n${formatted}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Failed to search memories: ${msg}`,
        error: msg,
      };
    }
  },
};

/** Tool 3: memory_forget */
export const memoryForgetTool: NativeTool = {
  name: 'memory_forget',
  description:
    'Remove or archive an obsolete, invalidated, or incorrect memory from the persistent local memory store.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The unique ID of the memory to forget (obtained via memory_recall or list_memories).',
      },
      reason: {
        type: 'string',
        description: 'Explanation for why this memory is obsolete or superseded.',
      },
      mode: {
        type: 'string',
        enum: ['archive', 'delete'],
        description: 'Whether to archive the memory (recoverable soft delete) or permanently delete it. Defaults to "archive".',
      },
    },
    required: ['id'],
  },

  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    const rawId = input.id;
    if (typeof rawId !== 'string' || !rawId.trim()) {
      return {
        success: false,
        output: 'Error: "id" must be a non-empty string.',
        error: 'Invalid ID',
      };
    }
    const id = rawId.trim();
    const reason = typeof input.reason === 'string' ? input.reason.trim() : undefined;
    const mode = input.mode === 'delete' ? 'delete' : 'archive';

    if (!context.memoryManager) {
      return {
        success: false,
        output: 'MemoryManager is not available in the current execution context.',
        error: 'MemoryManager unavailable',
      };
    }

    try {
      const existing = context.memoryManager.get(id);
      if (!existing) {
        return {
          success: false,
          output: `Memory not found with ID "${id}".`,
          error: 'Memory not found',
        };
      }

      if (mode === 'archive' && typeof context.memoryManager.setArchived === 'function') {
        context.memoryManager.setArchived(id, true);
        return {
          success: true,
          output: `Memory "${existing.title}" [id: ${id}] was successfully archived${reason ? ` (reason: ${reason})` : ''}.`,
        };
      }

      context.memoryManager.delete(id);
      return {
        success: true,
        output: `Memory "${existing.title}" [id: ${id}] was permanently deleted${reason ? ` (reason: ${reason})` : ''}.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Failed to remove memory: ${msg}`,
        error: msg,
      };
    }
  },
};
