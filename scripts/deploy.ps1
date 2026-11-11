<#
.SYNOPSIS
  Deploys the Desk dashboard to GitHub Pages in one go.

.DESCRIPTION
  Handles the whole first-time setup:
    1. signs in to GitHub (opens the browser for the device code)
    2. prepares the repository (safe.directory, main branch, identity)
    3. commits the working tree
    4. creates the public repository if it does not exist
    5. enables GitHub Pages with the Actions workflow as the source
    6. pushes and triggers a deployment

  Safe to run more than once.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
#>

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
    & gh auth login -h github.com --web --git-protocol https
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

$push = Invoke-Native -FilePath git -Arguments @('push', '-u', 'origin', 'main')
Show-Output $push.Output
if ($push.ExitCode -ne 0) {
  Write-Note 'Push failed. Check your credentials and try again.'
  exit 1
}
Write-Ok 'Pushed.'

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
