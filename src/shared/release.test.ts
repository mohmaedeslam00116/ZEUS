/**
 * Tests for `channelForTag` in `src/shared/release.ts` — the tag-suffix →
 * channel mapping the release-document metadata renders (#30).
 *
 * The alpha ruling: `-alpha.*` maps to the `beta` branch, agreeing with the
 * alpha-era default settings channel that #28 chose. No new channel exists;
 * `preview` remains the fall-through for other hyphenated suffixes.
 */
import { describe, expect, it } from 'vitest';
import { channelForTag } from './release';

describe('channelForTag', () => {
  it('maps alpha prereleases to the beta branch (agrees with the #28 channel)', () => {
    expect(channelForTag('v0.1.0-alpha.1')).toBe('beta');
    expect(channelForTag('v0.1.0-alpha.12')).toBe('beta');
    expect(channelForTag('0.1.0-alpha.1')).toBe('beta');
  });

  it('maps beta/rc prereleases to beta, unchanged', () => {
    expect(channelForTag('v1.18.0-beta.1')).toBe('beta');
    expect(channelForTag('v1.0.0-rc.1')).toBe('beta');
  });

  it('maps nightly prereleases to nightly, unchanged', () => {
    expect(channelForTag('v1.0.0-nightly.20260917')).toBe('nightly');
  });

  it('keeps other hyphenated suffixes on the preview fall-through', () => {
    expect(channelForTag('v1.0.0-next.1')).toBe('preview');
    expect(channelForTag('v1.0.0-dev.42')).toBe('preview');
  });

  it('maps plain version tags to stable', () => {
    expect(channelForTag('v0.1.0')).toBe('stable');
    expect(channelForTag('v1.20.0')).toBe('stable');
  });
});
