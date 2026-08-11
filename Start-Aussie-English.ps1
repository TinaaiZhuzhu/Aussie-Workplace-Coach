$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectDirectory

$configPath = Join-Path $projectDirectory ".aussie-config.json"
$keyPath = Join-Path $projectDirectory ".openai-key.secure"
$savedConfig = if (Test-Path -LiteralPath $configPath) { Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json } else { $null }
$supabaseUrlInput = if ($savedConfig.supabaseUrl) { [string]$savedConfig.supabaseUrl } else { Read-Host "Supabase project URL" }
$supabaseKeyInput = if ($savedConfig.supabasePublishableKey) { [string]$savedConfig.supabasePublishableKey } else { Read-Host "Supabase publishable key" }
$allowedEmailInput = if ($savedConfig.allowedEmail) { [string]$savedConfig.allowedEmail } else { Read-Host "Your allowed sign-in email" }
$secureApiKey = if (Test-Path -LiteralPath $keyPath) { Get-Content -LiteralPath $keyPath | ConvertTo-SecureString } else { Read-Host "Paste your OpenAI API key (input is hidden)" -AsSecureString }
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiKey)

try {
    $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    $env:SUPABASE_URL = $supabaseUrlInput.TrimEnd('/')
    $env:SUPABASE_PUBLISHABLE_KEY = $supabaseKeyInput
    $env:ALLOWED_EMAILS = $allowedEmailInput.Trim().ToLowerInvariant()
    if (-not (Test-Path -LiteralPath $keyPath)) { $secureApiKey | ConvertFrom-SecureString | Set-Content -LiteralPath $keyPath -Encoding ascii }
    if (-not $savedConfig) { [pscustomobject]@{supabaseUrl=$env:SUPABASE_URL;supabasePublishableKey=$env:SUPABASE_PUBLISHABLE_KEY;allowedEmail=$env:ALLOWED_EMAILS} | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8 }
    if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
        throw "No API key was entered."
    }

    $bundledNode = "C:\Users\zz405\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue

    if ($nodeCommand) {
        $nodeExecutable = $nodeCommand.Source
    } elseif (Test-Path -LiteralPath $bundledNode) {
        $nodeExecutable = $bundledNode
    } else {
        throw "Node.js could not be found."
    }

    # Replace an older copy of this app that may still be holding port 3000.
    try {
        $existingHealth = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 2
        if ($existingHealth.ok) {
            $listener = netstat -ano | Select-String ':3000\s+.*LISTENING\s+(\d+)$' | Select-Object -First 1
            if ($listener) {
                $existingPid = [int]$listener.Matches[0].Groups[1].Value
                $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
                if ($existingProcess -and $existingProcess.ProcessName -eq 'node') {
                    Write-Host "Closing the previous Aussie English server..." -ForegroundColor Yellow
                    Stop-Process -Id $existingPid -Force
                    Start-Sleep -Milliseconds 500
                }
            }
        }
    } catch {
        # Nothing is listening, or port 3000 belongs to something other than this app.
    }

    Write-Host ""
    Write-Host "Starting Aussie Workplace English Coach..." -ForegroundColor Green
    Write-Host "Open http://localhost:3000 in your browser." -ForegroundColor Cyan
    Write-Host "Keep this window open. Press Ctrl+C to stop the site." -ForegroundColor Yellow
    Write-Host ""

    & $nodeExecutable "server.mjs"
}
finally {
    if ($keyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:SUPABASE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:ALLOWED_EMAILS -ErrorAction SilentlyContinue
}
