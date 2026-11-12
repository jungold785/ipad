<#
.SYNOPSIS
  Deploys the Desk dashboard to GitHub Pages in one go.

.DESCRIPTION
  Handles the whole first-time setup:
    1. finds a usable network path (direct or through a local proxy)
    2. signs in to GitHub (opens the browser for the device code)
    3. prepares the repository (safe.directory, main branch, identity)
    4. commits the working tree
    5. creates the public repository if it does not exist
    6. enables GitHub Pages with the Actions workflow as the source
    7. pushes and triggers a deployment

  Safe to run more than once.

.PARAMETER ProxyUrl
  Proxy to use for GitHub, for example http://127.0.0.1:51081.
  When omitted, a local proxy is detected automatically.

.PARAMETER NoProxy
  Ignore local proxies and connect directly.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 -ProxyUrl http://127.0.0.1:7890
#>

param(
  [string]$ProxyUrl = '',
  [switch]$NoProxy
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$Owner = 'jungold785'
$Name = 'ipad'
$Slug = "$Owner/$Name"

function Write-Step { param([string]$Message) Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "    $Message" -ForegroundColor Green }
function Write-Note { param([string]$Message) Write-Host "    $Message" -ForegroundColor Yellow }

# Runs a native executable and captures its exit code and output instead of
# letting Windows PowerShell turn native stderr into a terminating error.
function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @()
  )
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $FilePath @Arguments 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  return [PSCustomObject]@{ ExitCode = $code; Output = @($output) }
}

function Show-Output {
  param($Output)
  $Output | ForEach-Object { Write-Host $_ }
}

# ------------------------------------------------------------------ network
function Test-TcpPort {
  # Note: the parameter must not be called $Host, that name is reserved.
  param([string]$Server, [int]$Port, [int]$TimeoutMs = 3000)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($Server, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs)) { return $false }
    $client.EndConnect($async)
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

# True when the endpoint speaks the HTTP CONNECT proxy protocol.
function Test-ProxyConnect {
  param([string]$ProxyHost, [int]$ProxyPort, [string]$TargetHost = 'github.com', [int]$TargetPort = 443)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($ProxyHost, $ProxyPort, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(2500)) { return $false }
    $stream = $client.GetStream()
    $stream.ReadTimeout = 4000
    $request = "CONNECT $TargetHost`:$TargetPort HTTP/1.1`r`nHost: $TargetHost`:$TargetPort`r`nProxy-Connection: close`r`n`r`n"
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($request)
    $stream.Write($bytes, 0, $bytes.Length)
    $buffer = New-Object byte[] 256
    $read = $stream.Read($buffer, 0, 256)
    if ($read -le 0) { return $false }
    $response = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $read)
    return ($response -match '^HTTP/1\.[01]\s+200')
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

# Every local endpoint worth probing, system proxy settings first.
function Get-ProxyCandidates {
  $list = New-Object System.Collections.Generic.List[string]

  $settings = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
  if ($settings -and $settings.ProxyEnable -eq 1 -and $settings.ProxyServer) {
    foreach ($entry in ($settings.ProxyServer -split ';')) {
      $value = $entry
      if ($entry -match '=') { $value = ($entry -split '=', 2)[1] }
      $value = $value.Trim() -replace '^[a-z]+://', ''
      if ($value -match '^(?<host>[^:/]+):(?<port>\d+)$') {
        $list.Add(('{0}:{1}' -f $Matches.host, $Matches.port))
      }
    }
  }

  $skip = @(135, 139, 445, 5040, 5357, 8000, 11434)
  foreach ($line in (netstat -ano 2>$null)) {
    if ($line -match '^\s*TCP\s+(?<addr>\S+):(?<port>\d+)\s+\S+\s+LISTENING') {
      $addr = $Matches.addr
      $port = [int]$Matches.port
      if ($skip -contains $port) { continue }
      if ($port -ge 49600 -and $port -le 49700) { continue }
      if ($addr -eq '127.0.0.1' -or $addr -eq '0.0.0.0' -or $addr -eq '[::]') {
        $list.Add("127.0.0.1:$port")
      }
    }
  }

  return $list
}

Write-Step 'Checking the network path'

