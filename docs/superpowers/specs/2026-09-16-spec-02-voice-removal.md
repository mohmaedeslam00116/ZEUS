# Spec 2 — Voice Removal

- **Phase:** 1 (Infrastructure prerequisites, item 2)
- **Applicable ADR / decision:** Round-1/2 decision log — Voice removed from
  ZEUS scope (scoped decision; deliberately no ADR)
- **Status:** Draft for review — specification only

## Problem

Voice (local STT/TTS via sherpa-onnx) is out of ZEUS scope. Retaining it as
dead code contradicts the Round-1 requirement that voice must not influence
the ZEUS core architecture, adds a large native dependency
(`sherpa-onnx-node`, with `unbzip2-stream`/`tar-fs` used solely by voice
model download/extraction), keeps an entire settings category and IPC surface
alive, and complicates the upcoming TypeScript/Vitest work with unnecessary
type surface.

## Scope

Complete, one-shot removal of the Voice subsystem across all four Electron
surfaces, plus its unique dependencies and settings handling, as a single
dedicated cleanup change before feature work.

## Non-goals

- No replacement STT/TTS capability in v1.
- No feature flag or "dormant" retention.
- No rebrand/visual changes to the settings area beyond removing the Voice
  category entry.
- No changes to unrelated settings categories (bounds, migration machinery
  beyond what voice's removal requires).

## Current architecture (verified inventory)

- **Main:** `src/main/managers/voice/` — `VoiceManager.ts`,
  `VoiceModelManager.ts`, `segmenter.ts`, `unbzip2-stream.d.ts` (module-local
  ambient types). `VoiceModelManager` stores models under
  `userData/models/local-speech` and is the only consumer of
  `unbzip2-stream` + (alongside attachments) `tar-fs`.
- **Shared:** `src/shared/voice-models.ts`; `src/shared/ipc-channels.ts` —
  15 invoke channels (`voice:getState`, `voice:warm`, `voice:start/stop/cancel`,
  `voice:stopSpeaking`, `voice:speak`, `voice:models:list/download/pause/
  resume/cancel/remove/verify/reveal`) + push events (`voice:state`,
  `voice:transcript`, `voice:tts-chunk`, `voice:playback-cancel`,
  `voice:model-progress`, `voice:models-changed`) and `voiceAudioChunk`.
- **Preload:** `src/preload/index.ts` — 34 voice references; the `voice`
  namespace on `window.limboo`.
- **Renderer:** `App.tsx` (wiring), `components/ui/Waveform.tsx`,
  `features/settings/panels/VoicePanel.tsx`,
  `features/settings/VoiceModelCard.tsx`, `features/settings/catalog.tsx`
  (category entry), `features/workspace/Composer.tsx` (mic affordance),
  `features/workspace/ComposerVoiceOverlay.tsx`, `lib/commands.ts` (voice
  commands/shortcuts), `lib/voice/capture.ts`, `lib/voice/playback.ts`, and
  the voice slice store.
- **Dependencies:** `sherpa-onnx-node` (runtime), `unbzip2-stream` (runtime),
  `tar-fs` + `@types/tar-fs` (verified: consumed **only** by
  `VoiceModelManager` — attachments do not import it; all three are
  removable), and the voice-local ambient type shim in the voice folder.
- **Settings:** a voice settings category + keys handled by
  `SettingsManager.normalize` and `SETTINGS_VERSION` migrations (current
  `SETTINGS_VERSION = 30`).

## Applicable ADR / decision

Round-1 decision 8 / Round-2 final decision 7: Voice removed completely
before feature work; treat as scope decision, not a new ADR.

## Detailed behavior

1. Delete `src/main/managers/voice/` and `src/shared/voice-models.ts`.
2. Remove all voice channels from `IpcChannels`/`IpcEvents`; remove the
   preload `voice` namespace and its types; remove voice handler registration
   from `registerAllIpc()` and the composition root wiring in `index.ts`.
3. Remove renderer voice UI/commands/store; remove the Composer mic
   affordance and overlay; remove the Voice category from the settings
   catalog; remove `Waveform` if (and only if) it has no non-voice consumer.
4. Remove voice settings keys from `DEFAULT_SETTINGS`, clamps, and
   `normalize`; bump `SETTINGS_VERSION` with a migration entry that drops
   voice keys from persisted files (version bump + migration keeps old
   settings files loadable).
5. Remove `sherpa-onnx-node`, `unbzip2-stream`, `tar-fs`, and
   `@types/tar-fs` from package.json (all verified voice-only); run an
   install to regenerate the lockfile — **no other dependency changes
   permitted**.
6. Global grep gates: `voice`, `sherpa`, `stt`, `tts` return no functional
   code hits (documentation history is fine).

## Files/modules affected

As inventoried above; the spec's implementation must re-run the greps to
catch stragglers (e.g. stores, keyboard shortcuts, menu entries referencing
voice commands).

## Data/migration impact

- `SETTINGS_VERSION` bump (30 → 31): migration deletes voice keys from
  persisted settings. This is ZEUS's own internal migration — supported per
  the handoff's migration distinction.
- Downloaded voice models under `%APPDATA%/zeus/models/local-speech` (or the
  Limboo equivalent) are orphaned: add a one-time cleanup sweep in the boot
  orphan-sweep idiom, or document them as inert leftovers — implementation
  must choose one and record it.

## Security impact

- Attack surface *shrinks*: 15 invoke channels + 6 event channels and a
  native-media parsing dependency disappear. No new surface is added.
- Microphone permission posture unchanged (web permissions were already
  deny-by-default; voice used node-side capture).
- Preserve the existing prototype-pollution and clamp machinery during the
  settings migration edit.

## Windows-specific behavior

- `sherpa-onnx-node` ships native binaries — its removal simplifies Windows
  packaging (`@electron/rebuild`/asar-unpack surface). Verify
  `forge.config.ts` has no voice-specific unpack entries; remove if found.

## UI/UX impact

- Removal of the mic affordance in the Composer, the Voice settings category,
  and voice commands from the palette/shortcuts. These are *subtractions* of
  inherited Limboo UI, not new ZEUS UI decisions — no redesign is proposed.

## Impeccable review requirements

Not required: this spec removes inherited surfaces; it introduces no new or
changed UI/UX design decisions. (Per the AGENTS.md rule, any future
re-introduction of voice-adjacent UI would require Impeccable.)

## Verification plan

- `npm run lint` + renderer build (`npx vite build --config
  vite.renderer.config.mts`) + main/preload esbuild bundles — all green.
- Boot: app starts, composer renders, settings open with no Voice category;
  command palette has no voice commands.
- `grep -ri "sherpa\|voice" src/` returns no functional references.
- `npm ls sherpa-onnx-node` fails (gone from the tree); lockfile diff is
  limited to voice-related removals.

## Acceptance criteria

1. Zero voice code, channels, settings keys, or dependencies remain.
2. `SETTINGS_VERSION` migration loads a pre-removal settings file cleanly.
3. Build/lint pass; no orphaned imports or dead UI routes.
4. Lockfile diff contains only voice dependency removals.

## Dependencies

Sequenced after Spec 1 (storage identity) so the settings migration and boot
sweep run against the ZEUS root; before the TS-5 upgrade so the type surface
shrinks first.

## Known risks

- Hidden couplings (e.g. Composer state machine entangled with voice
  states) — mitigated by the inventory + grep gates; the Composer edit is the
  most delicate part.
- `tar-fs` sharing was a suspected risk and is now verified away: no other
  consumer exists, so removal cannot break attachments.
