Unicode true
!define VERSION "${APPVER}"
Name "InkBeat"
OutFile "${OUTDIR}/InkBeat.exe"
Icon "inkbeat.ico"
SilentInstall silent
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "${APPVER}.0"
VIAddVersionKey "ProductName" "InkBeat"
VIAddVersionKey "FileDescription" "InkBeat"
VIAddVersionKey "FileVersion" "${APPVER}"
VIAddVersionKey "ProductVersion" "${APPVER}"
VIAddVersionKey "CompanyName" "InkBeat"
VIAddVersionKey "LegalCopyright" "InkBeat"

Section
  IfFileExists "$EXEDIR\runtime\installed.ok" run
  IfFileExists "$EXEDIR\runtime\pythonw.exe" run
  MessageBox MB_ICONEXCLAMATION|MB_OK "InkBeat встановлено не повністю. Запустіть інсталятор InkBeat ще раз — він довстановить потрібні компоненти."
  Quit
  run:
  SetOutPath "$EXEDIR"
  Exec '"$EXEDIR\runtime\pythonw.exe" "$EXEDIR\run.py" --auto-exit'
SectionEnd
