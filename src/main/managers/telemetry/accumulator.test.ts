/**
 * Tests for `main/managers/telemetry/accumulator.ts` — the Runtime Telemetry
 * reducer's honesty rules. The class is a PURE REDUCER: no database, no IPC,
 * no `Date.now()` (the clock is a per-call parameter), no settings reads, and
 * NO constructor — tests instantiate it directly and feed plain objects.
 *
 * The four rules under test (accumulator header + spec-04):
 *   1. Deduplicate `request-start` by message id (parallel tool calls share one
 *      id — counting each multiplies the gauge by the fan-out width).
 *   2. Subagent frames (`parentCallId` set) never touch the parent's gauge.
 *   3. The measured total is the authority: when the estimated contributors sum
 *      ABOVE it, the split is DROPPED (`attributionDegraded`), never scaled.
 *   4. Without a measured denominator (no context window / no usage yet) the
 *      ratio stays ABSENT — INDETERMINATE, never 0%.
 */
import { describe, expect, it } from 'vitest';
import type { AgentProvider } from '@shared/constants';
import { TelemetryAccumulator } from './accumulator';
import type { HostFacts, LimitLookup } from './accumulator';
import type { ModelLimits, ProviderTelemetrySignal } from './types';

const T0 = 1_000_000;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- arity required by LimitLookup
const EMPTY_LIMITS: LimitLookup = (_model: string) => undefined;

const limitsFor = (windowTokens: number, maxOutput = 0): LimitLookup =>
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- arity required by LimitLookup
  (_model: string) =>
    ({ contextWindow: windowTokens, maxOutputTokens: maxOutput }) as unknown as ModelLimits & {
      autoCompactTokens?: number;
    };

/** Neutral host facts: no measured characters, so every estimate is zero. */
function host(over: Partial<HostFacts> = {}): HostFacts {
  return {
    toolResultChars: 0,
    mcpResultChars: 0,
    conversationChars: 0,
    ...over,
  };
}

function runStart(over: Record<string, unknown> = {}): ProviderTelemetrySignal {
  return {
    kind: 'run-start',
    sessionId: 's1',
    runId: 'r1',
    provider: 'anthropic' as AgentProvider,
    model: 'claude-test',
    mode: 'default',
    injected: {
      memory: 0,
      search: 0,
      resume: 0,
      attachments: 0,
      prompt: 0,
      memoryHits: 0,
      searchHits: 0,
      memoryBudget: 0,
      searchBudget: 0,
    },
    ...over,
  } as ProviderTelemetrySignal;
}

function requestStart(over: Record<string, unknown> = {}): ProviderTelemetrySignal {
  return {
    kind: 'request-start',
    sessionId: 's1',
    messageId: 'msg_1',
    usage: { inputTokens: 1_000, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0 },
    ...over,
  } as ProviderTelemetrySignal;
}

function ctx(acc: TelemetryAccumulator, limits: LimitLookup = EMPTY_LIMITS, h: HostFacts = host()) {
  return acc.snapshot('s1', T0 + 10, limits, h)?.context;
}

describe('RULE 1 — request-start deduplication by message id', () => {
  it('counts one message id once even when parallel tool calls repeat it', () => {
    const acc = new TelemetryAccumulator();
    acc.apply(runStart(), T0);
    const first = acc.apply(requestStart(), T0 + 1);
    expect(first).toBe('s1');
    // Three more assistant messages share the SAME id (Anthropic fan-out).
    acc.apply(requestStart(), T0 + 2);
    acc.apply(requestStart(), T0 + 3);
    acc.apply(requestStart(), T0 + 4);
    expect(ctx(acc)?.usedTokens).toBe(1_000);
  });

  it('a DIFFERENT message id advances the gauge normally', () => {
    const acc = new TelemetryAccumulator();
    acc.apply(runStart(), T0);
    acc.apply(requestStart({ messageId: 'a' }), T0 + 1);
    acc.apply(requestStart({ messageId: 'b', usage: { inputTokens: 1_200, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0 } }), T0 + 2);
    expect(ctx(acc)?.usedTokens).toBe(1_200);
  });

  it('per-session dedup: the same id in another session is counted there', () => {
    const acc = new TelemetryAccumulator();
    acc.apply(runStart({ sessionId: 's1', runId: 'r1' }), T0);
    acc.apply(runStart({ sessionId: 's2', runId: 'r2' }), T0);
    acc.apply(requestStart({ sessionId: 's1', messageId: 'shared' }), T0 + 1);
    acc.apply(requestStart({ sessionId: 's2', messageId: 'shared' }), T0 + 2);
    expect(ctx(acc)?.usedTokens).toBe(1_000);
    const other = acc.snapshot('s2', T0 + 10, EMPTY_LIMITS, host())?.context;
    expect(other?.usedTokens).toBe(1_000);
  });
});

describe('RULE 2 — subagent frames never touch the parent gauge', () => {
  it('request-start with parentCallId is ignored entirely', () => {
    const acc = new TelemetryAccumulator();
    acc.apply(runStart(), T0);
    acc.apply(requestStart(), T0 + 1);
    acc.apply(
      requestStart({
        messageId: 'sub_msg',
        parentCallId: 'call_agent',
        usage: { inputTokens: 50_000, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0 },
      }),
      T0 + 2,
    );
    expect(ctx(acc)?.usedTokens).toBe(1_000);
  });

  it('output-progress from a subagent also never moves the parent', () => {
    const acc = new TelemetryAccumulator();
    acc.apply(runStart(), T0);
    acc.apply(requestStart(), T0 + 1);
    acc.apply({ kind: 'output-progress', sessionId: 's1', outputTokens: 9_999, parentCallId: 'call_agent' }, T0 + 2);
    // The parent run's cumulative output is tracked via outputTokens on the
    // run rollup; a subagent frame must not have patched it.
    const snap = acc.snapshot('s1', T0 + 10, EMPTY_LIMITS, host());
    const run = snap?.run as { outputTokens?: number } | undefined;
    expect(run?.outputTokens ?? 0).not.toBe(9_999);
  });
});