$Proxy = ''
if ($NoProxy) {
  Write-Ok 'Proxies are disabled by request.'
} elseif ($ProxyUrl) {
  $Proxy = $ProxyUrl
  Write-Ok "Using the proxy $Proxy."
} else {
  foreach ($candidate in (Get-ProxyCandidates)) {
    $pieces = $candidate -split ':'
    if (Test-ProxyConnect -ProxyHost $pieces[0] -ProxyPort ([int]$pieces[1])) {
      $Proxy = "http://$candidate"
      break
    }
  }
  if ($Proxy) {
    Write-Ok "Found a local proxy at $Proxy."
  } else {
    if (Test-TcpPort -Server 'github.com' -Port 443) {
      Write-Ok 'No local proxy found; connecting directly.'
    } else {
      Write-Note 'No local proxy found and github.com is not reachable directly.'
      Write-Note 'Start your proxy app, or pass -ProxyUrl http://127.0.0.1:<port>.'
    }
  }
}

if ($Proxy) {
  $env:HTTP_PROXY = $Proxy
  $env:HTTPS_PROXY = $Proxy
  $env:http_proxy = $Proxy
  $env:https_proxy = $Proxy
}

# Never let git block on an interactive username/password prompt: when the
# credential helper is not in place the push has to fail fast instead of
# hanging the whole deployment.
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'

# ---------------------------------------------------------------- 1. gh CLI
Write-Step 'Checking the GitHub CLI'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Note 'gh was not found. Install it with:'
  Write-Note '  winget install --id GitHub.cli'
  exit 1
}

$auth = Invoke-Native -FilePath gh -Arguments @('auth', 'status')
if ($auth.ExitCode -ne 0) {
  Write-Note 'Not signed in. Opening the browser for device login...'
  # Streamed live on purpose: the device code has to be visible while it waits.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & gh auth login -h github.com --web --git-protocol https -s workflow
    $loginCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($loginCode -ne 0) {
    Write-Note 'Sign in failed. Run "gh auth login -h github.com" and try again.'
    exit 1
  }
}
Write-Ok 'Signed in.'

# The default device-login token carries repo/read:org/gist only. Without the
# workflow scope GitHub refuses any push that creates or changes a file under
# .github/workflows, so the deployment workflow could never be delivered.
$status = Invoke-Native -FilePath gh -Arguments @('auth', 'status')
$scopeLine = ''
foreach ($line in $status.Output) {
  if ($line -match 'Token scopes') { $scopeLine = [string]$line }
}
if ($scopeLine -notmatch 'workflow') {
  Write-Note 'The token is missing the "workflow" scope; requesting it now.'
  Write-Note 'Approve the request in the browser that opens.'
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & gh auth refresh -h github.com -s workflow
    $refreshCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($refreshCode -ne 0) {
    Write-Note 'Could not add the workflow scope.'
    Write-Note 'Run "gh auth refresh -h github.com -s workflow" and try again.'
    exit 1
  }
  Write-Ok 'The workflow scope was added.'
} else {
  Write-Ok 'The token already has the workflow scope.'
}

Invoke-Native -FilePath gh -Arguments @('auth', 'setup-git') | Out-Null

# -------------------------------------------------------------- 2. prepare
Write-Step 'Preparing the git repository'

if (-not (Test-Path (Join-Path $RepoRoot '.git'))) {
  Write-Note 'No repository found; initialising one.'
  Invoke-Native -FilePath git -Arguments @('init', '-b', 'main') | Out-Null
}

# The repository may have been created by the Codex sandbox account, and git
# then refuses to work on it for your account ("dubious ownership").
$RepoPath = ((Resolve-Path $RepoRoot).Path -replace '\\', '/')
$safe = Invoke-Native -FilePath git -Arguments @('config', '--global', '--get-all', 'safe.directory')
if ($safe.ExitCode -ne 0 -or $safe.Output -notcontains $RepoPath) {
  Invoke-Native -FilePath git -Arguments @('config', '--global', '--add', 'safe.directory', $RepoPath) | Out-Null
  Write-Ok 'Registered the repository as a safe directory.'
}

