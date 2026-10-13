# v8 stage 4: MSIX install test on a clean Windows machine (GitHub windows-latest runner, see .github/workflows/msix.yml).
# install -> run -> safety-manager scenario -> encrypted backup -> quit -> uninstall (data removed) -> reinstall -> restore.
# Writes install-test.json to -Out. Paths in the record are written relative to %LOCALAPPDATA% / %TEMP%, never as user folders.
# ASCII only: Windows PowerShell 5.1 reads scripts in the system code page.
param(
  [Parameter(Mandatory = $true)][string]$Msix,
  [Parameter(Mandatory = $true)][string]$Cer,
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = "Stop"
$name = "SHELaw.Beta.LocalTest"
$repo = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force $Out | Out-Null
$backup = Join-Path $Out "backup.json"

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$record = [ordered]@{
  format = "she-msix-install-test-v8"
  startedAt = (Get-Date).ToUniversalTime().ToString("o")
  environment = [ordered]@{ os = [Environment]::OSVersion.Version.ToString(); image = "$env:ImageOS $env:ImageVersion"; runnerIsAdmin = $admin }
  steps = [ordered]@{}
  timings = [ordered]@{}
  scenario = [ordered]@{}
  notes = @()
}
function Clean([string]$s) {
  foreach ($p in @($env:LOCALAPPDATA, $env:TEMP, $env:USERPROFILE, $env:RUNNER_TEMP)) { if ($p) { $s = $s.Replace($p, "%" + "PATH%") } }
  return ($s -replace '(?i)[a-z]:\\Users\\[^\\\s]+', 'C:\Users\<user>')
}
function Step([string]$step, [scriptblock]$body) {
  try { $ok = [bool](& $body) } catch { $ok = $false; $script:record.notes += ($step + ": " + (Clean $_.Exception.Message)) }
  $script:record.steps[$step] = $ok
  Write-Output ("step " + $step + " = " + $ok)
}
function Pkg { Get-AppxPackage -Name $name }
function DataRoot { Join-Path $env:LOCALAPPDATA ("Packages\" + (Pkg).PackageFamilyName) }
function AppProcesses([string]$exe) {
  $loc = (Pkg).InstallLocation
  @(Get-CimInstance Win32_Process -Filter ("Name='" + $exe + "'") | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($loc, [StringComparison]::OrdinalIgnoreCase) })
}
function Launch { Start-Process ("shell:AppsFolder\" + (Pkg).PackageFamilyName + "!App") }
function WaitPort([int]$seconds) {
  $file = Join-Path (DataRoot) "LocalState\launch.json"
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $seconds) {
    if (Test-Path $file) { $p = (Get-Content $file -Raw | ConvertFrom-Json).port; if ($p) { return [int]$p } }
    Start-Sleep -Milliseconds 500
  }
  throw "launch.json did not appear in $seconds s"
}
function WaitGone([int]$seconds) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $seconds) {
    if (@(AppProcesses "node.exe").Count -eq 0 -and @(AppProcesses "SHELaw.exe").Count -eq 0) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}
function Scenario([string[]]$scenarioArgs) {
  $outText = & node (Join-Path $repo "scripts\msix-scenario-v8.mjs") @scenarioArgs
  if ($LASTEXITCODE -ne 0) { throw ("scenario failed (exit " + $LASTEXITCODE + ")") }
  return (($outText | Where-Object { $_ -is [string] -and $_.StartsWith("{") } | Select-Object -Last 1) | ConvertFrom-Json)
}

# Test-only trust of the self-signed test certificate (Store packages are signed by the Store and need no such step).
Import-Certificate -FilePath $Cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null

Step "installed" { Add-AppxPackage -Path $Msix; $p = Pkg; $script:record.package = [ordered]@{ fullName = $p.PackageFullName; signatureKind = "$($p.SignatureKind)"; installedForUser = $true }; $p -ne $null }
$port = 0
Step "launched" {
  $sw = [Diagnostics.Stopwatch]::StartNew(); Launch; $script:port = WaitPort 900
  $script:record.timings.firstStartSeconds = [math]::Round($sw.Elapsed.TotalSeconds, 1); $script:port -gt 0
}
Step "consoleHidden" {
  $all = @(Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith((Pkg).InstallLocation, [StringComparison]::OrdinalIgnoreCase) })
  $script:record.processes = @($all | ForEach-Object { $_.ProcessName } | Sort-Object)
  ($all.Count -ge 2) -and (@($all | Where-Object { $_.MainWindowHandle -ne 0 }).Count -eq 0)
}
Step "scenario" {
  $r = Scenario @("before", "--port", "$port", "--backup", $backup)
  foreach ($k in $r.PSObject.Properties.Name) { $script:record.scenario[$k] = $r.$k }
  $r.safetyManagerCandidate -eq $true
}
Step "backupExported" { (Test-Path $backup) -and ((Get-Item $backup).Length -gt 0) }
Step "singleInstance" {
  Launch; Start-Sleep -Seconds 15
  $again = WaitPort 30
  $launchers = @(AppProcesses "SHELaw.exe").Count; $servers = @(AppProcesses "node.exe").Count
  $script:record.singleInstanceDetail = [ordered]@{ launchersAt15s = $launchers; servers = $servers; samePort = ($again -eq $port) }
  if ($launchers -ne 1) { Start-Sleep -Seconds 45; $launchers = @(AppProcesses "SHELaw.exe").Count; $script:record.singleInstanceDetail.launchersAt60s = $launchers }
  ($launchers -eq 1) -and ($servers -eq 1) -and ($again -eq $port)
}
Step "appQuitStopsServer" { Scenario @("quit", "--port", "$port") | Out-Null; WaitGone 30 }
Step "launcherStopStopsServer" {
  Remove-Item (Join-Path (DataRoot) "LocalState\launch.json") -ErrorAction SilentlyContinue
  $sw = [Diagnostics.Stopwatch]::StartNew(); Launch; $p2 = WaitPort 900
  $script:record.timings.secondStartSeconds = [math]::Round($sw.Elapsed.TotalSeconds, 1)
  Get-Process SHELaw | Where-Object { $_.Path.StartsWith((Pkg).InstallLocation, [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force
  WaitGone 20
}
$dataRoot = DataRoot
Step "uninstalled" { Remove-AppxPackage -Package (Pkg).PackageFullName; (Pkg) -eq $null }
Step "dataRemovedOnUninstall" {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ((Test-Path $dataRoot) -and $sw.Elapsed.TotalSeconds -lt 60) { Start-Sleep -Seconds 1 }
  -not (Test-Path $dataRoot)
}
Step "reinstalled" { Add-AppxPackage -Path $Msix; Launch; $script:port = WaitPort 900; $script:port -gt 0 }
Step "restoredAfterReinstall" {
  $r = Scenario @("after", "--port", "$port", "--backup", $backup, "--review", $record.scenario.reviewId)
  $script:record.restore = $r.restore
  ($r.freshInstallEmpty -eq $true) -and ($r.reviewRestored -eq $true)
}
try { Scenario @("quit", "--port", "$port") | Out-Null; WaitGone 30 | Out-Null } catch { }
try { Remove-AppxPackage -Package (Pkg).PackageFullName } catch { }

# Best effort: the same install as a throwaway standard (non-administrator) Windows user, through a scheduled task.
# Recorded separately; the runner account itself is an administrator.
$record.nonAdmin = [ordered]@{ attempted = $true }
try {
  $shared = "C:\SHETest"; New-Item -ItemType Directory -Force $shared | Out-Null
  Copy-Item $Msix (Join-Path $shared "app.msix")
  & icacls $shared /grant "*S-1-5-32-545:(OI)(CI)M" | Out-Null
  $pw = [guid]::NewGuid().ToString("N") + "aA1!"
  $user = "shetest" + (Get-Random -Maximum 9999)
  New-LocalUser -Name $user -Password (ConvertTo-SecureString $pw -AsPlainText -Force) -AccountNeverExpires | Out-Null
  $cmd = "try { Add-AppxPackage -Path 'C:\SHETest\app.msix'; `$p = Get-AppxPackage -Name '$name'; 'installed=' + [bool]`$p + ' admin=' + ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) | Out-File C:\SHETest\nonadmin.txt; if (`$p) { Remove-AppxPackage -Package `$p.PackageFullName } } catch { 'error=' + `$_.Exception.Message | Out-File C:\SHETest\nonadmin.txt }"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd))
  # Standard users lack the batch-logon right a password scheduled task needs; grant it to this throwaway account (CI machine only).
  $sid = (Get-LocalUser -Name $user).SID.Value
  $inf = Join-Path $shared "rights.inf"; $db = Join-Path $shared "rights.sdb"
  & secedit /export /cfg $inf /areas USER_RIGHTS | Out-Null
  $lines = Get-Content $inf
  if ($lines -match '^SeBatchLogonRight') { $lines = $lines -replace '^(SeBatchLogonRight\s*=.*)$', ('$1,*' + $sid) }
  else { $lines = $lines -replace '^\[Privilege Rights\]$', ("[Privilege Rights]`r`nSeBatchLogonRight = *" + $sid) }
  Set-Content -Path $inf -Value $lines -Encoding Unicode
  & secedit /configure /db $db /cfg $inf /areas USER_RIGHTS | Out-Null
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ("-NoProfile -NonInteractive -EncodedCommand " + $encoded) -WorkingDirectory $shared
  Register-ScheduledTask -TaskName "SHETestNonAdmin" -Action $action -User $user -Password $pw -RunLevel Limited | Out-Null
  Start-ScheduledTask -TaskName "SHETestNonAdmin"
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while (-not (Test-Path "C:\SHETest\nonadmin.txt") -and $sw.Elapsed.TotalSeconds -lt 300) { Start-Sleep -Seconds 2 }
  $info = Get-ScheduledTaskInfo -TaskName "SHETestNonAdmin"
  $record.nonAdmin.taskLastResult = "0x{0:X}" -f $info.LastTaskResult
  $record.nonAdmin.result = if (Test-Path "C:\SHETest\nonadmin.txt") { Clean ((Get-Content "C:\SHETest\nonadmin.txt" -Raw).Trim()) } else { "no result in 300 s" }
  Unregister-ScheduledTask -TaskName "SHETestNonAdmin" -Confirm:$false
} catch { $record.nonAdmin.result = "attempt failed: " + (Clean $_.Exception.Message) }

$record.finishedAt = (Get-Date).ToUniversalTime().ToString("o")
$record.passed = -not ($record.steps.Values -contains $false)
[IO.File]::WriteAllText((Join-Path $Out "install-test.json"), ($record | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
Remove-Item $backup -ErrorAction SilentlyContinue
if (-not $record.passed) { Write-Output "install test failed"; exit 1 }
Write-Output "install test passed"
