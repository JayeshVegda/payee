param(
  [string]$ProjectDirectory = (Split-Path -Parent $PSScriptRoot),
  [string]$TaskName = 'Payment Desk'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$startScript = Join-Path $ProjectDirectory 'scripts\start-production.ps1'
if (-not (Test-Path $startScript)) { throw "Could not find $startScript" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Days 1) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Starts the private Payment Desk server on localhost.' -Force | Out-Null
Write-Host "Scheduled task '$TaskName' created. It will start Payment Desk at user logon."