# Export it for this session so every git call below is covered as well.
$env:GIT_CONFIG_COUNT = '1'
$env:GIT_CONFIG_KEY_0 = 'safe.directory'
$env:GIT_CONFIG_VALUE_0 = $RepoPath

if ($Proxy) {
  # Repository-local, so it never leaks into other projects.
  Invoke-Native -FilePath git -Arguments @('config', 'http.proxy', $Proxy) | Out-Null
  Invoke-Native -FilePath git -Arguments @('config', 'http.version', 'HTTP/1.1') | Out-Null
  Invoke-Native -FilePath git -Arguments @('config', 'http.lowSpeedLimit', '0') | Out-Null
  Invoke-Native -FilePath git -Arguments @('config', 'http.lowSpeedTime', '999999') | Out-Null
  Write-Ok 'Pointed git at the proxy.'
}

$head = Invoke-Native -FilePath git -Arguments @('symbolic-ref', '--short', 'HEAD')
$branch = ''
if ($head.ExitCode -eq 0 -and $head.Output.Count -gt 0) { $branch = [string]$head.Output[0] }
if ($branch -ne 'main') {
  $hasCommit = (Invoke-Native -FilePath git -Arguments @('rev-parse', '--verify', '--quiet', 'HEAD')).ExitCode -eq 0
  if ($hasCommit) {
    Invoke-Native -FilePath git -Arguments @('branch', '-M', 'main') | Out-Null
  } else {
    Invoke-Native -FilePath git -Arguments @('symbolic-ref', 'HEAD', 'refs/heads/main') | Out-Null
  }
  Write-Ok 'Switched the branch to main.'
}

if ((Invoke-Native -FilePath git -Arguments @('config', '--get', 'user.name')).ExitCode -ne 0) {
  Invoke-Native -FilePath git -Arguments @('config', 'user.name', '29658237@qq.com') | Out-Null
  Write-Ok 'Set the git user.name.'
}
if ((Invoke-Native -FilePath git -Arguments @('config', '--get', 'user.email')).ExitCode -ne 0) {
  Invoke-Native -FilePath git -Arguments @('config', 'user.email', '29658237@qq.com') | Out-Null
  Write-Ok 'Set the git user.email.'
}

# --------------------------------------------------------------- 3. commit
Write-Step 'Rebuilding the photo manifest'

$manifest = Invoke-Native -FilePath node -Arguments @('scripts/build-photo-manifest.mjs')
if ($manifest.ExitCode -eq 0) {
  Write-Ok ($manifest.Output -join ' ')
} else {
  Write-Note 'Could not rebuild the photo manifest; CI rebuilds it anyway.'
}

Write-Step 'Committing the working tree'

