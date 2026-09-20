; ZEUS — custom NSIS include, merged into electron-builder's well-tested NSIS
; script via the `nsis.include` option. Keep this minimal and additive: the base
; script already handles install/upgrade/uninstall, shortcuts, and the assisted
; multi-page wizard. We only layer on brand identity here.
;
; electron-builder invokes these named macros at the right points in its script.

; Branded run-after-finish prompt (shown on the final wizard page).
!define MUI_FINISHPAGE_RUN_TEXT "Launch ZEUS"

; Runs before any files/shortcuts are written. Older builds installed under the
; lowercase "limboo" identity (and under a Start-menu vendor subfolder while
; menuCategory was on) — those stale shortcuts are what made Start's "Recently
; added" launch an outdated, Electron-branded exe. Scrub them here so an
; upgrade always leaves exactly one root-level "ZEUS" identity.
;
; CRITICAL INVARIANT: NEVER DELETE ZEUS.lnk HERE!
; electron-builder's upgrade and silent-update logic relies on existing shortcuts
; surviving during an update ($keepShortcuts = "true"). If ZEUS.lnk is deleted
; in customInit, electron-builder skips recreating it and the app loses all shortcuts.
!macro customInit
  Delete "$SMPROGRAMS\limboo.lnk"
  Delete "$DESKTOP\limboo.lnk"
  RMDir /r "$SMPROGRAMS\limboo"
  RMDir /r "$SMPROGRAMS\Limboo"
!macroend

; Runs as part of the install section, after files are written.
!macro customInstall
  ; Safety net: recreate Start Menu and Desktop shortcuts if they were missing or wiped by earlier builds
  ${IfNot} ${FileExists} "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${EndIf}
  ${IfNot} ${FileExists} "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${EndIf}
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ; Record the install under a stable brand key so Windows + future upgrades and
  ; the Add/Remove Programs entry all resolve to one identity. AppUserModelID
  ; itself is set from electron-builder's appId (io.github.mohmaedeslam00116.zeus),
  ; which matches the runtime app.setAppUserModelId call (ADR-0009).
  WriteRegStr SHCTX "Software\Zeus" "InstallChannel" "stable"
  WriteRegStr SHCTX "Software\Zeus" "InstalledVersion" "${VERSION}"
!macroend

; Runs as part of the uninstall section. The user's workspaces, local database
; (zeus.db), memories, logs, and terminal history live under %APPDATA%\zeus
; and are intentionally LEFT IN PLACE (deleteAppDataOnUninstall: false) so a
; reinstall or upgrade keeps the developer's data. Only our brand key is removed.
!macro customUnInstall
  DeleteRegKey SHCTX "Software\Zeus"
!macroend
