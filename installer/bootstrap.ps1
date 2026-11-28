param(
  [Parameter(Mandatory = $true)][string]$Step,
  [Parameter(Mandatory = $true)][string]$Root,
  [string]$Gpu = "auto"
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Root = (Resolve-Path -LiteralPath $Root).Path
$Rt = Join-Path $Root "runtime"
$Py = Join-Path $Rt "python.exe"
$Tmp = Join-Path $env:TEMP "inkbeat_setup"
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null
$PyVer = "3.11.9"
$TorchVer = "2.6.0"
$script:PyCode = 0
$LogFile = Join-Path $Root "install.log"
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:PIP_DISABLE_PIP_VERSION_CHECK = "1"
$env:PIP_NO_CACHE_DIR = "1"
$env:PIP_DEFAULT_TIMEOUT = "120"
$env:PIP_RETRIES = "10"
$env:PIP_NO_WARN_SCRIPT_LOCATION = "1"
$PipTmp = Join-Path $Root "runtime_tmp"

function Say([string]$m) {
  Write-Output $m
  try { Add-Content -LiteralPath $LogFile -Value $m -Encoding UTF8 } catch {}
}

function Get-File($url, $dest) {
  for ($i = 1; $i -le 3; $i++) {
    try {
      Say "download: $url"
      Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
      if ((Get-Item -LiteralPath $dest).Length -gt 1000) { return }
    } catch {
      Say "attempt $i failed: $($_.Exception.Message)"
      Start-Sleep -Seconds (3 * $i)
    }
  }
  throw "download failed: $url"
}

function Invoke-Py([string[]]$a, [switch]$Quiet) {
  $ErrorActionPreference = "Continue"
  New-Item -ItemType Directory -Force -Path $PipTmp | Out-Null
  $env:TMP = $PipTmp
  $env:TEMP = $PipTmp
  if ($Quiet) { & $Py @a *> $null } else { & $Py @a 2>&1 | ForEach-Object { Say "$_" } }
  $script:PyCode = $LASTEXITCODE
}

function Run-Py([string[]]$a) {
  Invoke-Py $a
  if ($script:PyCode -ne 0) { throw "python exited with code $($script:PyCode)" }
}

$Uv = Join-Path $Rt "uv.exe"

function Pip-Install([string[]]$a) {
  if (Test-Path -LiteralPath $Uv) {
    $ErrorActionPreference = "Continue"
    New-Item -ItemType Directory -Force -Path $PipTmp | Out-Null
    $env:TMP = $PipTmp
    $env:TEMP = $PipTmp
    $env:UV_CACHE_DIR = Join-Path $PipTmp "uv-cache"
    & $Uv pip install --python $Py @a 2>&1 | ForEach-Object { Say "$_" }
    if ($LASTEXITCODE -eq 0) { return }
    Say "fast installer failed (code $LASTEXITCODE), using pip"
  }
  Run-Py (@("-m", "pip", "install", "--no-warn-script-location") + $a)
}

function Has-Nvidia {
  if ($Gpu -eq "cpu") { return $false }
  try {
    $smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
    if ($smi) { $ErrorActionPreference = "Continue"; & nvidia-smi -L *> $null; if ($LASTEXITCODE -eq 0) { return $true } }
  } catch {}
  $p = Join-Path $env:SystemRoot "System32\nvidia-smi.exe"
  if (Test-Path -LiteralPath $p) { return $true }
  try {
    $v = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match "NVIDIA" }
    if ($v) { return $true }
  } catch {}
  return $false
}

