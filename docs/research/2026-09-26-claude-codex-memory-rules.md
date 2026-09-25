# Memory Architectures, Rules Discovery, Context Compaction, and Execution Guardrails: Extraction and Synthesis from Anthropic Claude Code & OpenAI Codex CLI

**Author:** ZEUS Architecture & Core Engineering  
**Date:** 2026-09-26  
**Status:** Approved Technical Research / Architecture Reference  
**Tracking Ticket:** Ticket #68 (`mohmaedeslam00116/ZEUS`)  
**Target Subsystems:** `MemoryManager` (`zeus_memory`), `AgentManager`, `cursor/rules`, `harness`, Prompt Injection Pipeline  

---

## 1. Executive Summary & Comparative Matrix

Modern autonomous coding agents (Anthropic's Claude Code and OpenAI's Codex CLI) have converged on a layered, hybrid architecture to solve the fundamental tension of agentic coding: **balancing persistent project adherence and institutional memory against finite LLM context windows, latency costs, and execution safety.**

Neither system relies exclusively on a single monolithic system prompt or unconstrained conversation history. Instead, both implement:
1. **Multi-tier, hierarchical standing instructions** loaded from disk according to directory tree proximity and glob patterns.
2. **Dual-track memory** separating human-curated static constraints (`CLAUDE.md`, `AGENTS.md`) from machine-curated autonomous episodic notes (`~/.claude/projects/.../memory/MEMORY.md`, handoff states).
3. **Multi-phase context compaction** (microcompaction of tool results + macrocompaction into structured state) designed to maintain **prompt cache alignment**.
4. **Deterministic, out-of-band lifecycle hooks and execution policies** that wrap the probabilistic LLM in hard operating system and IPC boundaries.

### Comparative Architectural Matrix

| Dimension | Anthropic Claude Code | OpenAI Codex CLI | ZEUS (Current Reality) | ZEUS (Recommended Architecture) |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Project Instructions** | `CLAUDE.md` / `.claude/CLAUDE.md` | `AGENTS.md` (root & nested) | Reads `AGENTS.md` / `CLAUDE.md` via Cursor context rule or system preset | Unified Multi-Tier Discovery Engine supporting `AGENTS.md` + `CLAUDE.md` + `.zeus/rules/` |
| **Hierarchical Discovery** | User (`~/.claude`) → Project Root → Subdirectories (concatenated, closer files win) | User (`~/.codex`) → Project Root (`AGENTS.md`) → Subdirectories → `.override.md` | Single file lookups; generates temporary `.cursor/rules/zeus-context.mdc` | Directory walking upward from working file; concatenation with closest-file precedence |
| **Modular & Path-Scoped Rules** | `.claude/rules/*.md` with YAML frontmatter `paths: ["glob"]` | `AGENTS.md` with YAML frontmatter `applyTo: "glob"` | Standing cursor rule generation | First-class `.zeus/rules/*.md` and `.cursor/rules/*.mdc` with frontmatter glob matching |
| **Import Syntax** | `@import ./path/to/rule.md` in `CLAUDE.md` | External file references in Markdown | None | Recursive `@import` syntax with circular-reference guard |
| **Persistent Episodic Memory** | Auto-Memory in `~/.claude/projects/<proj>/memory/MEMORY.md` + topic files | Session rollouts in `~/.codex/sessions/` & handoff summaries | SQLite `memories` table (8 tiers) + FTS5 BM25 search | SQLite BM25 + Fast Index snapshot (`<project-memory>`) + topic markdown files |
| **Memory Consolidation** | "Auto Dream": 4-phase consolidation (24h + 5 sessions trigger) | Session compaction & handoff summary | Hourly `sweep()` (flags stale unpinned entries, never merges) | `zeus_memory` Auto Dream worker: LLM-driven deduplication, contradiction resolution, date normalization |
| **Memory Read/Write Tools** | Filesystem tools (`ReadFile`, `WriteFile`); `/memory` CLI command | Standard shell / file tools; `/compact` | Read-only MCP tools (`list_memories`, `search_memories`, `list_memory_proposals`) | Retain read-only for agent runs; add explicit `remember` / `propose_memory` tools for active self-recording |
| **Microcompaction** | Truncates bulky tool outputs (~60% context utilization); replaces with hashes | Inline output truncation | Ad-hoc trimming in tool handlers | Deterministic tool output compaction (<tool_result truncated="true" bytes="N">) |
| **Macrocompaction** | Auto-compaction at 80-95% context limit into structured working state | `model_auto_compact_token_limit` in `config.toml` | Truncation / rolling window | Structured `<working-state>` rehydration + `PreCompact` hook |
| **Prompt Cache Alignment** | 4 Ephemeral breakpoints; "Stable First, Volatile Last" | Prefix caching on static system prompt | Volatile timestamps currently placed inside early injected context | 4-tier strict prefix order: System → Rules → Durable Memory → Ephemeral Turns |
| **Execution Hooks & Guardrails** | Event-driven hooks (`PreToolUse`, `PostToolUse`, `PreCompact`, exit code 2 blocks) | `execpolicy` (`.codex/execpolicy.toml`) with prefix matching (`allow`/`prompt`/`forbidden`) | `SessionPermissionMode` (`ask`/`plan`/`apply`) + Cursor bridge permissions | Full lifecycle hook bus (`PreToolUse`, `PostToolUse`, `PreCompact`, `SessionStart`) with Exit 2 blocking |

