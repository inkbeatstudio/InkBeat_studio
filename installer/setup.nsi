Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "Sections.nsh"
!include "FileFunc.nsh"

Name "InkBeat"
Caption "Встановлення InkBeat ${APPVER}"
OutFile "${OUTDIR}/InkBeat-Setup-${APPVER}.exe"
InstallDir "$LOCALAPPDATA\Programs\InkBeat"
InstallDirRegKey HKCU "Software\InkBeat" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "InkBeat ${APPVER}"
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "${APPVER}.0"
VIAddVersionKey "ProductName" "InkBeat"
VIAddVersionKey "FileDescription" "Встановлення InkBeat"
VIAddVersionKey "FileVersion" "${APPVER}"
VIAddVersionKey "ProductVersion" "${APPVER}"
VIAddVersionKey "CompanyName" "InkBeat"
VIAddVersionKey "LegalCopyright" "InkBeat"

!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\InkBeat"
!define BG "0c0d11"
!define FG "e9ebf1"

!define MUI_ICON "inkbeat.ico"
!define MUI_UNICON "inkbeat.ico"
!define MUI_BGCOLOR "${BG}"
!define MUI_TEXTCOLOR "${FG}"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "header.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_INSTFILESPAGE_COLORS "${FG} ${BG}"
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Перервати встановлення InkBeat?"
!define MUI_COMPONENTSPAGE_NODESC

!define MUI_WELCOMEPAGE_TITLE "Встановлення InkBeat"
!define MUI_WELCOMEPAGE_TEXT "InkBeat розбирає пісню на редаговані доріжки й MIDI для FL Studio, а ще має вокальну студію, зведення й мастеринг.$\r$\n$\r$\nPython та інші програми встановлювати не потрібно — усе необхідне інсталятор завантажить сам у папку програми.$\r$\n$\r$\nПотрібне підключення до інтернету: буде завантажено приблизно 0,5 ГБ (з відеокартою NVIDIA — близько 3 ГБ). Це займе від кількох хвилин до пів години."
!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_SHOW DarkPage
!insertmacro MUI_PAGE_COMPONENTS
!define MUI_PAGE_CUSTOMFUNCTION_SHOW DarkPage
!define MUI_DIRECTORYPAGE_TEXT_TOP "InkBeat буде встановлено в цю папку. Права адміністратора не потрібні. Ваші проєкти зберігаються окремо — у «Документи\InkBeat Projects»."
!insertmacro MUI_PAGE_DIRECTORY
!define MUI_PAGE_CUSTOMFUNCTION_SHOW DarkPage
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "InkBeat готовий"
!define MUI_FINISHPAGE_TEXT "Програму встановлено. Ярлик InkBeat — на робочому столі та в меню «Пуск».$\r$\n$\r$\nПерший запуск може тривати до хвилини."
!define MUI_FINISHPAGE_RUN "$INSTDIR\InkBeat.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Запустити InkBeat"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.DarkPage
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Ukrainian"

Var LogFile

!macro DarkChildren ID
  FindWindow $0 "#32770" "" $HWNDPARENT
  SetCtlColors $0 ${FG} ${BG}
  StrCpy $1 0
  StrCpy $2 0
  loop_${ID}:
    FindWindow $1 "" "" $0 $1
    StrCmp $1 0 done_${ID}
    System::Call 'user32::GetClassName(p r1, t .r3, i 64)'
    ${If} $3 == "Static"
    ${OrIf} $3 == "Button"
      SetCtlColors $1 ${FG} ${BG}
    ${ElseIf} $3 == "Edit"
      SetCtlColors $1 ${FG} 1b1e26
    ${ElseIf} $3 == "SysListView32"
    ${OrIf} $3 == "SysTreeView32"
      SetCtlColors $1 ${FG} 14161b
    ${EndIf}
    IntOp $2 $2 + 1
    IntCmp $2 60 done_${ID}
    Goto loop_${ID}
  done_${ID}:
  StrCpy $1 0
!macroend

Function DarkPage
  !insertmacro DarkChildren a
FunctionEnd
Function un.DarkPage
  !insertmacro DarkChildren b
FunctionEnd