describe('RULE 3 — measured total is the authority; degraded attribution drops the split', () => {
  it('estimates below the measured total are attributed (origin: estimated)', () => {
    const acc = new TelemetryAccumulator();
    acc.apply(runStart(), T0);
    acc.apply(requestStart(), T0 + 1); // measured 1000
    // charsPerToken = 3.6 (TELEMETRY_LIMITS), estTokens always ceils:
    // 400/3.6 → ceil(111.1) = 112 tokens per contributor, 224 total < 1000.
    const c = ctx(acc, limitsFor(8_000, 0), host({ conversationChars: 400, toolResultChars: 400 }));
    expect(c?.attributionDegraded).toBeUndefined();
    const estimated = c?.segments?.filter((s) => s.origin === 'estimated');
    expect(estimated?.map((s) => s.id)).toEqual(['conversation', 'tools']);
    // The residual lands in the measured 'system' segment.
    const system = c?.segments?.find((s) => s.id === 'system');
    expect(system?.origin).toBe('measured');
    expect(system?.tokens).toBe(1_000 - 224);
  });

  it('estimates ABOVE the measured total drop the split and set attributionDegraded', () => {
    const acc = new TelemetryAccumulator();
    acc.apply(runStart(), T0);
    acc.apply(requestStart(), T0 + 1); // measured 1000
    // 40_000 chars → 10_000 estimated tokens > 1_000 measured.
    const c = ctx(acc, limitsFor(64_000), host({ conversationChars: 40_000 }));
    expect(c?.attributionDegraded).toBe(true);
    // The split is GONE (only the measured reserved segment may remain).
    expect(c?.segments?.every((s) => s.id === 'reserved')).toBe(true);
  });
});

describe('RULE 4 — INDETERMINATE, never 0%', () => {
  it('no measured window → pctUsed stays ABSENT (indeterminate), not 0', () => {
    const acc = new TelemetryAccumulator();
    acc.apply(runStart(), T0);
    acc.apply(requestStart(), T0 + 1);
    const c = ctx(acc, EMPTY_LIMITS); // limits lookup yields nothing
    expect(c?.usedTokens).toBe(1_000);
    expect(c?.pctUsed).toBeUndefined();
    expect(c?.windowTokens).toBeUndefined();
  });

  it('no usage yet (usedTokens <= 0) → also indeterminate even with a window', () => {
    const acc = new TelemetryAccumulator();
    acc.apply(runStart(), T0);
    const c = ctx(acc, limitsFor(8_000));
    expect(c?.pctUsed).toBeUndefined();
  });

  it('with window + usage the ratio is measured and capped at 100', () => {
    const acc = new TelemetryAccumulator();
    acc.apply(runStart(), T0);
    acc.apply(requestStart({ usage: { inputTokens: 9_000, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0 } }), T0 + 1);
    const c = ctx(acc, limitsFor(8_000, 0));
    expect(c?.pctUsed).toBe(100);
    expect(c?.remainingTokens).toBe(0);
  });
});

describe('lifecycle plumbing the rules depend on', () => {
  it('compaction resets the estimates and moves the measured total to postTokens', () => {
    const acc = new TelemetryAccumulator();
    acc.apply(runStart({ injected: { memory: 0, search: 0, resume: 0, attachments: 0, prompt: 0, memoryHits: 0, searchHits: 0, memoryBudget: 0, searchBudget: 0 } }), T0);
    acc.apply(requestStart(), T0 + 1);
    const changed = acc.apply({ kind: 'compaction', sessionId: 's1', trigger: 'auto', preTokens: 1_000, postTokens: 300 }, T0 + 2);
    expect(changed).toBe('s1');
    // Host-supplied chars are the manager's live view and stay; the rule is
    // that the run-start INJECTED estimates (memory/search/resume/attachments)
    // were cleared from accumulator state — so with an empty host nothing is
    // attributed anymore.
    const c = ctx(acc, limitsFor(8_000), host());
    expect(c?.usedTokens).toBe(300);
    expect(c?.segments?.some((s) => s.origin === 'estimated')).toBe(false);
  });

  it('snapshot for an unknown session is null (no invented data)', () => {
    const acc = new TelemetryAccumulator();
    expect(acc.snapshot('ghost', T0, EMPTY_LIMITS, host())).toBeNull();
  });

  it('quota signals return null and are fanned out by the caller, not per-session', () => {
    const acc = new TelemetryAccumulator();
    acc.apply(runStart(), T0);
    const changed = acc.apply(
      {
        kind: 'quota',
        windowKind: 'five_hour',
        status: 'ok',
        utilization: 0.2,
        resetsAt: T0 + 3_600_000,
        isUsingOverage: false,
      } as never,
      T0 + 5,
    );
    expect(changed).toBeNull();
    const snap = acc.snapshot('s1', T0 + 10, EMPTY_LIMITS, host());
    expect(snap?.quota).toBeDefined();
  });
});