---

## 2. Multi-Tier Instructions & Rules Discovery

Both Claude Code and Codex CLI recognize that monolithic configuration files fail in multi-service monorepos and enterprise repositories. They employ a deterministic filesystem resolution ladder.

### 2.1 Claude Code Rules Architecture

#### 1. Discovery Ladder & Precedence
Claude Code traverses the filesystem hierarchy from the global user profile down to the active working directory:
1. **User Global Scope:** `~/.claude/CLAUDE.md` — Personal preferences, default toolchains, coding style, user-specific tone.
2. **Project Root Scope:** `<git-root>/.claude/CLAUDE.md` or `<git-root>/CLAUDE.md` — Shared project architecture, CI commands, testing standards, conventions.
3. **Directory/Module Scope:** `<git-root>/path/to/subdir/CLAUDE.md` — Scoped module instructions (e.g., `apps/web/CLAUDE.md` vs `packages/core/CLAUDE.md`).

**Concatenation Semantics:** Unlike configuration systems where child objects deep-merge and overwrite parent keys, Claude Code **concatenates** discovered instruction files. Files closer to the active working directory appear later in the context block, giving them natural recency bias and prompt precedence over broader global defaults.

#### 2. Modular Path-Scoped Rules (`.claude/rules/*.md`)
Rather than forcing all team rules into a multi-thousand-line `CLAUDE.md`, Claude Code supports a dedicated rules directory:
```
<project-root>/
  └── .claude/
      ├── settings.json
      └── rules/
          ├── architecture.md
          ├── testing.md
          └── api-conventions.md
```

Each rule file supports YAML frontmatter defining glob patterns:
```markdown
---
paths:
  - "src/main/managers/**/*.ts"
  - "src/shared/**/*.ts"
---
# Core Manager Architecture Rules
- All manager mutations must go through parameterized transactions.
- Never import renderer modules into main process managers.
- Always observe tool invocations using observePlainTools().
```

**Evaluation Mechanism:** When the agent inspects, edits, or navigates files matching the glob pattern in `paths`, the rule content is dynamically pulled into the active context. Rules that do not match the current working set are excluded, preventing token bloat.

#### 3. `@import` Directive Syntax
Claude Code supports explicit modular composition inside `CLAUDE.md`:
```markdown
# Project Overview
Welcome to the ZEUS core orchestration platform.

@import ./docs/standards/security.md
@import ./docs/standards/testing.md
```
During context preparation, the CLI resolves the relative path, inlines the content, and deduplicates already imported files to prevent circular references.

