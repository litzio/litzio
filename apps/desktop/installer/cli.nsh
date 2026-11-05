; This include is generated next to the bundled helper. Capture its build-time directory
; here, before macro expansion inside electron-builder's installer/uninstaller templates.
!define LITZIO_LIFECYCLE_SOURCE "${__FILEDIR__}\prepare-installation.cjs"
Var litzioRemovalLog

; Replace electron-builder's image-name kill path for BOTH setup and removal.
!macro customCheckAppRunning
  ${if} ${FileExists} "$INSTDIR\@EXECUTABLE@.exe"
    ; Always run our own payload: public beta.6 has no installed lifecycle helper.
    ; The installed exe supplies RunAsNode and remains the process identity target.
    InitPluginsDir
    File "/oname=$PLUGINSDIR\prepare-installation.cjs" "${LITZIO_LIFECYCLE_SOURCE}"
    GetTempFileName $6
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1") i.r0'
    nsExec::ExecToStack '"$INSTDIR\@EXECUTABLE@.exe" "$PLUGINSDIR\prepare-installation.cjs" --prepare-installation "$6"'
    Pop $0
    Pop $1
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", p 0) i.r2'
    ${if} $0 != 0
      ClearErrors
      FileOpen $7 "$6" r
      ${ifNot} ${Errors}
        FileReadUTF16LE $7 $1
        FileClose $7
      ${endif}
      Delete "$6"
      DetailPrint "@PRODUCT@ installation is in use: $0 $1"
      MessageBox MB_OK|MB_ICONEXCLAMATION "@PRODUCT@ installation cannot continue.$\r$\n$1$\r$\nClose Desktop and stop its CLI daemons, then try again." /SD IDOK
      SetErrorLevel 1
      Quit
    ${endif}
    Delete "$6"
    ClearErrors
  ${endif}
!macroend