!macro Step NUM TOTAL TEXT NAME
  step_${NAME}:
  DetailPrint " "
  DetailPrint "Крок ${NUM} з ${TOTAL}: ${TEXT}"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer\bootstrap.ps1" -Step ${NAME} -Root "$INSTDIR" -Gpu $R9'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_ABORTRETRYIGNORE "Не вдалося виконати крок «${TEXT}».$\r$\n$\r$\nПеревірте підключення до інтернету і натисніть «Повторити». Подробиці — у списку над кнопками.$\r$\n$\r$\n«Пропустити» — продовжити без цього кроку (програма може працювати неповністю)." /SD IDABORT IDRETRY step_${NAME} IDIGNORE next_${NAME}
    Abort "Встановлення перервано на кроці «${TEXT}»."
  ${EndIf}
  next_${NAME}:
!macroend

Section "InkBeat (обов'язково)" SecMain
  SectionIn RO
  nsExec::Exec `powershell.exe -NoProfile -Command "Get-Process python,pythonw -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '$INSTDIR\runtime\*' } | Stop-Process -Force"`
  Pop $0
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\app"
  File /r "${PAYLOAD}/*"
  File "${OUTDIR}/InkBeat.exe"
  WriteUninstaller "$INSTDIR\Видалити InkBeat.exe"
  WriteRegStr HKCU "Software\InkBeat" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "InkBeat"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${APPVER}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "InkBeat"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\InkBeat.exe"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Видалити InkBeat.exe"'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNKEY}" "EstimatedSize" 1500000
  CreateDirectory "$SMPROGRAMS\InkBeat"
  CreateShortcut "$SMPROGRAMS\InkBeat\InkBeat.lnk" "$INSTDIR\InkBeat.exe" "" "$INSTDIR\InkBeat.exe" 0
  CreateShortcut "$SMPROGRAMS\InkBeat\Діагностика InkBeat.lnk" "$INSTDIR\Діагностика.bat" "" "$INSTDIR\InkBeat.exe" 0
  CreateShortcut "$SMPROGRAMS\InkBeat\Видалити InkBeat.lnk" "$INSTDIR\Видалити InkBeat.exe"
SectionEnd

Section "Прискорення відеокартою NVIDIA (якщо є)" SecGpu
SectionEnd

Section "Ярлик на робочому столі" SecDesk
  CreateShortcut "$DESKTOP\InkBeat.lnk" "$INSTDIR\InkBeat.exe" "" "$INSTDIR\InkBeat.exe" 0
SectionEnd

Section "-Компоненти" SecDeps
  StrCpy $R9 "cpu"
  ${If} ${SectionIsSelected} ${SecGpu}
    StrCpy $R9 "auto"
  ${EndIf}
  SetDetailsPrint both
  !insertmacro Step 1 8 "Перевіряю WebView2 (рушій вікна програми)" webview2
  !insertmacro Step 2 8 "Перевіряю бібліотеки Visual C++ (може з'явитися запит Windows)" vcredist
  !insertmacro Step 3 8 "Завантажую власний Python для InkBeat" python
  !insertmacro Step 4 8 "Готую встановлювач пакетів" pip
  !insertmacro Step 5 8 "Завантажую обчислювальний рушій (найбільший крок)" torch
  !insertmacro Step 6 8 "Встановлюю модулі аналізу звуку, вікна й VST" deps
  !insertmacro Step 7 8 "Завантажую модель розділення доріжок" model
  !insertmacro Step 8 8 "Перевіряю встановлення" verify
  DetailPrint " "
  DetailPrint "Готово."
SectionEnd

Function .onInit
  SetShellVarContext current
FunctionEnd

Section "Uninstall"
  nsExec::Exec `powershell.exe -NoProfile -Command "Get-Process python,pythonw -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '$INSTDIR\runtime\*' } | Stop-Process -Force"`
  Pop $0
  Delete "$DESKTOP\InkBeat.lnk"
  RMDir /r "$SMPROGRAMS\InkBeat"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "Software\InkBeat"
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Видалити також ваші проєкти, бібліотеку семплів і пресети (папка «Документи\InkBeat Projects»)?$\r$\n$\r$\nЯкщо ви не впевнені — натисніть «Ні»." /SD IDNO IDNO keep
    RMDir /r "$DOCUMENTS\InkBeat Projects"
    RMDir /r "$PROFILE\.inkbeat"
  keep:
SectionEnd