$add = Invoke-Native -FilePath git -Arguments @('add', '-A')
if ($add.ExitCode -ne 0) {
  Show-Output $add.Output
  Write-Note '"git add" failed. If this is a permission error, run:'
  Write-Note "  takeown /f `"$RepoRoot\.git`" /r /d y"
  Write-Note "  icacls `"$RepoRoot\.git`" /grant `"$env:USERNAME`:(OI)(CI)F`" /t"
  exit 1
}

$diff = Invoke-Native -FilePath git -Arguments @('diff', '--cached', '--quiet')
if ($diff.ExitCode -eq 1) {
  $commit = Invoke-Native -FilePath git -Arguments @('commit', '-m', 'feat(dashboard): update iPad desk-widget dashboard')
  Show-Output $commit.Output
  if ($commit.ExitCode -ne 0) {
    Write-Note 'The commit failed.'
    exit 1
  }
  Write-Ok 'Committed.'
} elseif ($diff.ExitCode -gt 1) {
  Write-Note 'Could not inspect the staged changes.'
  exit 1
} else {
  Write-Ok 'Nothing to commit.'
}

# ---------------------------------------------------------------- 4. repo
Write-Step 'Preparing the repository'

$repo = Invoke-Native -FilePath gh -Arguments @('repo', 'view', $Slug)
if ($repo.ExitCode -ne 0) {
  $create = Invoke-Native -FilePath gh -Arguments @('repo', 'create', $Slug, '--public', '--source=.', '--remote=origin')
  Show-Output $create.Output
  if ($create.ExitCode -ne 0) {
    Write-Note "Could not create $Slug."
    exit 1
  }
  Write-Ok "Created $Slug"
} else {
  Write-Ok "$Slug already exists."
}

# Make sure origin points at the repository, whatever gh did above.
$OriginUrl = "https://github.com/$Slug.git"
$remotes = @(Invoke-Native -FilePath git -Arguments @('remote')).Output
if ($remotes -notcontains 'origin') {
  Invoke-Native -FilePath git -Arguments @('remote', 'add', 'origin', $OriginUrl) | Out-Null
  Write-Ok 'Added the origin remote.'
} else {
  $current = [string](Invoke-Native -FilePath git -Arguments @('remote', 'get-url', 'origin')).Output[0]
  if ($current -ne $OriginUrl) {
    Invoke-Native -FilePath git -Arguments @('remote', 'set-url', 'origin', $OriginUrl) | Out-Null
    Write-Ok 'Updated the origin URL.'
  }
}

# --------------------------------------------------------------- 5. Pages
Write-Step 'Enabling GitHub Pages'

$pages = Invoke-Native -FilePath gh -Arguments @('api', "repos/$Slug/pages")
if ($pages.ExitCode -ne 0) {
  $enable = Invoke-Native -FilePath gh -Arguments @('api', '--method', 'POST', "repos/$Slug/pages", '-f', 'build_type=workflow')
  Show-Output $enable.Output
  if ($enable.ExitCode -ne 0) {
    Write-Note 'Could not enable Pages automatically.'
    Write-Note "Enable it manually: Settings > Pages > Source: GitHub Actions"
  } else {
    Write-Ok 'Pages enabled with the Actions workflow as the source.'
  }
} else {
  Write-Ok 'Pages is already enabled.'
}

# ---------------------------------------------------------------- 6. push
Write-Step 'Pushing to GitHub'

$pushed = $false
for ($attempt = 1; $attempt -le 3; $attempt++) {
  $push = Invoke-Native -FilePath git -Arguments @('push', '-u', 'origin', 'main')
  Show-Output $push.Output
  if ($push.ExitCode -eq 0) {
    $pushed = $true
    break
  }
  if ($attempt -lt 3) {
    Write-Note "The push was interrupted (attempt $attempt of 3). Retrying in 5 seconds..."
    Start-Sleep -Seconds 5
  }
}

if (-not $pushed) {
  Write-Note 'The git channel keeps getting reset; falling back to the GitHub API.'
  $fallback = Join-Path $PSScriptRoot 'push-via-api.ps1'
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $fallback
    $fallbackCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($fallbackCode -ne 0) {
    Write-Note 'The API upload failed as well.'
    Write-Note "Try: git config --global http.proxy $Proxy"
    Write-Note 'or run this script again with -ProxyUrl pointing at your proxy.'
    exit 1
  }
  Write-Ok 'Published through the API.'

  # The API writes its own commit, so the local branch now differs from the
  # remote one. Realign when the git channel allows it.
  $fetch = Invoke-Native -FilePath git -Arguments @('fetch', 'origin', 'main')
  if ($fetch.ExitCode -eq 0) {
    Invoke-Native -FilePath git -Arguments @('reset', '--hard', 'origin/main') | Out-Null
    Write-Ok 'Realigned the local branch with the remote.'
  } else {
    Write-Note 'The local branch still differs from the remote.'
    Write-Note 'Run "git fetch origin && git reset --hard origin/main" once the connection recovers.'
  }
} else {
  Write-Ok 'Pushed.'
}

Write-Step 'Triggering the first deployment'

Start-Sleep -Seconds 5
$run = Invoke-Native -FilePath gh -Arguments @('workflow', 'run', 'pages.yml', '--repo', $Slug)
if ($run.ExitCode -eq 0) {
  Write-Ok 'Deployment queued.'
} else {
  Write-Note 'Could not trigger the workflow manually; the push should still have started it.'
}

Write-Host "`nDone. The dashboard will be live in a minute or two at:" -ForegroundColor Green
Write-Host "    https://$Owner.github.io/$Name/" -ForegroundColor Green
Write-Host "`nWatch the build with: gh run watch --repo $Slug" -ForegroundColor DarkGray