#### 4. Auditability & Overrides
- **Auditing:** The `/memory` command lists all currently active instruction files, rules, and loaded scopes.
- **Exclusions:** `claudeMdExcludes` in `.claude/settings.local.json` allows developers to bypass specific rules or directories during local debugging.

---

### 2.2 OpenAI Codex CLI Rules Architecture

#### 1. Discovery Ladder & `AGENTS.md` Standard
The Codex CLI standardizes on `AGENTS.md`, an open ecosystem format:
1. **Global Instructions:** `~/.codex/instructions.md` (or `~/.codex/config.toml`).
2. **Repository Root:** `<git-root>/AGENTS.md`.
3. **Subdirectory Scopes:** `<git-root>/packages/*/AGENTS.md`.
4. **Local Overrides:** `AGENTS.override.md` (gitignored, machine-local overrides).

#### 2. Path Scoping & Scoped Execution
Similar to `.claude/rules/`, `AGENTS.md` files support YAML frontmatter:
```markdown
---
applyTo: "services/billing/**"
priority: high
---
## Billing Engine Safety Standards
- Never mock payment gateway responses in integration tests.
- All monetary calculations must use Decimal representation.
```

#### 3. Configuration & Fallbacks (`.codex/config.toml`)
The Codex CLI configuration governs instruction discovery behavior:
```toml
# .codex/config.toml
instructions_file = "AGENTS.md"
fallback_instructions = ["CLAUDE.md", "CONVENTIONS.md"]
trust_level = "trusted"

[model]
name = "gpt-5-codex"
model_context_window = 1000000
model_auto_compact_token_limit = 900000
```

---

### 2.3 Concrete TypeScript Engine for ZEUS Rule Discovery

Below is the concrete implementation pattern recommended for ZEUS to unify `CLAUDE.md`, `AGENTS.md`, and modular `.zeus/rules/*.md`:

