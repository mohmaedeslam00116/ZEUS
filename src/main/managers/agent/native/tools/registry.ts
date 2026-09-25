/**
 * Registry and format translators for native tools.
 */
import { readFileTool } from './readFile';
import { writeFileTool } from './writeFile';
import { editFileTool } from './editFile';
import { runCommandTool } from './runCommand';
import { searchCodebaseTool } from './searchCodebase';
import { fetchWebContentTool } from './fetchWebContent';
import type { NativeTool } from './types';

export const NATIVE_TOOLS: Record<string, NativeTool> = {
  read_file: readFileTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  run_command: runCommandTool,
  search_codebase: searchCodebaseTool,
  fetch_web_content: fetchWebContentTool,
};

export function getAllNativeTools(): NativeTool[] {
  return Object.values(NATIVE_TOOLS);
}

/** Formats native tools for OpenAI / OpenAI-compatible function calling. */
export function toOpenAiTools(tools: NativeTool[] = getAllNativeTools()): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/** Formats native tools for Anthropic Messages API tool use. */
export function toAnthropicTools(tools: NativeTool[] = getAllNativeTools()): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/** Formats native tools for Google Gemini function declarations. */
export function toGeminiTools(tools: NativeTool[] = getAllNativeTools()): Array<{
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}> {
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
