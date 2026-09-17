/**
 * Alpha-era default-channel tests (Spec 14 / ADR-0008): a fresh install's
 * `updates.channel` defaults to `beta` so invited alpha testers track
 * prereleases out of the box. Consent, no-auto-download, and no-auto-resume
 * semantics are unchanged — those remain covered by the updater suites; these
 * tests pin the default value itself.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from './constants';

describe('alpha-era default update channel (Spec 14)', () => {
  it('defaults a fresh install to the beta channel', () => {
    expect(DEFAULT_SETTINGS.updates.channel).toBe('beta');
  });

  it('leaves the update preference fields untouched (forced-off beta download lives in the updater, not the default)', () => {
    expect(DEFAULT_SETTINGS.updates.autoCheck).toBe(true);
    expect(DEFAULT_SETTINGS.updates.autoDownload).toBe(true);
  });
});
