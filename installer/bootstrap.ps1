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

function Get-File($url, $dest) {
  for ($i = 1; $i -le 3; $i++) {
    try {
      Write-Output "download: $url"
      Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
      if ((Get-Item -LiteralPath $dest).Length -gt 1000) { return }
    } catch {
      Write-Output "attempt $i failed: $($_.Exception.Message)"
      Start-Sleep -Seconds (3 * $i)
    }
  }
  throw "download failed: $url"
}

function Invoke-Py([string[]]$a, [switch]$Quiet) {
  $ErrorActionPreference = "Continue"
  if ($Quiet) { & $Py @a *> $null } else { & $Py @a 2>&1 | ForEach-Object { Write-Output "$_" } }
  $script:PyCode = $LASTEXITCODE
}

function Run-Py([string[]]$a) {
  Invoke-Py $a
  if ($script:PyCode -ne 0) { throw "python exited with code $($script:PyCode)" }
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
        try { $pv = (Get-ItemProperty -LiteralPath $k -ErrorAction Stop).pv; if ($pv -and $pv -ne "0.0.0.0") { $ok = $true; Write-Output "WebView2 $pv" } } catch {}
      }
      if (-not $ok) {
        $f = Join-Path $Tmp "MicrosoftEdgeWebview2Setup.exe"
        Get-File "https://go.microsoft.com/fwlink/p/?LinkId=2124703" $f
        $p = Start-Process -FilePath $f -ArgumentList "/silent", "/install" -Wait -PassThru
        Write-Output "WebView2 installer exit $($p.ExitCode)"
      }
    }
    "vcredist" {
      $ok = $false
      foreach ($k in @("HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64")) {
        try { $r = Get-ItemProperty -LiteralPath $k -ErrorAction Stop; if ($r.Installed -eq 1 -and $r.Major -ge 14 -and $r.Minor -ge 30) { $ok = $true; Write-Output "VC++ $($r.Version)" } } catch {}
      }
      if (-not $ok) {
        $f = Join-Path $Tmp "vc_redist.x64.exe"
        Get-File "https://aka.ms/vs/17/release/vc_redist.x64.exe" $f
        $p = Start-Process -FilePath $f -ArgumentList "/install", "/quiet", "/norestart" -Verb RunAs -Wait -PassThru
        Write-Output "VC++ installer exit $($p.ExitCode)"
        if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010 -and $p.ExitCode -ne 1638) { throw "VC++ runtime install failed: $($p.ExitCode)" }
      }
    }
    "python" {
      if ((Test-Path -LiteralPath $Py) -and (Test-Path -LiteralPath (Join-Path $Rt "python311.zip"))) { Write-Output "python already present"; break }
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
    }
    "torch" {
      $gpu = Has-Nvidia
      Invoke-Py @("-c", "import sys, torch, torchaudio; sys.exit(0 if (torch.version.cuda or not $([int]$gpu)) else 3)") -Quiet
      if ($script:PyCode -eq 0) { Run-Py @("-c", "import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())"); break }
      if ($gpu) {
        Write-Output "NVIDIA GPU found: installing CUDA build"
        Invoke-Py @("-m", "pip", "install", "--no-warn-script-location", "torch==$TorchVer+cu124", "torchaudio==$TorchVer+cu124", "--index-url", "https://download.pytorch.org/whl/cu124")
        if ($script:PyCode -ne 0) {
          Write-Output "CUDA build failed, falling back to CPU build"
          Run-Py @("-m", "pip", "install", "--no-warn-script-location", "torch==$TorchVer+cpu", "torchaudio==$TorchVer+cpu", "--index-url", "https://download.pytorch.org/whl/cpu")
        }
      } else {
        Write-Output "no NVIDIA GPU: installing CPU build"
        Run-Py @("-m", "pip", "install", "--no-warn-script-location", "torch==$TorchVer+cpu", "torchaudio==$TorchVer+cpu", "--index-url", "https://download.pytorch.org/whl/cpu")
      }
    }
    "deps" {
      $req = Join-Path $Root "requirements.txt"
      $hashFile = Join-Path $Rt "requirements.sha256"
      $h = (Get-FileHash -LiteralPath $req -Algorithm SHA256).Hash
      if ((Test-Path -LiteralPath $hashFile) -and ((Get-Content -LiteralPath $hashFile -Raw).Trim() -eq $h)) { Write-Output "dependencies up to date"; break }
      Run-Py @("-m", "pip", "install", "--no-warn-script-location", "-r", $req)
      Set-Content -LiteralPath $hashFile -Encoding ASCII -Value $h
    }
    "model" {
      Push-Location $Root
      try { Run-Py @("-c", "from demucs.pretrained import get_model; get_model('htdemucs_6s'); print('model OK')") } finally { Pop-Location }
    }
    "verify" {
      Push-Location $Root
      try {
        Run-Py @("-c", "import numpy, scipy, librosa, soundfile, flask, onnxruntime, mido, torch, demucs, webview; print('all modules OK'); print('cuda', torch.cuda.is_available())")
      } finally { Pop-Location }
      Set-Content -LiteralPath (Join-Path $Rt "installed.ok") -Encoding ASCII -Value (Get-Date -Format s)
    }
    default { throw "unknown step $Step" }
  }
  exit 0
} catch {
  Write-Output "ERROR: $($_.Exception.Message)"
  exit 1
}
