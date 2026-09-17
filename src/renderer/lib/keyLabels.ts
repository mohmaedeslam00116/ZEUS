/**
 * Platform-conditional keyboard-hint labels (#27 audit row B1).
 *
 * Command keys use the cross-platform alias `Mod` (see `lib/commands.ts`).
 * On macOS the common modifiers render as symbols; elsewhere `Mod`/`Cmd`
 * resolve to the literal `Ctrl` so the hint names a key that exists on the
 * running platform. Extracted as a pure function so the mapping is directly
 * unit-testable (ADR-0007 pure-module rule; exported for testing — production
 * behavior never branches on test mode).
 */

export type KeyPlatform = 'mac' | 'other';

export function detectKeyPlatform(nav: Pick<Navigator, 'platform'> | undefined): KeyPlatform {
  return nav && /Mac|iPhone|iPad/.test(nav.platform) ? 'mac' : 'other';
}

const MAC_SYMBOLS: Array<[RegExp, string]> = [
  [/Mod|Cmd|Ctrl/i, '⌘'],
  [/Alt|Option/i, '⌥'],
  [/Shift/i, '⇧'],
];

export function displayKey(key: string, platform: KeyPlatform): string {
  if (platform === 'mac') {
    let out = key;
    for (const [re, sym] of MAC_SYMBOLS) out = out.replace(re, sym);
    return out;
  }
  return key.replace(/Mod|Cmd/i, 'Ctrl').replace(/Option/i, 'Alt');
}
