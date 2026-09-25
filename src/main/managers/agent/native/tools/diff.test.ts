import { describe, it, expect } from 'vitest';
import { computeUnifiedDiff } from './diff';

describe('computeUnifiedDiff', () => {
  it('returns empty string when contents are identical', () => {
    const content = 'line 1\nline 2\nline 3';
    expect(computeUnifiedDiff('src/app.ts', content, content)).toBe('');
  });

  it('computes simple addition diff', () => {
    const oldContent = 'line 1\nline 2';
    const newContent = 'line 1\nline 2\nline 3';
    const diff = computeUnifiedDiff('src/app.ts', oldContent, newContent);

    expect(diff).toContain('--- a/src/app.ts');
    expect(diff).toContain('+++ b/src/app.ts');
    expect(diff).toContain('+line 3');
  });

  it('computes simple deletion diff', () => {
    const oldContent = 'line 1\nline 2\nline 3';
    const newContent = 'line 1\nline 3';
    const diff = computeUnifiedDiff('src/app.ts', oldContent, newContent);

    expect(diff).toContain('-line 2');
    expect(diff).toContain(' line 1');
    expect(diff).toContain(' line 3');
  });

  it('computes replacement / modification diff', () => {
    const oldContent = 'const x = 1;\nconst y = 2;';
    const newContent = 'const x = 100;\nconst y = 2;';
    const diff = computeUnifiedDiff('src/calc.ts', oldContent, newContent);

    expect(diff).toContain('-const x = 1;');
    expect(diff).toContain('+const x = 100;');
    expect(diff).toContain(' const y = 2;');
  });

  it('normalizes backslashes to forward slashes in header paths', () => {
    const oldContent = 'hello';
    const newContent = 'world';
    const diff = computeUnifiedDiff('src\\nested\\file.ts', oldContent, newContent);

    expect(diff).toContain('--- a/src/nested/file.ts');
    expect(diff).toContain('+++ b/src/nested/file.ts');
  });
});