```typescript
/**
 * src/main/managers/rules/RulesDiscoveryEngine.ts
 * Unified multi-tier instructions loader for ZEUS.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { minimatch } from 'minimatch';

export interface DiscoveredRule {
  sourcePath: string;
  scope: 'global' | 'workspace' | 'directory' | 'modular';
  pathsPattern?: string[];
  content: string;
  priority: number;
}

export class RulesDiscoveryEngine {
  private static readonly ROOT_CANDIDATES = ['AGENTS.md', 'CLAUDE.md', '.codex/instructions.md'];

  constructor(
    private readonly userHomeDir: string,
    private readonly workspaceRoot: string,
  ) {}

  /**
   * Resolve all applicable rules for a set of active/touched file paths.
   */
  async resolveActiveRules(activeFiles: string[] = []): Promise<DiscoveredRule[]> {
    const rules: DiscoveredRule[] = [];

    // 1. User Global Scope
    const userGlobal = await this.findFirstExisting(this.userHomeDir, [
      '.zeus/rules.md',
      '.claude/CLAUDE.md',
      '.codex/instructions.md',
    ]);
    if (userGlobal) {
      rules.push(await this.loadRuleFile(userGlobal, 'global', 10));
    }

    // 2. Workspace Root Scope
    for (const candidate of RulesDiscoveryEngine.ROOT_CANDIDATES) {
      const rootFile = path.join(this.workspaceRoot, candidate);
      if (await this.fileExists(rootFile)) {
        rules.push(await this.loadRuleFile(rootFile, 'workspace', 50));
        break; // First standard match wins root slot
      }
    }

    // 3. Modular Rules Directory (.zeus/rules/*.md or .claude/rules/*.md)
    const modularDirs = [
      path.join(this.workspaceRoot, '.zeus', 'rules'),
      path.join(this.workspaceRoot, '.claude', 'rules'),
    ];
    for (const mDir of modularDirs) {
      if (await this.dirExists(mDir)) {
        const entries = await fs.readdir(mDir);
        for (const entry of entries) {
          if (!entry.endsWith('.md') && !entry.endsWith('.mdc')) continue;
          const fullPath = path.join(mDir, entry);
          const rule = await this.loadRuleFile(fullPath, 'modular', 70);
          
          // Check if path pattern matches active files
          if (this.shouldIncludeModularRule(rule, activeFiles)) {
            rules.push(rule);
          }
        }
      }
    }

    // Sort by priority ascending (broader first, specific last for recency bias)
    return rules.sort((a, b) => a.priority - b.priority);
  }

  private async loadRuleFile(
    filePath: string,
    scope: DiscoveredRule['scope'],
    defaultPriority: number,
  ): Promise<DiscoveredRule> {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(raw);
    const content = await this.resolveImports(parsed.content.trim(), path.dirname(filePath), new Set([filePath]));
    
    const patterns: string[] = [];
    if (parsed.data.paths && Array.isArray(parsed.data.paths)) {
      patterns.push(...parsed.data.paths);
    } else if (parsed.data.applyTo) {
      patterns.push(parsed.data.applyTo);
    }

    return {
      sourcePath: filePath,
      scope,
      pathsPattern: patterns.length > 0 ? patterns : undefined,
      content,
      priority: parsed.data.priority ? Number(parsed.data.priority) : defaultPriority,
    };
  }

  private shouldIncludeModularRule(rule: DiscoveredRule, activeFiles: string[]): boolean {
    if (!rule.pathsPattern || rule.pathsPattern.length === 0) return true; // Always apply if no pattern
    if (activeFiles.length === 0) return true; // Standalone session start includes all baseline rules

    return activeFiles.some((file) => {
      const relPath = path.relative(this.workspaceRoot, file).replace(/\\/g, '/');
      return rule.pathsPattern!.some((pattern) => minimatch(relPath, pattern, { dot: true }));
    });
  }

  private async resolveImports(content: string, baseDir: string, visited: Set<string>): Promise<string> {
    const importRegex = /^@import\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    let resolvedContent = content;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = path.resolve(baseDir, match[1].trim());
      if (visited.has(importPath)) continue;
      visited.add(importPath);

      if (await this.fileExists(importPath)) {
        const importedText = await fs.readFile(importPath, 'utf-8');
        const nestedResolved = await this.resolveImports(importedText, path.dirname(importPath), visited);
        resolvedContent = resolvedContent.replace(match[0], nestedResolved);
      }
    }
    return resolvedContent;
  }

  private async fileExists(p: string): Promise<boolean> {
    try { return (await fs.stat(p)).isFile(); } catch { return false; }
  }
  private async dirExists(p: string): Promise<boolean> {
    try { return (await fs.stat(p)).isDirectory(); } catch { return false; }
  }
  private async findFirstExisting(dir: string, files: string[]): Promise<string | null> {
    for (const f of files) {
      const full = path.join(dir, f);
      if (await this.fileExists(full)) return full;
    }
    return null;
  }
}
```

---

## 3. Persistent Memory Architectures & Auto-Consolidation

### 3.1 Claude Code: Dual-Track Memory Model & Auto Dream

Claude Code enforces a clean separation of concerns between human instructions and machine memory:
1. **Manual / Static Knowledge (`CLAUDE.md`):** Human-authored rules, immutable conventions, architecture contracts.
2. **Autonomous / Dynamic Knowledge ("Auto Memory"):** Agent-authored discoveries, debugging lessons, edge cases, machine-specific configuration quirks.

#### Physical Storage Architecture
- **Location:** Stored on the local host at `~/.claude/projects/<project-slug>/memory/`.
- **Git Policy:** Intentionally **not** committed to VCS; this prevents noisy merge conflicts and prevents personal machine state from leaking into team branches.
- **Directory Structure:**
  ```
  ~/.claude/projects/<slug>/memory/
    ├── MEMORY.md               # Primary indexed memory (top 200 lines loaded on boot)
    ├── debugging-vitest.md      # Topic memory (loaded lazily on demand)
    ├── docker-workarounds.md   # Topic memory
    └── sessions.json           # Session telemetry and consolidation metadata
  ```

