/**
 * Contrast gate for the audited #27 B2 state-copy pairs: token values are
 * parsed from the committed stylesheet so the test tracks the real design
 * tokens, not a copy. Asserts the state-copy token (muted) meets WCAG AA
 * (>= 4.5:1) on the surfaces the global-search states render on, and pins
 * why the previously used faint token fails. Hermetic: no network, no clock,
 * no git invocation (ADR-0007 fixture policy).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const CSS_PATH = join(__dirname, '../../styles/index.css');

function readToken(name: string): string {
  const css = readFileSync(CSS_PATH, 'utf8');
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --color-${name} not found in ${CSS_PATH}`);
  return m[1].slice(1);
}

function luminance(hex: string): number {
  const parts = hex.match(/[0-9a-f]{2}/gi);
  if (!parts || parts.length !== 3) throw new Error(`not a 6-digit hex color: ${hex}`);
  const c = parts.map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(fgHex: string, bgHex: string): number {
  const [l1, l2] = [luminance(fgHex), luminance(bgHex)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('WCAG AA contrast for global-search state copy (#27 B2)', () => {
  const stateCopy = readToken('muted');
  const elevated = readToken('elevated');
  const surface2 = readToken('surface-2');

  it('state copy meets AA on the elevated search panel', () => {
    expect(contrast(stateCopy, elevated)).toBeGreaterThanOrEqual(4.5);
  });

  it('state copy meets AA on surface-2 wells (rows/hover states)', () => {
    expect(contrast(stateCopy, surface2)).toBeGreaterThanOrEqual(4.5);
  });

  it('documents the replaced faint token as sub-AA on the same surfaces', () => {
    // The audit's finding: faint carried the audited copy below AA. If a
    // future token change fixes faint, this test may be updated deliberately.
    expect(contrast(readToken('faint'), elevated)).toBeLessThan(4.5);
  });
});
