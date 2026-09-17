/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Written by `npm run gen:notes` (scripts/gen-release-notes.mjs) from
 * CHANGELOG.md, which is the single source of truth for release notes: the same
 * text becomes the GitHub release body, the in-app release document, and the
 * changelog itself. Re-run the script after editing CHANGELOG.md.
 *
 * Contains the 5 most recent released sections.
 */

/** One release's notes, as authored in CHANGELOG.md. */
export interface ReleaseNotesEntry {
  /** Semantic version, without a leading `v`. */
  version: string;
  /** ISO release date, or null for a section written without one. */
  date: string | null;
  /** The section body as Markdown — headings and bullets, no version heading. */
  markdown: string;
}

/** Newest first. */
export const RELEASE_NOTES: ReleaseNotesEntry[] = [
  {
    version: '0.1.0-alpha.1',
    date: '2026-09-17',
    markdown: `The first ZEUS release: a Windows-only closed alpha for invited testers. ZEUS is a
local-first coding-agent desktop — a session shell that drives AI coding agents
(Claude Code, Cursor) against your workspaces, with git-integrated change review,
memory, tasks, an integrated terminal, and global search. Everything is stored
locally under \`%APPDATA%zeus\`; there is no backend and no telemetry.

### Scope

This alpha includes the complete ZEUS functional surface for local use:
multi-workspace session management (plain workspace sessions by default, explicit
git-worktree sessions), agent streaming under a three-layer permission model
(session deny rules, declarative approval, OS sandbox policy), MCP tool
integration (\`zeus_memory\`, \`zeus_search\`), checkpointing, runtime telemetry, and
packaged auto-update against this repository’s releases.

### Major user-visible changes

- ZEUS ships under its own identity: package \`zeus\`, app ID
  \`io.github.mohmaedeslam00116.zeus\`, display name \`ZEUS\` on every first-contact
  surface (installer, shortcuts, tray, window title), and an interim neutral
  geometric mark. No inherited branding remains.
- Functional namespaces are ZEUS-canonical: \`zeus.json\` worktree agent config,
  \`.zeus/\` state directories, \`zeus_memory\` / \`zeus_search\` MCP tools, and
  \`refs/zeus/checkpoints/*\`.
- The title-bar shortcut hint reads \`Ctrl P\` on Windows, and global-search state
  copy meets WCAG AA contrast.
- Fresh installs track the prerelease (beta) update channel so alpha testers
  receive every alpha build; every update still requires explicit consent and
  nothing auto-downloads.

### Known limitations

- Windows x64 only for this alpha.
- The build is **unsigned**: SmartScreen warns on first install (see below).
  Update integrity is enforced by sha512 digests in the update feed, not
  signatures.
- The end-to-end update path (alpha.1 → alpha.2) is verified at the alpha.2
  release by design; alpha.1 verifies the update configuration structurally.
- Accessibility and visual polish are pre-alpha quality in places; the full
  design pass is post-alpha.

### Installing (Windows, unsigned)

1. Download \`ZEUS-Setup-0.1.0-alpha.1-x64.exe\` from this release.
2. If SmartScreen appears, choose **More info** → **Run anyway** — expected for
   an unsigned build. To confirm integrity first, verify the SHA-256 checksum
   against \`SHA256SUMS\`.
3. The installer is per-user (no administrator rights required). Launch ZEUS from
   the Start Menu or the desktop shortcut.

### Feedback

Report everything on [GitHub Issues](https://github.com/mohmaedeslam00116/ZEUS/issues)
with the **alpha feedback** form (label \`alpha\`): bugs, UX feedback, confusion, and
data-handling concerns (treated as highest priority). Keep secrets, tokens,
credentials, and private source code out of logs, screenshots, and reports. Alpha
feedback improves the product but is not a support guarantee.`,
  },
];

/** The notes for one version, or null when this build does not carry them. */
export function releaseNotesFor(version: string): ReleaseNotesEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_NOTES.find((r) => r.version === wanted) ?? null;
}
