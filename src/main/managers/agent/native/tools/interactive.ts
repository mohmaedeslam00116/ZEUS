/**
 * Interactive tools for ZEUS Native Agent Runtime:
 * - ask_followup_question: Requests clarification or user preference during multi-turn reasoning.
 * - attempt_completion: Signals task completion with summary and optional verification command.
 */
import { NATIVE_RUNTIME_LIMITS } from '@shared/constants';
import type { NativeTool, NativeToolExecutionContext, NativeToolResult } from './types';

const {
  maxQuestionLength,
  maxOptionsCount,
  maxOptionLength,
  maxResultLength,
  maxCommandLength,
} = NATIVE_RUNTIME_LIMITS.interactive;

export const askFollowupQuestionTool: NativeTool = {
  name: 'ask_followup_question',
  description:
    'Ask the user a clarifying question when you encounter ambiguity, need decisions/preferences, or need missing information to proceed. You may optionally provide up to 10 suggested choices for the user.',
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The specific question to ask the user.',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of up to 10 quick-choice suggested answers for the user to select from.',
      },
    },
    required: ['question'],
    additionalProperties: false,
  },
  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    if (typeof input.question !== 'string' || !input.question.trim()) {
      return {
        success: false,
        output: 'Error: "question" must be a non-empty string.',
      };
    }

    const question = input.question.trim();
    if (question.length > maxQuestionLength) {
      return {
        success: false,
        output: `Error: "question" exceeds the maximum length of ${maxQuestionLength} characters.`,
      };
    }

    let options: string[] | undefined;
    if (input.options !== undefined) {
      if (!Array.isArray(input.options)) {
        return {
          success: false,
          output: 'Error: "options" must be an array of strings if provided.',
        };
      }

      if (input.options.length > maxOptionsCount) {
        return {
          success: false,
          output: `Error: "options" cannot exceed ${maxOptionsCount} choices.`,
        };
      }

      const parsedOptions: string[] = [];
      for (const item of input.options) {
        if (typeof item !== 'string' || !item.trim()) {
          return {
            success: false,
            output: 'Error: Each item in "options" must be a non-empty string.',
          };
        }
        const trimmed = item.trim();
        if (trimmed.length > maxOptionLength) {
          return {
            success: false,
            output: `Error: Option "${trimmed.slice(0, 20)}..." exceeds maximum length of ${maxOptionLength} characters.`,
          };
        }
        parsedOptions.push(trimmed);
      }
      options = parsedOptions;
    }

    if (context.abortSignal?.aborted) {
      return {
        success: false,
        output: 'Turn was aborted before answering the question.',
      };
    }

    if (!context.askUserQuestion) {
      return {
        success: false,
        output: 'Interactive question error: No askUserQuestion handler is available in the current execution context.',
      };
    }

    try {
      const answer = await context.askUserQuestion(question, options, context.abortSignal);
      return {
        success: true,
        output: answer,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Failed to receive answer from user: ${msg}`,
      };
    }
  },
};

export const attemptCompletionTool: NativeTool = {
  name: 'attempt_completion',
  description:
    'Signal that you have completed the task. Provide a comprehensive summary of the changes and results, and optionally a terminal command the user can run to verify the work (e.g. npm test).',
  parameters: {
    type: 'object',
    properties: {
      result: {
        type: 'string',
        description: 'A detailed summary of how the task was completed, files changed, and instructions for the user.',
      },
      command: {
        type: 'string',
        description: 'Optional terminal verification command the user can run to verify the completed work (e.g. npm test).',
      },
    },
    required: ['result'],
    additionalProperties: false,
  },
  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    if (typeof input.result !== 'string' || !input.result.trim()) {
      return {
        success: false,
        output: 'Error: "result" must be a non-empty string explaining the task completion.',
      };
    }

    const result = input.result.trim();
    if (result.length > maxResultLength) {
      return {
        success: false,
        output: `Error: "result" exceeds maximum length of ${maxResultLength} characters.`,
      };
    }

    let command: string | undefined;
    if (input.command !== undefined) {
      if (typeof input.command !== 'string') {
        return {
          success: false,
          output: 'Error: "command" must be a string if provided.',
        };
      }
      const trimmedCmd = input.command.trim();
      if (trimmedCmd) {
        if (trimmedCmd.length > maxCommandLength) {
          return {
            success: false,
            output: `Error: "command" exceeds maximum length of ${maxCommandLength} characters.`,
          };
        }
        command = trimmedCmd;
      }
    }

    if (context.onTaskCompletion) {
      try {
        context.onTaskCompletion(result, command);
      } catch (err) {
        // Log or handle error from onTaskCompletion safely
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          output: `Task completion callback error: ${msg}`,
        };
      }
    }

    let output = `Task Completion Summary:\n${result}`;
    if (command) {
      output += `\n\nVerification Command:\n${command}`;
    }

    return {
      success: true,
      output,
    };
  },
};