#### The `MEMORY.md` 200-Line Boot Cap
At the start of every session:
- Claude Code reads `MEMORY.md`.
- It loads **the first 200 lines (or 25 KB)** directly into the system context.
- Any notes beyond line 200 are silently ignored at boot time.
- **Architectural Design:** `MEMORY.md` is formatted as a compact index with markdown links or pointers to topic files. When the model encounters a relevant topic during a task, it invokes standard file-reading tools to load the detailed topic file.

#### The "Auto Dream" Background Consolidation Engine
Append-only memory systems rapidly degrade due to **memory rot** (contradictory notes, obsolete paths, temporal references like "yesterday"). Claude Code counters this with an autonomous consolidation cycle called **Auto Dream**:

```
┌────────────────────────────────────────────────────────┐
│               Auto Dream 4-Phase Cycle                 │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
  1. ORIENT          Scan existing MEMORY.md index & topic files
                           │
                           ▼
  2. GATHER SIGNAL   Search recent session transcripts & git diffs
                           │
                           ▼
  3. CONSOLIDATE     Merge new facts, resolve contradictions,
                     convert relative dates ("yesterday" → ISO)
                           │
                           ▼
  4. PRUNE & INDEX   Rebuild MEMORY.md under 200-line budget;
                     demote verbose text into topic files
```

- **Trigger Conditions:**
  1. `24+ hours` elapsed since last dream cycle.
  2. `≥ 5 sessions` completed since last dream cycle.
  3. Manual user command: `/memory dream` or `consolidate my memory files`.
- **Invariants:** Auto Dream operates strictly on memory files; it **never modifies project source code**.

---

### 3.2 OpenAI Codex CLI: Session Handoffs & Rollouts

OpenAI Codex CLI approaches memory through session rollouts and state handoffs:
- **Transcripts:** Full JSON execution traces saved in `~/.codex/sessions/<session_id>.json`.
- **Handoff Mechanism:** When migrating between contexts or restarting after milestone completion, the CLI prompts the model to generate a **structured handoff contract**:
  1. Primary task accomplished.
  2. Current working tree state (modified, added, deleted files).
  3. In-flight blockers or active test failures.
  4. Exact verification command to resume.
- **External Anchoring:** Codex CLI avoids memory bloat by encouraging persistence directly into repository documentation (e.g. `docs/adr/`, `TODO.md`, `specs/`).

---

### 3.3 Concrete Tool Schemas for ZEUS Memory Subsystem

To elevate ZEUS's `zeus_memory` from read-only inspection to proactive agentic memory, the following MCP schemas define the dual read/write memory contract:

```typescript
/**
 * src/main/managers/memory/zeusMemorySchemas.ts
 * Production MCP Tool Schemas for ZEUS Memory System.
 */

export const ZEUS_MEMORY_TOOL_SCHEMAS = {
  list_memories: {
    name: 'list_memories',
    description: "List stored Zeus memories (decisions, conventions, preferences, solutions).",
    inputSchema: {
      type: 'object',
      properties: {
        tier: {
          type: 'string',
          enum: ['session', 'workspace', 'project', 'preference', 'convention', 'decision', 'solution', 'note'],
          description: 'Filter by memory tier.',
        },
        query: { type: 'string', description: 'Optional keyword filter.' },
        limit: { type: 'number', description: 'Max entries to return (default: 50).' },
      },
    },
  },

  search_memories: {
    name: 'search_memories',
    description: "Full-text search (BM25) over durable project memories.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords or concept query.' },
        limit: { type: 'number', description: 'Max results (default: 20).' },
      },
      required: ['query'],
    },
  },

  store_memory: {
    name: 'store_memory',
    description: "Persist a durable architectural decision, convention, or debugging solution across sessions.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Concise summary title (under 120 chars).' },
        body: { type: 'string', description: 'Detailed knowledge, rationale, and reproduction steps.' },
        tier: {
          type: 'string',
          enum: ['decision', 'convention', 'solution', 'preference', 'note'],
          description: 'Authoritative tier for retrieval ranking.',
        },
        pinned: { type: 'boolean', description: 'If true, memory is immune to stale sweeping.' },
      },
      required: ['title', 'body', 'tier'],
    },
  },

  consolidate_memories: {
    name: 'consolidate_memories',
    description: "Trigger an Auto Dream consolidation cycle to merge duplicates and prune stale memories.",
    inputSchema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'Force consolidation even if threshold is not reached.' },
      },
    },
  },
} as const;
```

