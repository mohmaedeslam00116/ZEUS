/**
 * Tests for the keyboard-hint label mapping (`keyLabels.ts`) — #27 audit row
 * B1. The function is pure and platform-parameterized; tests cover both
 * platform branches deterministically. The acceptance case: the TitleBar
 * alias input `['Mod', 'P']` renders `Ctrl P` on non-mac platforms.
 */
import { describe, expect, it } from 'vitest';

import { detectKeyPlatform, displayKey } from './keyLabels';

describe('detectKeyPlatform', () => {
  it('classifies mac platforms by navigator.platform', () => {
    expect(detectKeyPlatform({ platform: 'MacIntel' })).toBe('mac');
    expect(detectKeyPlatform({ platform: 'iPhone' })).toBe('mac');
    expect(detectKeyPlatform({ platform: 'iPad' })).toBe('mac');
  });

  it('classifies Windows, Linux, and absent navigators as other', () => {
    expect(detectKeyPlatform({ platform: 'Win32' })).toBe('other');
    expect(detectKeyPlatform({ platform: 'Linux x86_64' })).toBe('other');
    expect(detectKeyPlatform(undefined)).toBe('other');
  });
});

describe('displayKey', () => {
  it('resolves the Mod alias to Ctrl on other platforms (acceptance: Ctrl P)', () => {
    expect(displayKey('Mod', 'other')).toBe('Ctrl');
    expect(displayKey('Mod', 'other') + ' P').toBe('Ctrl P');
  });

  it('renders other modifiers as text on other platforms', () => {
    expect(displayKey('Cmd', 'other')).toBe('Ctrl');
    expect(displayKey('Option', 'other')).toBe('Alt');
    expect(displayKey('Shift', 'other')).toBe('Shift');
  });

  it('preserves the mac symbol mapping', () => {
    expect(displayKey('Mod', 'mac')).toBe('⌘');
    expect(displayKey('Ctrl', 'mac')).toBe('⌘');
    expect(displayKey('Option', 'mac')).toBe('⌥');
    expect(displayKey('Alt', 'mac')).toBe('⌥');
    expect(displayKey('Shift', 'mac')).toBe('⇧');
  });

  it('passes plain keys through unchanged on both platforms', () => {
    for (const platform of ['mac', 'other'] as const) {
      expect(displayKey('P', platform)).toBe('P');
      expect(displayKey('Esc', platform)).toBe('Esc');
      expect(displayKey('PageDown', platform)).toBe('PageDown');
      expect(displayKey('`', platform)).toBe('`');
    }
  });

  it('maps the full TitleBar hint input to the platform register', () => {
    // The title bar passes ['Mod', 'P'] — the exact audited row B1 input.
    expect(['Mod', 'P'].map((k) => displayKey(k, 'other'))).toEqual(['Ctrl', 'P']);
    expect(['Mod', 'P'].map((k) => displayKey(k, 'mac'))).toEqual(['⌘', 'P']);
  });
});
