/**
 * Registry and format translators for native tools with mode-based scoping.
 */
import { readFileTool } from './readFile';
import { writeFileTool } from './writeFile';
import { editFileTool } from './editFile';
import { runCommandTool } from './runCommand';
import { searchCodebaseTool } from './searchCodebase';
import { fetchWebContentTool } from './fetchWebContent';
import { memorySaveTool, memoryRecallTool, memoryForgetTool } from './memory';
import { listDirectoryTreeTool } from './directoryTree';
import { viewCodeSymbolsTool } from './codeSymbols';
import { askFollowupQuestionTool, attemptCompletionTool } from './interactive';
import { gitCheckpointTool, gitCommitTool } from './git';
import type { NativeTool } from './types';
import type { ToolGroup, ZeusModeConfig } from '@shared/types';
import { resolveActiveMode } from '../modes/modeDiscovery';

/**
 * Canonical tool group mapping for all first-party native tools.
 */
export const NATIVE_TOOL_GROUPS: Record<string, ToolGroup> = {
  read_file: 'read',
  search_codebase: 'read',
  list_directory_tree: 'read',
  view_code_symbols: 'read',
  fetch_web_content: 'read',
  write_file: 'edit',
  edit_file: 'edit',
  run_command: 'command',
  git_checkpoint: 'command',
  git_commit: 'command',
  memory_save: 'memory',
  memory_recall: 'memory',
  memory_forget: 'memory',
  ask_followup_question: 'interactive',
  attempt_completion: 'interactive',
};

export const NATIVE_TOOLS: Record<string, NativeTool> = {
  read_file: readFileTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  run_command: runCommandTool,
  git_checkpoint: gitCheckpointTool,
  git_commit: gitCommitTool,
  search_codebase: searchCodebaseTool,
  fetch_web_content: fetchWebContentTool,
  memory_save: memorySaveTool,
  memory_recall: memoryRecallTool,
  memory_forget: memoryForgetTool,
  list_directory_tree: listDirectoryTreeTool,
  view_code_symbols: viewCodeSymbolsTool,
  ask_followup_question: askFollowupQuestionTool,
  attempt_completion: attemptCompletionTool,
};

// Tag tools with their capability group
for (const [name, tool] of Object.entries(NATIVE_TOOLS)) {
  if (!tool.group && NATIVE_TOOL_GROUPS[name]) {
    tool.group = NATIVE_TOOL_GROUPS[name];
  }
}

export function getAllNativeTools(): NativeTool[] {
  return Object.values(NATIVE_TOOLS);
}

/**
 * Filter native tools matching the active mode's permitted tool groups.
 * If mode is omitted, returns all native tools.
 */
export function getNativeToolsForMode(
  mode?: ZeusModeConfig | string,
  availableModes?: readonly ZeusModeConfig[],
): NativeTool[] {
  if (!mode) return getAllNativeTools();

  const activeMode: ZeusModeConfig =
    typeof mode === 'string'
      ? resolveActiveMode(mode, availableModes)
      : mode;

  const allowedGroups = new Set(activeMode.groups);
  return getAllNativeTools().filter((t) => {
    const group = t.group ?? NATIVE_TOOL_GROUPS[t.name] ?? 'read';
    return allowedGroups.has(group);
  });
}

/** Formats native tools for OpenAI / OpenAI-compatible function calling with mode scoping. */
export function toOpenAiTools(
  toolsOrMode?: NativeTool[] | ZeusModeConfig | string,
  availableModes?: readonly ZeusModeConfig[],
): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  const tools = Array.isArray(toolsOrMode)
    ? toolsOrMode
    : getNativeToolsForMode(toolsOrMode, availableModes);

  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/** Formats native tools for Anthropic Messages API tool use with mode scoping. */
export function toAnthropicTools(
  toolsOrMode?: NativeTool[] | ZeusModeConfig | string,
  availableModes?: readonly ZeusModeConfig[],
): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  const tools = Array.isArray(toolsOrMode)
    ? toolsOrMode
    : getNativeToolsForMode(toolsOrMode, availableModes);

  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/** Formats native tools for Google Gemini function declarations with mode scoping. */
export function toGeminiTools(
  toolsOrMode?: NativeTool[] | ZeusModeConfig | string,
  availableModes?: readonly ZeusModeConfig[],
): Array<{
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}> {
  const tools = Array.isArray(toolsOrMode)
    ? toolsOrMode
    : getNativeToolsForMode(toolsOrMode, availableModes);

  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}