---

## 4. Context Compaction & Sliding Window Prompt Injection

### 4.1 Multi-Tier Compaction Strategy

Long-running agent sessions naturally accumulate thousands of tokens in command outputs, file diffs, and intermediate reasoning. Claude Code and Codex CLI prevent context saturation using a two-tier strategy:

```
┌────────────────────────────────────────────────────────┐
│                   Context Lifecycle                    │
└────────────────────────────────────────────────────────┘
  0% - 60% Capacity   ──► Normal execution, full tool output retained
  60% - 80% Capacity  ──► Microcompaction: tool results truncated & hashed
  80% - 95% Capacity  ──► Auto-compaction: full transcript summarized to <working-state>
  > 95% Capacity      ──► Hard limit / Emergency eviction
```

#### 1. Microcompaction (Tool Output Pruning)
Large shell outputs (`npm test`, build logs, full file reads) are the largest source of context degradation.
- **Rule:** If a tool output exceeds 2,000 characters and is older than 2 turns, the raw payload is evicted from the active context.
- **Replacement Format:**
  ```xml
  <tool_result name="Bash" status="success" original_bytes="65430" evicted="true">
  [Initial 20 lines...]
  ... [58,000 bytes pruned by Microcompaction. Output cached to disk at .zeus/cache/tool_out_89fa.log] ...
  [Trailing 20 lines...]
  </tool_result>
  ```
This reclaims up to 70% of conversation tokens without losing recent context or initial command invocations.

#### 2. Auto-Compaction & Structured Rehydration
When total token count crosses the auto-compaction threshold (default: 80% of window or `model_auto_compact_token_limit`):
1. **Freeze Execution:** Further tool execution is paused.
2. **Execute `PreCompact` Hook:** Deterministic external scripts snapshot in-flight state to disk.
3. **Generate State Summary:** The model is invoked with a specialized Compaction Prompt:
   ```markdown
   Summarize the session history into an executive handoff block:
   1. PRIMARY OBJECTIVE: Original user intent and scope.
   2. VERIFIED FACTS: Codebase truths confirmed by inspection.
   3. MUTATIONS APPLIED: Files created, edited, or deleted.
   4. PENDING ACTIONS: Exact next steps and failing test cases.
   Be extremely concise. Do not repeat raw tool logs.
   ```
4. **Rehydrate Clean Context:** The entire raw conversation history is replaced with:
   - System Prompt (preserved)
   - Multi-tier Rules (`CLAUDE.md` / `AGENTS.md`)
   - Durable Memory Block (`<project-memory>`)
   - `<working-state>` (the generated summary)
   - The most recent 2 user-assistant turns (unmodified)

---

### 4.2 Prompt Caching & Cache Breakpoint Alignment

Anthropic's prompt caching operates on **exact prefix matching**. If token $N$ changes, all cache entries from $N$ to the end of the request are invalidated.

