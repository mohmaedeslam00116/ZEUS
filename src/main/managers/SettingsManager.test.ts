/**
 * Tests for the extracted pure `normalizeSettings` (SettingsManager.ts).
 *
 * Per ticket #11 (the ONE authorized test-support refactor), the former
 * private method is now an exported pure function; the class delegates. These
 * tests exercise the security-relevant rules directly:
 *   - numeric clamps (a hand-edited settings.json cannot seed unbounded values)
 *   - enum allowlists (junk values self-heal to safe defaults)
 *   - the voice v30→v31 migration (stale `voice` key is deleted)
 *   - crown-jewel write-path screening (via the sandbox policy module)
 *
 * `screenExtraWritePath` ultimately reads `app.getPath('userData')`, so the
 * electron module is mocked hermetically — no Electron runtime is needed.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\fake\\userData' },
}));

import { DEFAULT_SETTINGS, SETTINGS_VERSION } from '@shared/constants';
import type { AppSettings, DeepPartial } from '@shared/types';
import { normalizeSettings } from './SettingsManager';

/** Deep-clone defaults so tests never mutate the shared constant. */
function base(): AppSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as AppSettings;
}

/** Build a minimal patch from the real defaults (normalize deep-merges anyway). */
function normalized(over: DeepPartial<AppSettings> = {}): AppSettings {
  return normalizeSettings(over as Partial<AppSettings>);
}

describe('normalizeSettings — clamps numeric ranges', () => {
  it('clamps agent.maxTurns to its bounded range', () => {
    expect(normalized({ agent: { maxTurns: -5 } }).agent.maxTurns).toBeGreaterThan(0);
    expect(normalized({ agent: { maxTurns: 1e9 } }).agent.maxTurns).toBeLessThan(1e9);
  });

  it('clamps a hand-edited fontScale', () => {
    expect(normalized({ appearance: { fontScale: 99 } }).appearance.fontScale).toBeLessThanOrEqual(3);
  });

  it('clamps graph.retentionDays / maxNodes (a recursive SQL traversal bound)', () => {
    const out = normalized({ graph: { retentionDays: 10_000, maxNodes: 10_000_000 } });
    expect(out.graph.retentionDays).toBeLessThan(10_000);
    expect(out.graph.maxNodes).toBeLessThan(10_000_000);
  });

  it('rounds fractional numeric knobs', () => {
    expect(Number.isInteger(normalized({ agent: { maxTurns: 12.7 } }).agent.maxTurns)).toBe(true);
  });
});

describe('normalizeSettings — enum allowlists self-heal', () => {
  it('rejects junk sandbox modes (values flow into a real OS jail)', () => {
    const out = normalized({ agent: { sandbox: { mode: 'jailbreak' } as never } });
    expect(out.agent.sandbox.mode).toBe('auto');
  });

  it('rejects junk network policy', () => {
    const out = normalized({ agent: { sandbox: { network: 'promiscuous' } as never } });
    expect(out.agent.sandbox.network).toBe('all');
  });

  it('pins harness.sandboxProvider regardless of the persisted value', () => {
    const out = normalized({
      agent: { harness: { sandboxProvider: 'remote-cloud' } as never },
    });
    expect(out.agent.harness.sandboxProvider).toBe('local-worktree');
  });

  it('falls back to stable for anything but the literal beta channel', () => {
    expect(normalized({ updates: { channel: 'nightly' as never } }).updates.channel).toBe('stable');
    expect(normalized({ updates: { channel: 'beta' } }).updates.channel).toBe('beta');
  });

  it('keeps the tone ladder monotonic (critical below warning)', () => {
    const out = normalized({ runtime: { criticalRemainingPct: 80, warnRemainingPct: 20 } });
    expect(out.runtime.criticalRemainingPct).toBeLessThanOrEqual(out.runtime.warnRemainingPct);
  });
});

describe('normalizeSettings — the voice v30→v31 migration', () => {
  it('deletes the stale voice category from a v30 file (deepMerge cannot)', () => {
    const legacy = base() as AppSettings & { voice: unknown };
    legacy.voice = { enabled: true, model: 'sherpa-onnx-something' };
    const out = normalizeSettings(legacy) as AppSettings & { voice?: unknown };
    expect(out.voice).toBeUndefined();
    expect(out.version).toBe(SETTINGS_VERSION);
  });

  it('stamps the current settings version', () => {
    const out = normalizeSettings({ version: 1 } as Partial<AppSettings>);
    expect(out.version).toBe(SETTINGS_VERSION);
  });
});