Say ""
Say "=== step $Step  $(Get-Date -Format s)  gpu=$Gpu"
try {
  $drive = (Get-Item -LiteralPath $Root).PSDrive
  if ($drive) { Say ("free disk: {0:N1} GB" -f ($drive.Free / 1GB)) }
} catch {}
try {
  switch ($Step) {
    "webview2" {
      $keys = @(
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
      )
      $ok = $false
      foreach ($k in $keys) {
        if ($ok) { break }
        try { $pv = (Get-ItemProperty -LiteralPath $k -ErrorAction Stop).pv; if ($pv -and $pv -ne "0.0.0.0") { $ok = $true; Say "WebView2 $pv" } } catch {}
      }
      if (-not $ok) {
        $f = Join-Path $Tmp "MicrosoftEdgeWebview2Setup.exe"
        Get-File "https://go.microsoft.com/fwlink/p/?LinkId=2124703" $f
        $p = Start-Process -FilePath $f -ArgumentList "/silent", "/install" -Wait -PassThru
        Say "WebView2 installer exit $($p.ExitCode)"
      }
    }
    "vcredist" {
      $ok = $false
      foreach ($k in @("HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64")) {
        try { $r = Get-ItemProperty -LiteralPath $k -ErrorAction Stop; if ($r.Installed -eq 1 -and $r.Major -ge 14 -and $r.Minor -ge 30) { $ok = $true; Say "VC++ $($r.Version)" } } catch {}
      }
      if (-not $ok) {
        $f = Join-Path $Tmp "vc_redist.x64.exe"
        Get-File "https://aka.ms/vs/17/release/vc_redist.x64.exe" $f
        $p = Start-Process -FilePath $f -ArgumentList "/install", "/quiet", "/norestart" -Verb RunAs -Wait -PassThru
        Say "VC++ installer exit $($p.ExitCode)"
        if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010 -and $p.ExitCode -ne 1638) { throw "VC++ runtime install failed: $($p.ExitCode)" }
      }
    }
    "python" {
      if ((Test-Path -LiteralPath $Py) -and (Test-Path -LiteralPath (Join-Path $Rt "python311.zip"))) { Say "python already present"; break }
      if (Test-Path -LiteralPath $Rt) { Remove-Item -LiteralPath $Rt -Recurse -Force }
      New-Item -ItemType Directory -Force -Path $Rt | Out-Null
      $z = Join-Path $Tmp "python-embed.zip"
      Get-File "https://www.python.org/ftp/python/$PyVer/python-$PyVer-embed-amd64.zip" $z
      Expand-Archive -LiteralPath $z -DestinationPath $Rt -Force
      $pth = Join-Path $Rt "python311._pth"
      Set-Content -LiteralPath $pth -Encoding ASCII -Value @("python311.zip", ".", "Lib\site-packages", "..", "import site")
      New-Item -ItemType Directory -Force -Path (Join-Path $Rt "Lib\site-packages") | Out-Null
      Run-Py @("-c", "import sys; print(sys.version)")
    }
    "pip" {
      Invoke-Py @("-m", "pip", "--version") -Quiet
      if ($script:PyCode -ne 0) {
        $g = Join-Path $Tmp "get-pip.py"
        Get-File "https://bootstrap.pypa.io/get-pip.py" $g
        Run-Py @($g, "--no-warn-script-location")
      }
      Run-Py @("-m", "pip", "install", "--upgrade", "--no-warn-script-location", "pip", "setuptools", "wheel")
      if (-not (Test-Path -LiteralPath $Uv)) {
        try {
          $uz = Join-Path $Tmp "uv.zip"
          Get-File "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip" $uz
          $ud = Join-Path $Tmp "uv"
          if (Test-Path -LiteralPath $ud) { Remove-Item -LiteralPath $ud -Recurse -Force }
          Expand-Archive -LiteralPath $uz -DestinationPath $ud -Force
          $found = Get-ChildItem -LiteralPath $ud -Recurse -Filter "uv.exe" | Select-Object -First 1
          if ($found) { Copy-Item -LiteralPath $found.FullName -Destination $Uv -Force; Say "fast installer ready" }
        } catch { Say "fast installer unavailable: $($_.Exception.Message)" }
      }
    }
    "torch" {
      $gpu = $false
      foreach ($x in @(Has-Nvidia)) { if ("$x" -eq "True") { $gpu = $true } }
      $want = "0"
      if ($gpu) { $want = "1" }
      Say "NVIDIA detected: $gpu"
      Invoke-Py @("-c", "import sys, torch, torchaudio; sys.exit(0 if (torch.version.cuda or not $want) else 3)") -Quiet
      if ($script:PyCode -eq 0) {
        Run-Py @("-c", "import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())")
        Invoke-Py @("-c", "import demucs") -Quiet
        if ($script:PyCode -ne 0) { Pip-Install @("demucs==4.0.1") }
        break
      }
      if ($gpu) {
        Say "NVIDIA GPU found: installing CUDA build"
        try { Pip-Install @("torch==$TorchVer+cu124", "torchaudio==$TorchVer+cu124", "--index-url", "https://download.pytorch.org/whl/cu124") }
        catch {
          Say "CUDA build failed, falling back to CPU build"
          Pip-Install @("torch==$TorchVer+cpu", "torchaudio==$TorchVer+cpu", "--index-url", "https://download.pytorch.org/whl/cpu")
        }
      } else {
        Say "no NVIDIA GPU: installing CPU build"
        Pip-Install @("torch==$TorchVer+cpu", "torchaudio==$TorchVer+cpu", "--index-url", "https://download.pytorch.org/whl/cpu")
      }
      Pip-Install @("demucs==4.0.1")
    }
    "deps" {
      $req = Join-Path $Root "requirements.txt"
      $hashFile = Join-Path $Rt "requirements.sha256"
      $h = (Get-FileHash -LiteralPath $req -Algorithm SHA256).Hash
      if ((Test-Path -LiteralPath $hashFile) -and ((Get-Content -LiteralPath $hashFile -Raw).Trim() -eq $h)) { Say "dependencies up to date"; break }
      Pip-Install @("-r", $req)
      Set-Content -LiteralPath $hashFile -Encoding ASCII -Value $h
    }
    "model" {
      Push-Location $Root
      try { Run-Py @("-c", "from demucs.pretrained import get_model; get_model('htdemucs_6s'); print('model OK')") } finally { Pop-Location }
    }
    "verify" {
      if (Test-Path -LiteralPath $PipTmp) { Remove-Item -LiteralPath $PipTmp -Recurse -Force -ErrorAction SilentlyContinue }
      Push-Location $Root
      try {
        Run-Py @("-c", "import numpy, scipy, librosa, soundfile, flask, onnxruntime, mido, webview; print('core modules OK')")
        Invoke-Py @("-c", "import torch, demucs; print('separation module OK, cuda', torch.cuda.is_available())")
        if ($script:PyCode -ne 0) { Say "separation module not installed yet: the app will offer it" }
        Run-Py @("-c", "import numpy as np, librosa; from app import server; y = (np.random.randn(22050 * 4) * 0.1).astype('float32'); librosa.beat.beat_track(y=y, sr=22050); librosa.pyin(y[:44100], fmin=80, fmax=800, sr=22050); print('warm-up OK')")
      } finally { Pop-Location }
      Set-Content -LiteralPath (Join-Path $Rt "installed.ok") -Encoding ASCII -Value (Get-Date -Format s)
    }
    default { throw "unknown step $Step" }
  }
  exit 0
} catch {
  Say "ERROR: $($_.Exception.Message)"
  try {
    $desk = [Environment]::GetFolderPath("Desktop")
    if ($desk) { Copy-Item -LiteralPath $LogFile -Destination (Join-Path $desk "InkBeat - install log.txt") -Force }
  } catch {}
  exit 1
}
