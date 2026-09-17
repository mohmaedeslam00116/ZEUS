/**
 * Tests for `main/managers/graph/builder.ts` — the Work Graph reconstruction
 * reducer. Covers the exported pure surface:
 *   - `nodeKindForTool`: the provider-neutral tool→node-kind table, including
 *     the Task/Agent dual-name rule (the subagent kind was unreachable when
 *     only 'Task' was tested — never test name==='Task' alone).
 *   - `WorkGraphBuilder.ingest`: run/objective lifecycle, node idempotency
 *     (one file node per (run, path)), derived-flag handling, and the
 *     permission-decision path (denials + user approvals only — auto-approvals
 *     are already represented by their own tool node).
 *
 * The builder never touches Electron/DB/IPC; `BuilderContext` is injected, so
 * tests construct it with plain objects. `crypto.randomUUID` is the only node
 * builtin used and is available in the node test environment.
 */
import { describe, expect, it } from 'vitest';
import type { AgentToolCall, ChatMessage, FileChange } from '@shared/types';
import type { BuilderContext, PermissionDecisionSignal } from './builder';
import { nodeKindForTool, WorkGraphBuilder } from './builder';
import { SUBAGENT_TOOL_NAMES } from '@shared/subagents';

/** A minimal BuilderContext: deterministic, permissive, fresh seq. */
function makeCtx(overrides: Partial<BuilderContext> = {}): BuilderContext {
  return {
    workspaceIdFor: () => 'ws_test',
    provider: () => 'anthropic',
    mode: () => 'default',
    model: () => 'claude-test-model',
    overlayEnabled: () => true,
    initialSeq: () => 0,
    ...overrides,
  };
}

function toolCall(overrides: Partial<AgentToolCall> = {}): AgentToolCall {
  return {
    id: 'call_1',
    sessionId: 's1',
    name: 'Read',
    risk: 'read',
    summary: 'Read src/app.ts',
    status: 'running',
    startedAt: 1_000,
    ...overrides,
  };
}

function userMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    sessionId: 's1',
    role: 'user',
    text: 'Fix the login bug',
    streaming: false,
    createdAt: 1_000,
    ...overrides,
  };
}

function newBuilder(): WorkGraphBuilder {
  return new WorkGraphBuilder(makeCtx());
}

/** Start a run (a user message opens the objective node) and return its result. */
function startRun(b: WorkGraphBuilder, msg = userMessage()) {
  return b.ingest({ kind: 'message-done', sessionId: 's1', message: msg });
}

describe('nodeKindForTool — the provider-neutral tool→kind table', () => {
  it('maps the subagent tool under BOTH spellings (Task/Agent dual-name rule)', () => {
    // Never test name==='Task' alone — current SDK releases emit `Agent`.
    for (const name of SUBAGENT_TOOL_NAMES) {
      expect(nodeKindForTool(toolCall({ name }))).toBe('subagent');
    }
  });

  it('maps the internal MCP search/memory servers before the generic mcp kind', () => {
    expect(nodeKindForTool(toolCall({ name: 'mcp__zeus_search__search' }))).toBe('search');
    expect(nodeKindForTool(toolCall({ name: 'mcp__zeus_memory__remember' }))).toBe('memory');
  });

  it('maps other MCP servers to the generic mcp kind', () => {
    expect(nodeKindForTool(toolCall({ name: 'mcp__github__create_issue' }))).toBe('mcp');
    expect(nodeKindForTool(toolCall({ name: 'mcp__deep__nested__tool' }))).toBe('mcp');
  });

  it('maps terminal tools', () => {
    for (const name of ['Bash', 'BashOutput', 'KillShell']) {
      expect(nodeKindForTool(toolCall({ name, risk: 'command' }))).toBe('terminal');
    }
  });

  it('maps file-changing tools to file (via change payload or write risk)', () => {
    const change = { path: 'src/app.ts', status: 'edited' } as unknown as FileChange;
    expect(nodeKindForTool(toolCall({ name: 'Write', change }))).toBe('file');
    expect(nodeKindForTool(toolCall({ name: 'NotebookEdit', risk: 'write' }))).toBe('file');
  });

  it('defaults everything else to investigation', () => {
    expect(nodeKindForTool(toolCall({ name: 'Read' }))).toBe('investigation');
    expect(nodeKindForTool(toolCall({ name: 'WebSearch', risk: 'read' }))).toBe('investigation');
  });
});

