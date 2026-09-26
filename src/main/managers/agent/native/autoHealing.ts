/**
 * Automated Test, Lint & Build Auto-Healing Engine (extracted from Aider, Ticket #76).
 *
 * Implements high-signal error extraction from shell execution output, classified
 * failure diagnostics, and bounded retry loop orchestration for NativeAgentRuntime.
 */
import { NATIVE_RUNTIME_LIMITS } from '@shared/constants';

const {
  maxRetries: DEFAULT_MAX_RETRIES,
  maxErrorStackLength: DEFAULT_MAX_STACK_LEN,
  maxSummaryLength: DEFAULT_MAX_SUMMARY_LEN,
  maxFallbackLines: DEFAULT_MAX_FALLBACK_LINES,
} = NATIVE_RUNTIME_LIMITS.autoHealing;

export type FailureKind = 'test' | 'lint' | 'build';

export interface FailureDiagnostic {
  kind: FailureKind;
  command: string;
  exitCode: number;
  extractedErrors: string[];
  summary: string;
}

export interface AutoHealDecision {
  shouldHeal: boolean;
  attempt: number;
  maxRetries: number;
  diagnostic?: FailureDiagnostic;
  notice?: string;
}

export interface CommandInspectionResult {
  augmentedOutput: string;
  decision: AutoHealDecision;
}

const TEST_COMMAND_RE =
  /\b(vitest|jest|pytest|cargo\s+test|go\s+test|npm\s+(?:run\s+)?test\b|yarn\s+test\b|pnpm\s+test\b|bun\s+test\b|python\s+-m\s+unittest|dotnet\s+test|mvn\s+test)\b/i;

const LINT_COMMAND_RE =
  /\b(eslint|tsc|typecheck|ruff|flake8|mypy|pylint|clippy|golangci-lint|npm\s+(?:run\s+)?(?:lint|typecheck)\b|yarn\s+(?:lint|typecheck)\b|pnpm\s+(?:lint|typecheck)\b)\b/i;

const BUILD_COMMAND_RE =
  /\b(npm\s+run\s+build\b|yarn\s+build\b|pnpm\s+build\b|bun\s+run\s+build\b|vite\s+build\b|webpack\b|tsc\s+-b\b|cargo\s+build\b|go\s+build\b|make\b)/i;

const HIGH_SIGNAL_ERROR_RE =
  /\b(FAIL|FAILED|FAILURE|ERROR|error|AssertionError|TypeError|SyntaxError|ReferenceError|Traceback|error TS\d+:|TS\d+:|at\s+.+\(.*:\d+:\d+\)|File\s+".+",\s+line\s+\d+|expected\b|received\b)\b/;

const NOISE_LINE_RE =
  /^\s*(npm\s+notice|Vite\s+v|transforming\s+\(\d+\)|✓\s+\d+\s+modules|\(?node:\d+\)\s+\[DEP\d+\])/;

/**
 * Checks whether a command string is an identifiable verification (test, lint, or build) command.
 */
export function isVerificationCommand(command: string): boolean {
  return (
    TEST_COMMAND_RE.test(command) ||
    LINT_COMMAND_RE.test(command) ||
    BUILD_COMMAND_RE.test(command)
  );
}

/**
 * Strips ANSI terminal escape sequences.
 */
export function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Extracts high-signal error lines, assertion failures, and stack traces from raw command output.
 */
export function extractErrorDiagnostics(
  rawOutput: string,
  maxChars: number = DEFAULT_MAX_STACK_LEN,
): string {
  const clean = stripAnsiCodes(rawOutput);
  const lines = clean.split(/\r?\n/);
  const relevantLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    if (NOISE_LINE_RE.test(trimmed)) continue;

    if (
      HIGH_SIGNAL_ERROR_RE.test(trimmed) ||
      /^\s*at\s+/.test(trimmed) ||
      /^\s*[✕✗x]\s+/.test(trimmed)
    ) {
      relevantLines.push(trimmed);
    }
  }

  // Fallback: if no specific lines matched regex but there was output, take the trailing non-noise lines
  if (relevantLines.length === 0) {
    const nonNoise = lines.filter((l) => l.trim() && !NOISE_LINE_RE.test(l));
    relevantLines.push(...nonNoise.slice(-DEFAULT_MAX_FALLBACK_LINES));
  }

  const TRUNCATION_SUFFIX = '\n[Error diagnostics truncated]';
  let joined = relevantLines.join('\n');
  if (joined.length > maxChars) {
    const sliceLen = Math.max(0, maxChars - TRUNCATION_SUFFIX.length);
    joined = `${joined.slice(0, sliceLen)}${TRUNCATION_SUFFIX}`;
  }

  return joined;
}

/**
 * Inspects a command and its output to determine if it was a test, lint, or build failure.
 */