Claude Code guarantees high cache hit rates (>90%) by strictly structuring the context prompt in **descending order of volatility**:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Static System Prompt & Tool Schemas       [Breakpoint 1: 🔒] │  Never changes
├─────────────────────────────────────────────────────────────────┤
│ 2. Multi-tier Project Rules (CLAUDE.md)      [Breakpoint 2: 🔒] │  Changes on git checkout
├─────────────────────────────────────────────────────────────────┤
│ 3. Persistent Memory Snapshot (<project-mem>) [Breakpoint 3: 🔒] │  Stable across session
├─────────────────────────────────────────────────────────────────┤
│ 4. Sliding Window Conversation History       [Breakpoint 4: ⚡] │  Slides every turn
└─────────────────────────────────────────────────────────────────┘
```

#### The Cache-Thrashing Anti-Pattern
Injecting volatile variables into early context blocks destroys prefix caching:
- ❌ **Anti-pattern:** Adding `Current Time: 2026-09-26 14:02:11` or dynamic turn counters inside the System Prompt or before `<project-memory>`. This causes 100% cache misses on every single turn, increasing latency by 4x and billing costs by 10x.
- ✅ **Best Practice:** Place all volatile runtime signals (timestamps, session IDs, in-flight diff status) **at the very end of the user turn message**, leaving the system and memory prefix 100% stable.

---

## 5. Guardrails & Lifecycle Execution Hooks

Prompt engineering alone is insufficient for security and process enforcement. Claude Code and Codex CLI rely on **deterministic lifecycle hooks** implemented at the OS process boundary.

### 5.1 Claude Code Lifecycle Hooks System

Claude Code provides an event bus configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "./scripts/check-env.sh" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "./scripts/guard-dangerous-bash.sh" }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "./scripts/guard-protected-files.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "npx prettier --write \"$CLAUDE_TOOL_INPUT_FILE_PATH\"" }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          { "type": "command", "command": "./scripts/backup-active-work.sh" }
        ]
      }
    ]
  }
}
```

#### Hook IPC Protocol & Exit Codes
Hooks run as subprocesses communicating via Unix streams and environment variables:
- **`stdin` Payload:** JSON document containing event context:
  ```json
  {
    "event": "PreToolUse",
    "sessionId": "ses_019283",
    "toolName": "Bash",
    "toolInput": { "command": "git reset --hard HEAD~1" },
    "workspaceRoot": "/path/to/project"
  }
  ```
- **Exit Code Semantics:**
  - **`0` (Allow):** Action proceeds normally. For `SessionStart` and `UserPromptSubmit`, text emitted on `stdout` is dynamically injected into the agent context.
  - **`1` (Warning):** Non-blocking warning. Output is logged, but tool execution proceeds.
  - **`2` (Blocking Abort):** **Hard block.** Tool execution is aborted immediately. The contents of `stderr`/`stdout` are passed back to the LLM as the tool result error, instructing the model why its attempt was denied so it can formulate an alternative approach.

---

### 5.2 OpenAI Codex CLI Execution Policies (`execpolicy`)

Codex CLI enforces commands through an `execpolicy` specification (`.codex/execpolicy.toml`):

```toml
# .codex/execpolicy.toml
version = 1

[[prefix_rule]]
prefix = ["git", "status"]
decision = "allow"

[[prefix_rule]]
prefix = ["git", "log"]
decision = "allow"

[[prefix_rule]]
prefix = ["npm", "test"]
decision = "allow"

[[prefix_rule]]
prefix = ["git", "push"]
decision = "forbidden"

[[prefix_rule]]
prefix = ["rm", "-rf"]
decision = "prompt"
```

- `allow`: Runs without human interruption.
- `prompt`: Halts and requests interactive console confirmation.
- `forbidden`: Terminated with immediate error returned to the agent.
- Verification CLI: `codex execpolicy check --rules .codex/execpolicy.toml -- git push origin main` returns the exact decision before execution.

---

## 6. Architectural Recommendations for ZEUS

To incorporate these best practices into the ZEUS platform, the following architectural upgrades are recommended:

### 6.1 Multi-Tier Rules Hierarchy Engine
1. **Implement `RulesDiscoveryEngine`:**
   - Scan `~/.zeus/rules/` (Global) → Workspace Root (`AGENTS.md` / `CLAUDE.md`) → Modular Rules (`.zeus/rules/*.md`, `.cursor/rules/*.mdc`).
   - Support YAML frontmatter `paths: [...]` to enable path-scoped rule activation based on touched files.
   - Implement `@import` parsing to allow modular documentation in `docs/standards/`.