describe('WorkGraphBuilder.ingest — run lifecycle', () => {
  it('a user message opens an objective node; assistant messages do not', () => {
    const b = newBuilder();
    const res = startRun(b);
    expect(res.nodes).toHaveLength(1);
    expect(res.nodes[0].kind).toBe('objective');
    expect(res.nodes[0].runId).toBe(res.nodes[0].id);
    expect(res.nodes[0].status).toBe('running');

    // Assistant turns are prose, not structure.
    const assistant = b.ingest({
      kind: 'message-done',
      sessionId: 's1',
      message: userMessage({ id: 'm2', role: 'assistant', text: 'Working on it…' }),
    });
    expect(assistant.nodes).toHaveLength(0);
    expect(assistant.edges).toHaveLength(0);
  });

  it('consecutive runs chain via a `follows` edge', () => {
    const b = newBuilder();
    const first = startRun(b);
    const second = b.ingest({
      kind: 'message-done',
      sessionId: 's1',
      message: userMessage({ id: 'm2', text: 'Now the sidebar', createdAt: 2_000 }),
    });
    expect(second.nodes).toHaveLength(1);
    const follows = second.edges.find((e) => e.kind === 'follows');
    expect(follows).toBeDefined();
    expect(follows?.src).toBe(first.nodes[0].id);
    expect(follows?.dst).toBe(second.nodes[0].id);
  });

  it('tool calls within a run produce nodes bound to the run', () => {
    const b = newBuilder();
    const run = startRun(b);
    const started = b.ingest({
      kind: 'tool-start',
      sessionId: 's1',
      call: toolCall({ name: 'Read', risk: 'read' }),
    });
    expect(started.nodes).toHaveLength(1);
    expect(started.nodes[0].kind).toBe('investigation');
    // The structural run link is the node's `runId`, not an edge.
    expect(started.nodes[0].runId).toBe(run.nodes[0].id);
    expect(started.nodes[0].status).toBe('running');
  });

  it('a deferred permission gate is claimed and linked when its call arrives', () => {
    const b = newBuilder();
    startRun(b);
    b.addPermissionDecision('s1', { tool: 'Bash', summary: 'Run npm test', risk: 'command', decision: 'allow', auto: false, at: 1_500 });
    const started = b.ingest({
      kind: 'tool-start',
      sessionId: 's1',
      call: toolCall({ name: 'Bash', risk: 'command', summary: 'Run npm test' }),
    });
    // The gate fired BEFORE the tool node existed — onToolStart claims the
    // pending approval and links tool → approval via `reviewed-by`.
    const reviewed = started.edges.find((e) => e.kind === 'reviewed-by');
    expect(reviewed).toBeDefined();
    expect(reviewed?.src).toBe(started.nodes[0].id);
  });

  it('a file touched twice in one run is ONE node whose counts advance (idempotency)', () => {
    const b = newBuilder();
    startRun(b);
    b.ingest({
      kind: 'tool-start',
      sessionId: 's1',
      call: toolCall({ id: 'c1', name: 'Edit', risk: 'write' }),
    });
    const change = (path: string, adds: number): FileChange =>
      ({ path, status: 'edited', adds, dels: 0 }) as unknown as FileChange;
    b.ingest({ kind: 'file-change', sessionId: 's1', change: change('src/app.ts', 5) });
    const second = b.ingest({ kind: 'file-change', sessionId: 's1', change: change('src/app.ts', 9) });

    // The second event PATCHES the existing node rather than minting another.
    const fileNodes = second.nodes.filter((n) => n.kind === 'file');
    expect(fileNodes).toHaveLength(1);
  });
});

