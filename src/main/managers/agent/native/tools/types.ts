/**
 * Types and interfaces for the ZEUS First-Party Native Tool Suite (Spec #61 / Issue #65).
 */

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

export interface NativeToolExecutionContext {
  workspaceRoot: string;
  sessionId: string;
  abortSignal?: AbortSignal;
  terminalManager?: unknown;
  onOutputChunk?: (text: string) => void;
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
