import { describe, it, expect, beforeEach } from 'vitest';
import {
  AutoHealingManager,
  detectFailure,
  extractErrorDiagnostics,
  stripAnsiCodes,
} from './autoHealing';

describe('Auto-Healing Engine (extracted from Aider, Ticket #76)', () => {
  describe('stripAnsiCodes', () => {
    it('removes ANSI color and style escape codes', () => {
      const input = '\x1b[31mFAIL\x1b[39m \x1b[1msrc/auth.test.ts\x1b[22m';
      expect(stripAnsiCodes(input)).toBe('FAIL src/auth.test.ts');
    });
  });

  describe('detectFailure', () => {
    it('returns null if command succeeded with exit code 0', () => {
      const res = detectFailure('npm test', 0, 'All 10 tests passed');
      expect(res).toBeNull();
    });

    it('returns null for non-verification shell commands even on failure', () => {
      const res = detectFailure('cat missing.txt', 1, 'cat: missing.txt: No such file or directory');
      expect(res).toBeNull();
    });

    it('detects test failure for vitest/jest', () => {
      const output = [
        'FAIL src/auth.test.ts',
        '  ✕ login throws on invalid token',
        'AssertionError: expected 401 to be 200',
        '    at src/auth.test.ts:42:15',
      ].join('\n');

      const res = detectFailure('npx vitest run', 1, output);
      expect(res).not.toBeNull();
      expect(res?.kind).toBe('test');
      expect(res?.command).toBe('npx vitest run');
      expect(res?.exitCode).toBe(1);
      expect(res?.extractedErrors.length).toBeGreaterThan(0);
      expect(res?.summary).toContain('AssertionError');
    });

    it('detects test failure for pytest, cargo test, and go test', () => {
      const pytestOutput = 'FAILED tests/test_api.py::test_login - AssertionError: assert False';
      const res1 = detectFailure('pytest tests/', 1, pytestOutput);
      expect(res1?.kind).toBe('test');

      const cargoOutput = 'test tests::test_hash ... FAILED';
      const res2 = detectFailure('cargo test', 101, cargoOutput);
      expect(res2?.kind).toBe('test');

      const goOutput = '--- FAIL: TestMathAdd (0.00s)\n    math_test.go:25: expected 4, got 5\nFAIL';
      const res3 = detectFailure('go test ./...', 1, goOutput);
      expect(res3?.kind).toBe('test');
      expect(res3?.summary).toContain('FAIL');
    });

    it('detects lint failure for eslint, tsc, ruff, and flake8', () => {
      const eslintOutput = 'src/index.ts:15:7 - error @typescript-eslint/no-unused-vars: "x" is defined but never used';
      const res1 = detectFailure('npx eslint src/', 1, eslintOutput);
      expect(res1?.kind).toBe('lint');

      const tscOutput = 'src/types.ts(45,3): error TS2322: Type "string" is not assignable to type "number".';
      const res2 = detectFailure('npm run typecheck', 2, tscOutput);
      expect(res2?.kind).toBe('lint');

      const ruffOutput = 'app/main.py:10:1: F401 `os` imported but unused';
      const res3 = detectFailure('ruff check .', 1, ruffOutput);
      expect(res3?.kind).toBe('lint');

      const flake8Output = 'app/views.py:12:80: E501 line too long (85 > 79 characters)';
      const res4 = detectFailure('flake8 app/', 1, flake8Output);
      expect(res4?.kind).toBe('lint');
      expect(res4?.summary).toContain('E501 line too long');
    });

    it('detects build failure for compiler and bundler commands', () => {
      const buildOutput = 'Error: Build failed with 1 error: src/main.ts:2:7: Unexpected token';
      const res = detectFailure('npm run build', 1, buildOutput);
      expect(res?.kind).toBe('build');
      expect(res?.summary).toContain('Build failed');
    });

    it('ignores git branch or mkdir commands containing the word build', () => {
      const res = detectFailure('git checkout -b build-fix', 1, 'fatal: A branch named "build-fix" already exists.');
      expect(res).toBeNull();
    });
  });

  describe('extractErrorDiagnostics', () => {
    it('extracts high-signal error and stack trace lines while filtering noise', () => {
      const noisyOutput = [
        'npm notice run zeus@0.1.0-alpha.0',
        'Vite v4.5.0 building for production...',
        'transforming (120) src/index.ts',
        'error TS2339: Property "invalidProp" does not exist on type "User".',
        '  at src/user.ts:50:12',
        '✓ 119 modules transformed.',
      ].join('\n');

      const extracted = extractErrorDiagnostics(noisyOutput, 4000);
      expect(extracted).toContain('error TS2339: Property "invalidProp" does not exist on type "User".');
      expect(extracted).toContain('at src/user.ts:50:12');
      expect(extracted).not.toContain('npm notice');
    });

    it('strictly truncates error stack to maxErrorStackLength (XP-01)', () => {
      const massiveErrors = Array.from({ length: 200 }, (_, i) => `error TS9999: error line number ${i} in massive file`).join('\n');
      const extracted = extractErrorDiagnostics(massiveErrors, 200);
      expect(extracted.length).toBeLessThanOrEqual(200);
      expect(extracted).toContain('[Error diagnostics truncated]');
    });
  });

  describe('AutoHealingManager', () => {
    let healer: AutoHealingManager;

    beforeEach(() => {
      healer = new AutoHealingManager(3);
    });

    it('decides to heal on initial test failure (attempt 1)', () => {
      const output = 'FAIL src/math.test.ts\nAssertionError: expected 4 to be 5';
      const decision = healer.inspectCommandResult('npm test', 1, output);

      expect(decision.shouldHeal).toBe(true);
      expect(decision.attempt).toBe(1);
      expect(decision.maxRetries).toBe(3);
      expect(decision.diagnostic?.kind).toBe('test');
      expect(decision.notice).toContain('[Auto-Healing System Notice]');
      expect(decision.notice).toContain('Attempt 1 of 3');
      expect(decision.notice).toContain('AssertionError: expected 4 to be 5');
    });

    it('increments attempts on successive failures and halts when maxRetries is reached', () => {
      const failOutput = 'src/a.ts(1,1): error TS2304: Cannot find name "abc".';

      // Attempt 1 of 3 -> heal
      const d1 = healer.inspectCommandResult('npm run typecheck', 1, failOutput);
      expect(d1.shouldHeal).toBe(true);
      expect(d1.attempt).toBe(1);

      // Attempt 2 of 3 -> heal
      const d2 = healer.inspectCommandResult('npm run typecheck', 1, failOutput);
      expect(d2.shouldHeal).toBe(true);
      expect(d2.attempt).toBe(2);

      // Attempt 3 of 3: limit reached -> halt and ask for persistent summary
      const d3 = healer.inspectCommandResult('npm run typecheck', 1, failOutput);
      expect(d3.shouldHeal).toBe(false);
      expect(d3.attempt).toBe(3);
      expect(d3.notice).toContain('Maximum auto-healing retry limit (3) reached');
      expect(d3.notice).toContain('Please summarize the persistent failure');
    });

    it('does not reset attempt counter on unrelated command success, only on verification success', () => {
      healer.inspectCommandResult('npm test', 1, 'FAIL test.ts\nError: boom');
      expect(healer.currentAttempt).toBe(1);

      // Unrelated command succeeds (e.g. git status, ls) -> does NOT reset counter
      const unrelated = healer.inspectCommandResult('git status', 0, 'On branch main');
      expect(unrelated.shouldHeal).toBe(false);
      expect(healer.currentAttempt).toBe(1);

      // Verification command succeeds -> resets counter
      const successDecision = healer.inspectCommandResult('npm test', 0, 'All passed');
      expect(successDecision.shouldHeal).toBe(false);
      expect(healer.currentAttempt).toBe(0);

      // Explicit reset
      healer.inspectCommandResult('npm test', 1, 'FAIL test.ts\nError: boom');
      expect(healer.currentAttempt).toBe(1);
      healer.reset();
      expect(healer.currentAttempt).toBe(0);
    });

    it('handleCommandOutput encapsulates exit code extraction and output augmentation', () => {
      const rawOutput = 'Command: npx vitest run\nExit code: 1\n\nStderr:\nFAIL src/a.test.ts\nAssertionError: expected true to be false';
      const { augmentedOutput, decision } = healer.handleCommandOutput('npx vitest run', rawOutput, false);

      expect(decision.shouldHeal).toBe(true);
      expect(decision.attempt).toBe(1);
      expect(augmentedOutput).toContain('Command: npx vitest run');
      expect(augmentedOutput).toContain('[Auto-Healing System Notice]');
      expect(augmentedOutput).toContain('Attempt 1 of 3');
    });
  });
});