describe('WorkGraphBuilder — permission decisions', () => {
  const signal = (over: Partial<PermissionDecisionSignal> = {}): PermissionDecisionSignal => ({
    tool: 'Bash',
    summary: 'Run npm test',
    risk: 'command',
    decision: 'allow',
    auto: false,
    at: 1_500,
    ...over,
  });

  it('records a user approval as an approval node with the real decision', () => {
    const b = newBuilder();
    startRun(b);
    const res = b.addPermissionDecision('s1', signal({ decision: 'allow', auto: false }));
    expect(res.nodes).toHaveLength(1);
    expect(res.nodes[0].kind).toBe('approval');
    expect(res.nodes[0].status).toBe('done');
  });

  it('records every denial as a denied node', () => {
    const b = newBuilder();
    startRun(b);
    const res = b.addPermissionDecision('s1', signal({ decision: 'deny', auto: true }));
    expect(res.nodes).toHaveLength(1);
    expect(res.nodes[0].status).toBe('denied');
  });

  it('does NOT mint nodes for auto-approved calls (they have their own tool node)', () => {
    const b = newBuilder();
    startRun(b);
    const res = b.addPermissionDecision('s1', signal({ decision: 'allow', auto: true }));
    expect(res.nodes).toHaveLength(0);
    expect(res.edges).toHaveLength(0);
  });

  it('stands alone when no run is open (no runId → nothing recorded)', () => {
    const b = newBuilder();
    const res = b.addPermissionDecision('s1', signal({ decision: 'deny' }));
    expect(res.nodes).toHaveLength(0);
  });

  it('a deferred gate without a matching call still yields no node for auto-approvals', () => {
    const b = newBuilder();
    startRun(b);
    const res = b.addPermissionDecision('s1', { tool: 'Read', summary: 'Read file', risk: 'read', decision: 'allow', auto: true, at: 1_400 });
    expect(res.nodes).toHaveLength(0);
  });
});

describe('WorkGraphBuilder — derived edges + malformed events', () => {
  it('task ordering emits derived edges (depends-on, derived: true)', () => {
    const b = newBuilder();
    startRun(b);
    const res = b.ingest({
      kind: 'tasks',
      sessionId: 's1',
      tasks: [
        { id: 't1', label: 'First', done: true, status: 'completed' },
        { id: 't2', label: 'Second', done: false, status: 'in_progress' },
        { id: 't3', label: 'Third', done: false },
      ],
    });
    expect(res.nodes.filter((n) => n.kind === 'task')).toHaveLength(3);
    const derived = res.edges.filter((e) => e.derived);
    // TodoWrite re-sends the whole list: ordering is the only dependency
    // signal, and it is explicitly marked derived (t2→t1, t3→t2).
    expect(derived).toHaveLength(2);
    expect(derived.every((e) => e.kind === 'depends-on')).toBe(true);
  });

  it('a re-sent task list patches status instead of appending duplicates', () => {
    const b = newBuilder();
    startRun(b);
    b.ingest({
      kind: 'tasks',
      sessionId: 's1',
      tasks: [{ id: 't1', label: 'First', done: false, status: 'pending' }],
    });
    const res = b.ingest({
      kind: 'tasks',
      sessionId: 's1',
      tasks: [{ id: 't1', label: 'First', done: true, status: 'completed' }],
    });
    expect(res.nodes).toHaveLength(1);
    expect(res.nodes[0].status).toBe('done');
  });

  it('a malformed event never throws — it yields an empty result', () => {
    const b = newBuilder();
    // No run opened: tool events without state must not throw.
    const res = b.ingest({
      kind: 'tool-start',
      sessionId: 'ghost',
      call: toolCall({ sessionId: 'ghost' }),
    });
    expect(res.nodes).toHaveLength(0);
    expect(res.edges).toHaveLength(0);
  });
});
