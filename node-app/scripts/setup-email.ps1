$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Bite & Brew - Email Sender Setup'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Write-Host 'Bite & Brew - Confirmation Email Setup' -ForegroundColor Cyan
Write-Host 'For Gmail: enable 2-Step Verification and create an App Password.'
Write-Host 'https://myaccount.google.com/apppasswords'
Write-Host 'Enter the password only here. It will not appear on screen or in chat.'
$taskSmtpHost = Read-Host 'SMTP host [smtp.gmail.com]'
if ([string]::IsNullOrWhiteSpace($taskSmtpHost)) { $taskSmtpHost = 'smtp.gmail.com' }
$taskSmtpPort = Read-Host 'SMTP port [587]'
if ([string]::IsNullOrWhiteSpace($taskSmtpPort)) { $taskSmtpPort = '587' }
$taskSmtpUser = Read-Host 'Sender email / SMTP username'
$taskSmtpFrom = Read-Host 'From email [press Enter to use the sender email]'
if ([string]::IsNullOrWhiteSpace($taskSmtpFrom)) { $taskSmtpFrom = $taskSmtpUser }
$taskPassword = Read-Host 'SMTP password (Gmail: App Password)' -AsSecureString
$taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskPassword)
try {
  $env:SMTP_HOST = $taskSmtpHost.Trim()
  $env:SMTP_PORT = $taskSmtpPort.Trim()
  $env:SMTP_SECURE = if ($taskSmtpPort.Trim() -eq '465') { 'true' } else { 'false' }
  $env:SMTP_USER = $taskSmtpUser.Trim()
  $env:SMTP_FROM = $taskSmtpFrom.Trim()
  $env:SMTP_PASS = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
  & node scripts/email-setup.js --save
  if ($LASTEXITCODE -eq 0) { Write-Host 'Sender configured. Return to Codex to restart the app.' -ForegroundColor Green }
  else { Write-Host 'Settings were not saved. Check the error above and retry the setup.' -ForegroundColor Yellow }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer)
  $env:SMTP_PASS = $null
  $taskPassword.Dispose()
}
Read-Host 'Press Enter to close this window'
