/**
 * Types and interfaces for the ZEUS First-Party Native Tool Suite (Spec #61 / Issue #65).
 */

import type { MemorySource, MemoryTier } from '@shared/types';

export interface NativeToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface NativeToolMemoryManager {
  create(input: {
    workspaceId: string | null;
    tier: MemoryTier | string;
    title: string;
    body: string;
    source?: MemorySource | string;
    confidence?: number;
    sessionId?: string | null;
    filePath?: string | null;
  }): { id: string; title: string; tier: string };
  search(
    query: string,
    opts?: { workspaceId: string | null; tiers?: (MemoryTier | string)[]; limit?: number },
  ): Array<{
    id: string;
    title: string;
    body: string;
    tier: string;
    snippet?: string;
    score?: number;
  }>;
  get(id: string): { id: string; title: string; body: string; tier: string } | null;
  delete(id: string): void;
  setArchived?(id: string, archived: boolean): void;
}

export interface NativeToolExecutionContext {
  workspaceRoot: string;
  sessionId: string;
  abortSignal?: AbortSignal;
  terminalManager?: unknown;
  onOutputChunk?: (text: string) => void;
  memoryManager?: NativeToolMemoryManager;
  workspaceId?: string | null;
}

export interface NativeToolResult {
  success: boolean;
  output: string;
  diff?: string;
  error?: string;
}

export interface NativeTool extends NativeToolDefinition {
  execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult>;
}