export function detectFailure(
  command: string,
  exitCode: number,
  output: string,
): FailureDiagnostic | null {
  if (exitCode === 0) return null;

  const cleanOutput = stripAnsiCodes(output);

  const isBuildCommand = BUILD_COMMAND_RE.test(command);
  const isLintCommand = LINT_COMMAND_RE.test(command);
  const isTestCommand = TEST_COMMAND_RE.test(command);

  let kind: FailureKind;
  if (isBuildCommand) {
    kind = 'build';
  } else if (isLintCommand) {
    kind = 'lint';
  } else if (isTestCommand) {
    kind = 'test';
  } else if (/\b(Build failed|Compilation error|failed to compile)\b/i.test(cleanOutput)) {
    kind = 'build';
  } else if (/\b(error TS\d+:|eslint|lint error|Found \d+ error)\b/i.test(cleanOutput)) {
    kind = 'lint';
  } else if (/\b(FAIL|FAILED|Tests:\s+\d+\s+failed|AssertionError)\b/i.test(cleanOutput)) {
    kind = 'test';
  } else {
    // Arbitrary non-verification shell command failure
    return null;
  }

  const extracted = extractErrorDiagnostics(cleanOutput);
  const lines = extracted.split('\n').filter(Boolean);
  const summaryLine =
    lines.find((l) => /\b(AssertionError|error|failed|Error:)\b/i.test(l)) ||
    lines[0] ||
    `${kind} failed with exit code ${exitCode}`;

  return {
    kind,
    command,
    exitCode,
    extractedErrors: lines,
    summary: summaryLine.slice(0, DEFAULT_MAX_SUMMARY_LEN),
  };
}

/**
 * Formats structured auto-healing instructions for the agent model turn.
 */
export function formatAutoHealNotice(
  diagnostic: FailureDiagnostic,
  attempt: number,
  maxRetries: number,
): string {
  const isExhausted = attempt >= maxRetries;
  const header = isExhausted
    ? `[Auto-Healing System Notice] Maximum auto-healing retry limit (${maxRetries}) reached for command "${diagnostic.command}".`
    : `[Auto-Healing System Notice] Automated ${diagnostic.kind} failure detected from command "${diagnostic.command}" (Exit code: ${diagnostic.exitCode}). Attempt ${attempt} of ${maxRetries}.`;

  const instruction = isExhausted
    ? 'Please summarize the persistent failure, error stack, and underlying cause for the user rather than continuing to retry automatically.'
    : `Inspect the error diagnostics above, locate the affected file(s), and apply the necessary code modifications to fix the failure. You may re-run the verification command to confirm resolution.`;

  return [
    header,
    '',
    'Extracted Diagnostics:',
    diagnostic.extractedErrors.join('\n'),
    '',
    'Instruction:',
    instruction,
  ].join('\n');
}

/**
 * Stateful manager tracking auto-healing retry iterations within an agent run.
 */
export class AutoHealingManager {
  private attemptCount = 0;

  constructor(private readonly maxRetries: number = DEFAULT_MAX_RETRIES) {}

  get currentAttempt(): number {
    return this.attemptCount;
  }

  reset(): void {
    this.attemptCount = 0;
  }

  /**
   * Inspects a command and its exit code.
   * Note: only identifiable verification commands that exit with 0 reset the attempt counter.
   */
  inspectCommandResult(
    command: string,
    exitCode: number,
    output: string,
  ): AutoHealDecision {
    if (exitCode === 0) {
      if (isVerificationCommand(command)) {
        this.reset();
      }
      return {
        shouldHeal: false,
        attempt: this.attemptCount,
        maxRetries: this.maxRetries,
      };
    }

    const diagnostic = detectFailure(command, exitCode, output);
    if (!diagnostic) {
      return {
        shouldHeal: false,
        attempt: this.attemptCount,
        maxRetries: this.maxRetries,
      };
    }

    this.attemptCount++;
    const shouldHeal = this.attemptCount < this.maxRetries;
    const notice = formatAutoHealNotice(diagnostic, this.attemptCount, this.maxRetries);

    return {
      shouldHeal,
      attempt: this.attemptCount,
      maxRetries: this.maxRetries,
      diagnostic,
      notice,
    };
  }

  /**
   * High-level entry point encapsulating exit code extraction and output augmentation.
   */
  handleCommandOutput(
    rawCommand: string,
    output: string,
    success: boolean,
  ): CommandInspectionResult {
    const exitCodeMatch = output.match(/Exit code:\s*(-?\d+)/);
    const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : success ? 0 : 1;
    const decision = this.inspectCommandResult(rawCommand, exitCode, output);
    let augmentedOutput = output;
    if (decision.notice) {
      augmentedOutput = `${output}\n\n${decision.notice}`;
    }
    return { augmentedOutput, decision };
  }
}
