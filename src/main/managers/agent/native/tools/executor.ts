/**
 * Layer 1-3 Security Gating Tool Executor (SEC-19, ADR-0003).
 * Synchronously screens workspace boundaries, awaits permission approval, and executes isolated tools.
 */
import { NATIVE_TOOLS } from './registry';
import { assertInsideWorkspace } from './pathGuard';
import type { NativeToolExecutionContext, NativeToolResult } from './types';
import type { ToolGateFunction } from '../../types';
import type { ProviderRunBridge } from '../../providerBridge';

export interface ExecuteNativeToolOptions {
  id: string;
  name: string;
  input: Record<string, unknown>;
  context: NativeToolExecutionContext;
  gate?: ToolGateFunction;
  bridge?: ProviderRunBridge;
}

/**
 * Executes a native tool call through the 3-Layer Security Architecture:
 * 1. Layer 1: Boundary check & path traversal denial (pathGuard)
 * 2. Layer 2: Synchronous decideToolUse gate (gate)
 * 3. Layer 3: Controlled sandbox execution (tool.execute)
 */
export async function executeNativeTool(
  options: ExecuteNativeToolOptions,
): Promise<NativeToolResult> {
  const { id, name, input, context, gate, bridge } = options;

  // Inform the bridge that tool use was initiated
  bridge?.onToolUse(id, name, input);

  const tool = NATIVE_TOOLS[name];
  if (!tool) {
    const errorMsg = `Unknown native tool: "${name}"`;
    bridge?.onToolResult(id, 'error', errorMsg);
    return {
      success: false,
      output: errorMsg,
      error: errorMsg,
    };
  }

  // --- Layer 1: Boundary & Path Traversal Pre-screen ---
  const pathArg = input.path ?? input.file_path;
  if (typeof pathArg === 'string' && pathArg.trim().length > 0) {
    try {
      assertInsideWorkspace(context.workspaceRoot, pathArg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      bridge?.onToolResult(id, 'error', msg);
      return {
        success: false,
        output: msg,
        error: msg,
      };
    }
  }

  // If fetch_web_content, pre-screen URL credentials and protocol
  if (name === 'fetch_web_content' && typeof input.url === 'string') {
    try {
      const parsed = new URL(input.url);
      if (parsed.username || parsed.password) {
        throw new Error('Access denied: embedded credentials in URL are forbidden');
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error(`Access denied: unsupported protocol "${parsed.protocol}"`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      bridge?.onToolResult(id, 'error', msg);
      return {
        success: false,
        output: msg,
        error: msg,
      };
    }
  }

  // --- Layer 2: Interactive decideToolUse Permission Gate ---
  let effectiveInput = input;
  if (gate) {
    try {
      const decision = await gate(name, input, context.abortSignal);
      if (decision.behavior === 'deny') {
        const denyReason = decision.message || 'Tool execution was denied by user permission policy';
        const formattedDeny = `Permission denied: ${denyReason}`;
        bridge?.onToolResult(id, 'error', formattedDeny);
        return {
          success: false,
          output: formattedDeny,
          error: 'Permission denied',
        };
      }
      if (decision.updatedInput) {
        effectiveInput = decision.updatedInput;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      bridge?.onToolResult(id, 'error', `Permission gate error: ${msg}`);
      return {
        success: false,
        output: `Permission gate error: ${msg}`,
        error: msg,
      };
    }
  }

  // --- Layer 3: Controlled Execution ---
  try {
    const result = await tool.execute(effectiveInput, context);
    bridge?.onToolResult(id, result.success ? 'done' : 'error', result.output);
    return result;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errorOutput = `Tool execution failed: ${msg}`;
    bridge?.onToolResult(id, 'error', errorOutput);
    return {
      success: false,
      output: errorOutput,
      error: msg,
    };
  }
}
