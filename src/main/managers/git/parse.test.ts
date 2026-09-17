/**
 * Tests for `main/managers/git/parse.ts` — the git output parsers (pure
 * string → structure functions; git itself is never invoked).
 *
 * `status.ts` note (ticket #11 inventory): its only testable helper,
 * `sumNumstat`, is module-private and its exported surface shells out to git —
 * there is no pure function to test without an unauthorized export. The
 * porcelain/numstat PARSING that status.ts feeds on is covered here via
 * `parseStatus` / `parseNumstat`, which share the same output shapes.
 */
import { describe, expect, it } from 'vitest';
import {
  parseLog,
  parseNameStatus,
  parseNumstat,
  parseStatus,
  parseUnifiedDiff,
} from './parse';

describe('parseStatus — git status --porcelain=v2 -z', () => {
  it('parses branch header, upstream, and ahead/behind', () => {
    const raw = [
      '# branch.oid 1234567890abcdef',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
    ].join('\0');
    const out = parseStatus(raw);
    expect(out.branch).toBe('main');
    expect(out.upstream).toBe('origin/main');
    expect(out.ahead).toBe(2);
    expect(out.behind).toBe(1);
    expect(out.detached).toBe(false);
  });

  it('marks detached HEAD', () => {
    const raw = '# branch.head (detached)';
    expect(parseStatus(raw).detached).toBe(true);
  });

  it('parses ordinary (type 1) entries with X/Y codes', () => {
    const raw = ['1 .M N... 100644 100644 100644 abc def src/app.ts'].join('\0');
    const out = parseStatus(raw);
    expect(out.files).toHaveLength(1);
    expect(out.files[0].path).toBe('src/app.ts');
  });

  it('handles paths containing spaces (type-1 fixed columns then path)', () => {
    const raw = ['1 .M N... 100644 100644 100644 abc def docs/my file.md'].join('\0');
    const out = parseStatus(raw);
    expect(out.files[0].path).toBe('docs/my file.md');
  });
});

describe('parseNumstat — git diff --numstat -z', () => {
  it('parses adds/dels per path', () => {
    const raw = ['12\t3\tsrc/a.ts', '0\t0\tsrc/b.ts'].join('\0');
    const map = parseNumstat(raw);
    expect(map.get('src/a.ts')).toEqual({ adds: 12, dels: 3 });
    expect(map.get('src/b.ts')).toEqual({ adds: 0, dels: 0 });
  });

  it('records binary rows as zeroed counts (sum-skipped downstream), not NaN', () => {
    const raw = ['-\t-\tpixel.png', '5\t1\tsrc/a.ts'].join('\0');
    const map = parseNumstat(raw);
    // Number('-') is NaN → the finite check lands 0/0; consumers summing the
    // columns therefore add nothing for binary files.
    expect(map.get('pixel.png')).toEqual({ adds: 0, dels: 0 });
    expect(map.get('src/a.ts')).toEqual({ adds: 5, dels: 1 });
  });

  it('handles the rename form (empty inline path, NUL-separated old/new)', () => {
    // Rename rows are: adds \t dels \t (empty) NUL oldPath NUL newPath
    const raw = ['4\t2\t', 'old.ts', 'new.ts'].join('\0');
    const map = parseNumstat(raw);
    expect(map.get('new.ts')).toEqual({ adds: 4, dels: 2 });
  });
});

describe('parseUnifiedDiff — hunks, line numbers, binary detection', () => {
  const DIFF = [
    'diff --git a/src/app.ts b/src/app.ts',
    'index abc..def 100644',
    '--- a/src/app.ts',
    '+++ b/src/app.ts',
    '@@ -10,3 +10,4 @@ function app() {',
    '  context line',
    '-removed line',
    '+added line',
    '+second added',
    ' another context',
  ].join('\n');

  it('drops the preamble (diff/index/---/+++) and keeps only hunks', () => {
    const { binary, hunks } = parseUnifiedDiff(DIFF);
    expect(binary).toBe(false);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].header).toMatch(/^@@ -10,3 \+10,4 @@/);
    expect(hunks[0].lines).toHaveLength(5);
  });

  it('classifies lines and assigns correct old/new line numbers', () => {
    const { hunks } = parseUnifiedDiff(DIFF);
    const [ctx1, del, add1, add2, ctx2] = hunks[0].lines;
    // Counters advance AFTER each consumed line: the context at 10/10 moves
    // both counters to 11, so the deletion is old 11 and the first addition is
    // new 11, etc.
    expect(ctx1).toMatchObject({ kind: 'context', oldLine: 10, newLine: 10 });
    expect(del).toMatchObject({ kind: 'del', oldLine: 11 });
    expect(add1).toMatchObject({ kind: 'add', newLine: 11 });
    expect(add2).toMatchObject({ kind: 'add', newLine: 12 });
    expect(ctx2).toMatchObject({ kind: 'context', oldLine: 12, newLine: 13 });
  });

  it('detects binary diffs with zero hunks', () => {
    const raw = 'diff --git a/img.png b/img.png\nBinary files a/img.png and b/img.png differ\n';
    const { binary, hunks } = parseUnifiedDiff(raw);
    expect(binary).toBe(true);
    expect(hunks).toHaveLength(0);
  });

  it('keeps the backslash "No newline at end of file" marker as a meta line', () => {
    // Real git emits the backslash and the text on ONE line.
    const raw = ['@@ -1,1 +1,1 @@', '-old', '\\ No newline at end of file', '+new'].join('\n');
    const { hunks } = parseUnifiedDiff(raw);
    const meta = hunks[0].lines.find((l) => l.kind === 'meta');
    expect(meta).toBeDefined();
    expect(meta?.text).toContain('No newline');
  });
});

describe('parseLog + LOG_FORMAT — git log record parsing', () => {
  it('LOG_FORMAT round-trips through parseLog', () => {
    const at = 1_700_000_000;
    const raw = [
      ['abc123full', 'abc123', 'Jane Doe', 'jane@example.com', String(at), 'fix: the thing', 'HEAD -> main, origin/main'].join('\x1f'),
    ].join('\x1e');
    const commits = parseLog(raw);
    expect(commits).toHaveLength(1);
    const c = commits[0];
    expect(c.hash).toBe('abc123full');
    expect(c.shortHash).toBe('abc123');
    expect(c.author).toBe('Jane Doe');
    expect(c.at).toBe(at * 1000);
    expect(c.subject).toBe('fix: the thing');
    expect(c.refs).toEqual(['main', 'origin/main']);
  });

  it('skips empty records and tolerates missing refs', () => {
    const raw = ['\x1e', ['def456full', 'def456', 'A', 'a@x', '1', 's', ''].join('\x1f')].join('\x1e');
    const commits = parseLog(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0].refs).toEqual([]);
  });
});

describe('parseNameStatus — git diff-tree --name-status -z', () => {
  it('parses A/M/D codes into file changes', () => {
    const raw = ['A\0new.ts', 'M\0changed.ts', 'D\0gone.ts'].join('\0');
    const files = parseNameStatus(raw);
    expect(files).toHaveLength(3);
    expect(files[0]).toMatchObject({ path: 'new.ts', status: 'added' });
    expect(files[1]).toMatchObject({ path: 'changed.ts', status: 'modified' });
    expect(files[2]).toMatchObject({ path: 'gone.ts', status: 'deleted' });
  });

  it('handles R (rename) consuming two NUL-separated paths', () => {
    const raw = ['R100', 'old.ts', 'new.ts'].join('\0');
    const files = parseNameStatus(raw);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: 'new.ts', oldPath: 'old.ts', status: 'renamed' });
  });
});