!macro customUnInstall
  ; Silent one-click uninstall skips checkAppRunning in electron-builder; always gate deletion.
  !insertmacro customCheckAppRunning
  ; Updates replace the application tree, but preserve the external opt-in integration.
  ${ifNot} ${isUpdated}
    StrCpy $litzioRemovalLog ""
    GetTempFileName $6
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1") i.r0'
    ${if} ${FileExists} "$INSTDIR\resources\uninstall-cli.cjs"
      nsExec::ExecToStack '"$INSTDIR\@EXECUTABLE@.exe" "$INSTDIR\resources\uninstall-cli.cjs" --uninstall "$6"'
      Pop $0
      Pop $1
      ; A GUI RunAsNode process may not expose stderr to nsExec; use the helper's own report.
      ClearErrors
      FileOpen $7 "$6" r
      ${ifNot} ${Errors}
        FileReadUTF16LE $7 $1
        FileClose $7
      ${endif}
      ${if} $1 == ""
        StrCpy $1 "Cleanup helper did not report details: $INSTDIR\resources\uninstall-cli.cjs"
      ${endif}
    ${else}
      StrCpy $0 "missing helper"
      StrCpy $1 "Cleanup helper is missing: $INSTDIR\resources\uninstall-cli.cjs"
    ${endif}
    Delete "$6"
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", p 0) i.r2'
    ClearErrors
    ${if} $0 != 0
      ; Optional cleanup must not block application removal. Never delete untrusted files here.
      StrCpy $3 "@PRODUCT@ CLI cleanup incomplete. App removal will continue.$\r$\nRemaining files or PATH entry may be at: $LOCALAPPDATA\@CLI_FOLDER@\bin$\r$\nOpen Windows Environment Variables > User Path and remove only that bin entry. Inspect the bin files; preserve files whose ownership is uncertain.$\r$\nHelper result: $0$\r$\n$1"
      CreateDirectory "$LOCALAPPDATA\@CLI_FOLDER@\uninstall-logs"
      ClearErrors
      GetTempFileName $2 "$LOCALAPPDATA\@CLI_FOLDER@\uninstall-logs"
      ${if} ${Errors}
        GetTempFileName $2 "$TEMP"
      ${endif}
      ClearErrors
      FileOpen $4 "$2" w
      ${ifNot} ${Errors}
        FileWriteUTF16LE $4 "$3$\r$\n"
        FileClose $4
        StrCpy $litzioRemovalLog $2
        StrCpy $3 "$3$\r$\nDiagnostic: $2"
      ${else}
        StrCpy $3 "$3$\r$\nThe diagnostic file could not be written."
      ${endif}
      DetailPrint "$3"
      ; electron-builder sets Silent even for interactive one-click uninstall; inspect /S itself.
      ${GetParameters} $4
      ClearErrors
      ${GetOptions} $4 "/S" $5
      ${if} ${Errors}
        SetSilent normal
        MessageBox MB_OK|MB_ICONEXCLAMATION "$3"
        SetSilent silent
      ${endif}
      ClearErrors
    ${endif}
    ; electron-builder's RMDir ignores deletion errors. Remove the app image explicitly
    ; before its tree/registration removal, with at most 15 waits of 200ms (3 seconds).
    ; No /REBOOTOK: a remaining image is a failed removal, never a successful one.
    StrCpy $9 0
    ${Do}
      System::Call 'kernel32::DeleteFile(t "$INSTDIR\@EXECUTABLE@.exe") i.r0 ?e'
      Pop $1
      ${if} $0 != 0
        StrCpy $1 0
        ${if} ${FileExists} "$INSTDIR\@EXECUTABLE@.exe"
          ; DeleteFile can succeed while a delete-sharing handle still keeps it present.
          StrCpy $1 32
        ${endif}
      ${endif}
      ${if} $1 == 2
      ${orIf} $1 == 3
        ; Already absent is the same successful outcome.
        StrCpy $1 0
      ${endif}
      ${if} $1 == 0
        ${if} $9 > 0
          FileOpen $8 "$litzioRemovalLog" a
          FileWriteUTF16LE $8 "App executable deletion succeeded after $9 retries.$\r$\n"
          FileClose $8
          DetailPrint "App executable deletion succeeded after $9 retries."
        ${endif}
        ${ExitDo}
      ${endif}
      ${if} $litzioRemovalLog == ""
        CreateDirectory "$LOCALAPPDATA\@CLI_FOLDER@\uninstall-logs"
        ClearErrors
        GetTempFileName $litzioRemovalLog "$LOCALAPPDATA\@CLI_FOLDER@\uninstall-logs"
        ${if} ${Errors}
          GetTempFileName $litzioRemovalLog "$TEMP"
        ${endif}
      ${endif}
      IntOp $9 $9 + 1
      StrCpy $3 "App executable deletion attempt $9 failed: Win32 error $1; $INSTDIR\@EXECUTABLE@.exe"
      DetailPrint "$3"
      ClearErrors
      FileOpen $8 "$litzioRemovalLog" a
      ${ifNot} ${Errors}
        FileWriteUTF16LE $8 "$3$\r$\n"
        FileClose $8
      ${endif}
      ${if} $9 > 15
        StrCpy $3 "@PRODUCT@ removal failed: the app executable could not be deleted.$\r$\n$INSTDIR\@EXECUTABLE@.exe$\r$\nWin32 error $1. Close applications using it and try removal again.$\r$\nDiagnostic: $litzioRemovalLog"
        FileOpen $8 "$litzioRemovalLog" a
        FileWriteUTF16LE $8 "$3$\r$\n"
        FileClose $8
        DetailPrint "$3"
        MessageBox MB_OK|MB_ICONEXCLAMATION "$3" /SD IDOK
        SetErrorLevel 1
        Quit
      ${endif}
      Sleep 200
    ${Loop}
    ClearErrors
  ${endif}
!macroend