2. **Deprecate Temporary File Hack in `rules.ts`:**
   - Replace the transient file write/delete dance in `.cursor/rules/zeus-context.mdc` with native session-scoped context injection.

### 6.2 `zeus_memory` Auto-Dream Consolidation Worker
1. **Extend `MemoryManager` with Auto-Dream Lifecycle:**
   - Upgrade the current hourly `sweep()` (which only marks stale flags) into a true consolidation pipeline.
   - Every 24 hours (or upon user request), invoke an offline or local LLM prompt to:
     - Merge redundant entries across `preference`, `convention`, and `decision` tiers.
     - Detect conflicting memories and prompt the user or demote low-confidence rows.
     - Convert relative temporal references ("yesterday", "recently") into absolute ISO timestamps.
2. **Add Agent Self-Recording Tools:**
   - Expose `store_memory` / `propose_memory` tools to the agent runtime so long-running subagents can record discovered solutions autonomously.

### 6.3 Prompt Pipeline Refactoring for Strict Cache Alignment
1. **Enforce 4-Tier Context Prefix in `AgentManager.ts`:**
   - Organize prompts strictly into:
     - Tier 1: Static System Preset + Base Tool Schemas (`cache_control: ephemeral`).
     - Tier 2: Discovered Standing Rules (`AGENTS.md` / `CLAUDE.md`).
     - Tier 3: Injected `<project-memory>` Snapshot (`cache_control: ephemeral`).
     - Tier 4: Sliding Conversation Turns.
   - Strip all volatile timestamps, turn IDs, and ephemeral session flags from Tiers 1-3. Place timestamps exclusively inside the latest user message block.
2. **Implement Microcompaction:**
   - Add automated tool result truncation in `AgentManager`: tool outputs exceeding 2,000 characters that are older than 2 turns are pruned and replaced with disk-backed cache references.
3. **Add `PreCompact` Lifecycle Hook:**
   - Before executing context compaction, emit a `PreCompact` event to allow subagents and logging managers to flush state cleanly.

### 6.4 Deterministic Execution Hooks Subsystem
1. **Standardize ZEUS Hooks Pipeline:**
   - Support `.zeus/hooks.json` matching the Claude Code schema (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`).
   - Implement the standard Unix Exit Code protocol (`0` = Allow, `2` = Block with feedback to agent).
   - Wire `PreToolUse` hooks directly into `AgentManager.makeCanUseTool` so policy enforcement is decoupled from the agent LLM.

---

## 7. References & Primary Sources

1. **Anthropic Claude Code Architecture & Documentation:**
   - Claude Code System Prompts & Tool Definitions (`ReadFile`, `WriteFile`, `Bash`, `GrepFiles`).
   - Claude Code Prompt Caching Guides: Ephemeral Cache Breakpoints & Prefix Matching Protocols.
   - Claude Code Auto-Memory Specification (`~/.claude/projects/<slug>/memory/MEMORY.md`).
   - Claude Code Lifecycle Hooks Reference: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`.
2. **OpenAI Codex CLI & AGENTS.md Ecosystem:**
   - OpenAI Codex CLI Configuration (`config.toml`, `instructions_file`, `model_auto_compact_token_limit`).
   - The Linux Foundation / Agentic AI `AGENTS.md` Open Specification.
   - OpenAI Codex Execution Policy (`execpolicy.toml`, prefix matching, sandboxing).
3. **ZEUS Architecture & Codebase Contracts:**
   - `CLAUDE.md` — Core technical contract and operational boundaries.
   - `CONTEXT.md` & Accepted Architecture Decision Records (`docs/adr/0001`–`0011`).
   - `docs/architecture/subsystems/memory-system.md` — Local Memory System specification.
   - `src/main/managers/memory/MemoryManager.ts` & `src/main/managers/memory/memoryTools.ts` — Existing memory subsystem.
   - `src/main/managers/cursor/rules.ts` & `src/main/managers/AgentManager.ts` — Context and prompt injection pipeline.
