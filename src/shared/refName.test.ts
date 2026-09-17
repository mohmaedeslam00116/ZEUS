/**
 * Tests for `@shared/refName` — the single git ref/branch naming rule table.
 *
 * Security regression suite (ADR-0004 reinforcement): `refCharProblem` is the
 * argv/metacharacter guard applied to EVERY ref handed to git (option
 * smuggling, control chars), and `validateBranchName` the full
 * `git check-ref-format --branch` rule set for names the user creates.
 *
 * Fixtures are committed and hermetic: they encode the documented
 * `git check-ref-format` semantics (https://git-scm.com/docs/git-check-ref-format)
 * and are deliberately NOT verified against a live git at test time.
 */
import { describe, expect, it } from 'vitest';
import { refCharProblem, validateBranchName, type RefCheck } from './refName';

const ok = (r: RefCheck) => r.ok === true;
const bad = (r: RefCheck) => (r.ok === false ? r.reason : '');

describe('refCharProblem — the argv guard for every ref handed to git', () => {
  describe('accepts legitimate refnames', () => {
    const valid = [
      'main',
      'feature/login-redesign',
      'release-1.2.3',
      'origin/main',
      'v1.0.0-rc.1',
      // A 40-hex name that looks like an object id is a git footgun to ALLOW
      // (documented in refName.ts): it must never be rejected here.
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      // A bare "@" is likewise accepted (branch = refs/heads/@).
      '@',
      // NBSP / BOM / U+3000 are NOT \s matches git rejects — they are legal
      // pasted-in names (the exact bug this table was written to fix).
      'feature\u00A0one',
      '\uFEFFbom-prefixed',
      'feature\u3000space',
      'a'.repeat(200), // under GIT_LIMITS.refNameMax
    ];
    for (const ref of valid) {
      it(`accepts ${JSON.stringify(ref.length > 40 ? `${ref.slice(0, 16)}…(${ref.length})` : ref)}`, () => {
        expect(refCharProblem(ref)).toBeNull();
      });
    }
  });

  describe('rejects option smuggling and forbidden characters', () => {
    const cases: Array<[string, string]> = [
      ['', 'cannot be empty'],
      ['-upstream', 'cannot start with "-"'], // --upload-pack-style argv smuggling
      ['--exec=evil', 'cannot start with "-"'],
      ['has space', 'cannot contain a space'],
      ['has\ttab', 'cannot contain a tab'],
      ['has\nnewline', 'cannot contain a line break'],
      ['has\rcr', 'cannot contain a line break'],
      // `~`, `^` and `:` are refname-forbidden too — this guard rejects them
      // even inside revision syntax (call sites pass SHAs and plain refs).
      ['a~b', 'cannot contain "~"'],
      ['a^b', 'cannot contain "^"'],
      ['a:b', 'cannot contain ":"'],
      ['a?b', 'cannot contain "?"'],
      ['a*b', 'cannot contain "*"'],
      ['a[b', 'cannot contain "["'],
      ['a\\b', 'cannot contain "\\"'],
      ['\x00nul', 'cannot contain a control character'],
      ['\x01soh', 'cannot contain a control character'],
      ['\x1fus', 'cannot contain a control character'],
      ['\x7fdel', 'cannot contain a control character'],
      ['a'.repeat(300), 'too long'],
    ];
    for (const [ref, reasonPart] of cases) {
      it(`rejects ${JSON.stringify(ref.length > 20 ? `${ref.slice(0, 12)}…` : ref)} (${reasonPart})`, () => {
        const problem = refCharProblem(ref);
        expect(problem).not.toBeNull();
        expect(problem).toEqual(expect.stringContaining(reasonPart));
      });
    }
  });

  it('labels errors with the given label', () => {
    expect(refCharProblem('-x', 'tag')).toContain('tag');
  });
});

describe('validateBranchName — full check-ref-format --branch rules for created refs', () => {
  describe('accepts structurally valid branch names', () => {
    const valid = [
      'main',
      'zeus/worktree-experiment',
      'feature/one/two/deep',
      'v1.2',
      // A part may CONTAIN a dot — it just may not START with one or end the
      // name with one (those are the actual git rules).
      'feature/x.hidden-y',
      '@',
      'user@host',
      'ref@x',
      'a.b.c',
      'ends-with-lock-not',
      '9.0-backport',
    ];
    for (const name of valid) {
      it(`accepts ${JSON.stringify(name)}`, () => {
        expect(ok(validateBranchName(name))).toBe(true);
      });
    }
  });

  describe('rejects the structural rules beyond refCharProblem', () => {
    const cases: Array<[string, string]> = [
      ['a..b', 'cannot contain ".."'],
      ['@{nonsense', 'cannot contain "@{"'],
      ['a//b', 'cannot contain "//"'],
      ['/leading-slash', 'cannot start with "/"'],
      ['trailing-slash/', 'cannot end with "/"'],
      ['ends-with-dot.', 'cannot end with "."'],
      ['ends-with.lock', 'cannot end with ".lock"'],
      ['component/.leading-dot', 'cannot have a part starting with "."'],
      ['component/x.lock/y', 'cannot have a part ending in ".lock"'],
      // All of the refCharProblem classes still apply:
      ['-leading-dash', 'cannot start with "-"'],
      ['control\x01char', 'cannot contain a control character'],
      ['space name', 'cannot contain a space'],
    ];
    for (const [name, reasonPart] of cases) {
      it(`rejects ${JSON.stringify(name)} (${reasonPart})`, () => {
        const check = validateBranchName(name);
        expect(check.ok).toBe(false);
        expect(bad(check)).toContain(reasonPart);
      });
    }
  });

  it('propagates the label into reasons', () => {
    const check = validateBranchName('a..b', 'Worktree name');
    expect(bad(check)).toContain('Worktree name');
  });
});
