/**
 * Tests for `main/managers/git/refs.ts` — the shared git ref sanitizers.
 *
 * Contract: `sanitizeRef` / `sanitizeBranchName` apply EXACTLY the shared
 * rule table in `@shared/refName` (one table, two consumers, no drift) and
 * throw with the table's own reason instead of surfacing raw git stderr.
 */
import { describe, expect, it } from 'vitest';
import { refCharProblem, validateBranchName } from '@shared/refName';
import { sanitizeBranchName, sanitizeRef } from './refs';

describe('sanitizeRef — parity with the shared rule table', () => {
  it('returns safe refs unchanged', () => {
    for (const ref of ['main', 'origin/main', 'v1.0.0']) {
      expect(sanitizeRef(ref)).toBe(ref);
    }
  });

  it('throws with the shared table\'s reason for forbidden characters', () => {
    // The thrown message must be the SHARED table's wording — not a local one.
    expect(() => sanitizeRef('a:b')).toThrow('cannot contain ":"');
    expect(() => sanitizeRef('a~b')).toThrow('cannot contain "~"');
  });

  it('rejects option smuggling (leading dash)', () => {
    expect(() => sanitizeRef('--upload-pack=evil')).toThrow('cannot start with "-"');
  });

  it('rejects control characters and DEL', () => {
    expect(() => sanitizeRef('a\x00b')).toThrow('control character');
    expect(() => sanitizeRef('a\x7fb')).toThrow('control character');
  });

  it('is EXACTLY refCharProblem: accepts what it accepts, throws on every problem', () => {
    // Property-style parity: for any input, sanitizeRef accepts iff the shared
    // guard accepts — no loosening, no tightening.
    const samples = [
      'main', 'HEAD^', 'a b', '-x', 'a~b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b',
      '\x01', '\x7f', '', 'feature/ok', '@', 'HEAD~100',
    ];
    for (const ref of samples) {
      const problem = refCharProblem(ref);
      if (problem === null) expect(sanitizeRef(ref)).toBe(ref);
      else expect(() => sanitizeRef(ref)).toThrow(`git: ${problem}`);
    }
  });
});

describe('sanitizeBranchName — full creation rules on top of sanitizeRef', () => {
  it('returns valid created-branch names unchanged', () => {
    expect(sanitizeBranchName('zeus/feature-one')).toBe('zeus/feature-one');
    expect(sanitizeBranchName('v2.0', 'Tag name')).toBe('v2.0');
  });

  it('throws with the shared table\'s structural reasons', () => {
    expect(() => sanitizeBranchName('a..b')).toThrow('cannot contain ".."');
    expect(() => sanitizeBranchName('x/')).toThrow('cannot end with "/"');
    expect(() => sanitizeBranchName('y.lock')).toThrow('cannot end with ".lock"');
    expect(() => sanitizeBranchName('/abs')).toThrow('cannot start with "/"');
    expect(() => sanitizeBranchName('part/.dot')).toThrow('part starting with "."');
  });

  it('still applies the argv guard (leading dash / control chars)', () => {
    expect(() => sanitizeBranchName('-flag')).toThrow('cannot start with "-"');
    expect(() => sanitizeBranchName('a\nb')).toThrow('line break');
  });

  it('includes the label in the thrown error', () => {
    expect(() => sanitizeBranchName('a..b', 'Worktree branch')).toThrow('Worktree branch');
  });

  it('is EXACTLY validateBranchName: parity over a mixed sample', () => {
    const samples = [
      'main', 'a..b', '@{x', 'a//b', '/lead', 'trail/', 'dot.', 'n.lock',
      'p/.x', 'p/y.lock/z', '-x', 'ok/name_1.2', 'control\x1f', '',
    ];
    for (const name of samples) {
      const check = validateBranchName(name);
      if (check.ok) expect(sanitizeBranchName(name)).toBe(name);
      else expect(() => sanitizeBranchName(name)).toThrow(`git: ${(check as { ok: false; reason: string }).reason}`);
    }
  });
});
