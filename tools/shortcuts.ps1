param([string]$Root)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
$pyw = Join-Path $Root '.venv\Scripts\pythonw.exe'
if (-not (Test-Path -LiteralPath $pyw)) { Write-Output 'NOVENV'; exit 1 }
$ico = Join-Path $Root 'app\ui\inkbeat.ico'
$run = Join-Path $Root 'run.py'
$ws = New-Object -ComObject WScript.Shell
$made = 0
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  if (-not $dir -or -not (Test-Path -LiteralPath $dir)) { continue }
  $lnk = $ws.CreateShortcut((Join-Path $dir 'InkBeat.lnk'))
  $lnk.TargetPath = $pyw
  $lnk.Arguments = '"' + $run + '" --auto-exit'
  $lnk.WorkingDirectory = $Root
  $lnk.IconLocation = $ico + ',0'
  $lnk.Description = 'InkBeat - song to FL Studio'
  $lnk.Save()
  $made++
}
Write-Output "OK $made"