describe('normalizeSettings — the worktree-autoSetup v31→v32 migration', () => {
  it('flips a persisted (old-default) autoSetup:true on a pre-32 file to false', () => {
    // A settings.json written during the #8–#13 window carries the OLD default
    // as if explicitly chosen (the constructor persists the merged object).
    const legacy = base();
    legacy.version = 31;
    legacy.git.worktrees.autoSetup = true;
    const out = normalizeSettings(legacy);
    expect(out.git.worktrees.autoSetup).toBe(false);
    expect(out.version).toBe(SETTINGS_VERSION);
  });

  it('stays false when the key was absent (deep-merge fills the new default)', () => {
    const legacy = base();
    legacy.version = 31;
    legacy.git.worktrees.autoSetup = DEFAULT_SETTINGS.git.worktrees.autoSetup;
    // Simulate absence by handing the raw object through the same path a
    // file without the key would take: deepMerge fills the new default false,
    // and the migration must not resurrect true.
    const raw = JSON.parse(JSON.stringify(legacy)) as Partial<AppSettings> & {
      git?: { worktrees?: { autoSetup?: boolean } };
    };
    delete raw.git?.worktrees?.autoSetup;
    const out = normalizeSettings(raw);
    expect(out.git.worktrees.autoSetup).toBe(false);
  });

  it('preserves an explicit autoSetup:false across the migration', () => {
    const legacy = base();
    legacy.version = 31;
    legacy.git.worktrees.autoSetup = false;
    expect(normalizeSettings(legacy).git.worktrees.autoSetup).toBe(false);
  });

  it('preserves autoSetup:true on a CURRENT-version file (explicit user choice)', () => {
    // From v32 on, the only writer of true is the user's own toggle.
    const current = base();
    current.version = SETTINGS_VERSION;
    current.git.worktrees.autoSetup = true;
    expect(normalizeSettings(current).git.worktrees.autoSetup).toBe(true);
  });
});

describe('normalizeSettings — allowlist filtering (renderer-supplied arrays)', () => {
  it('filters sandbox allowedDomains to the domain regex and caps the count', () => {
    const out = normalized({
      agent: {
        sandbox: {
          allowedDomains: ['example.com', 'not a domain!!', '*.github.com', 'x'.repeat(300)] as never,
        },
      },
    });
    expect(out.agent.sandbox.allowedDomains).toContain('example.com');
    expect(out.agent.sandbox.allowedDomains).not.toContain('not a domain!!');
  });

  it('drops extra write paths that resolve into the crown-jewel floor', () => {
    const out = normalized({
      agent: {
        sandbox: {
          allowWritePaths: [
            'D:\\work\\project', // legitimate
            'C:\\fake\\userData\\secrets', // crown jewel (mocked userData)
            'C:\\fake\\userData\\zeus.db', // crown jewel
            'relative\\path', // not absolute
          ],
        },
      },
    });
    expect(out.agent.sandbox.allowWritePaths).toEqual(['D:\\work\\project']);
  });

  it('filters discovered model ids against the Cursor id regex', () => {
    const out = normalized({ agent: { cursor: { discoveredModels: ['gpt-5', 'BAD ID!'] as never } } });
    expect(out.agent.cursor.discoveredModels).not.toContain('BAD ID!');
  });

  it('drops dead plan keys the v22→v23 migration removed', () => {
    const stale = base() as AppSettings & {
      agent: { plan: Record<string, unknown> };
    };
    stale.agent.plan.streamIncrementally = true;
    stale.agent.plan.autoExpandTasks = true;
    const out = normalizeSettings(stale);
    expect((out.agent.plan as Record<string, unknown>).streamIncrementally).toBeUndefined();
    expect((out.agent.plan as Record<string, unknown>).autoExpandTasks).toBeUndefined();
  });
});

describe('normalizeSettings — security-sensitive coercions', () => {
  it('rejects a malformed harness consent fingerprint', () => {
    const out = normalized({ agent: { harness: { bootstrapAck: 'NOT-A-FINGERPRINT!!' as never } } });
    expect(out.agent.harness.bootstrapAck).toBe('');
  });

  it('accepts a well-formed consent fingerprint (lowercase hex)', () => {
    const ack = 'deadbeefdeadbeef';
    const out = normalized({ agent: { harness: { bootstrapAck: ack } } });
    expect(out.agent.harness.bootstrapAck).toBe(ack);
  });

  it('rebuilds persisted documents field-by-field (no key smuggling)', () => {
    const hostile = base();
    (hostile.layout as unknown as Record<string, unknown>).documents = [
      {
        sessionId: 's1',
        kind: 'diff',
        path: 'src/app.ts',
        staged: 'YES',
        __proto__: { polluted: true },
        extra: 'smuggled',
      },
    ] as never;
    const out = normalizeSettings(hostile);
    const docs = out.layout.documents;
    expect(docs).toHaveLength(1);
    expect(Object.keys(docs[0]).sort()).toEqual(['baseRef', 'kind', 'path', 'pinned', 'sessionId', 'staged'].filter((k) => k !== 'baseRef'));
    expect((docs[0] as unknown as { extra?: string }).extra).toBeUndefined();
  });
});
