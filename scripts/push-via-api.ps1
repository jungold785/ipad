<#
.SYNOPSIS
  Uploads the working tree to GitHub through the REST API instead of git push.

.DESCRIPTION
  Some networks reset git's smart-HTTP channel (a "Recv failure: Connection
  was reset" on push) while api.github.com keeps working. This script
  publishes the same content through the Git Data API:

      blob -> tree -> commit -> ref

  It produces a single commit, so the history stays clean, and it only needs
  the API host, never the git protocol.

.PARAMETER DryRun
  List the files that would be uploaded without contacting GitHub.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/push-via-api.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/push-via-api.ps1 -DryRun
#>

param(
  [string]$Owner = 'jungold785',
  [string]$Name = 'ipad',
  [string]$Message = 'feat(dashboard): update iPad desk-widget dashboard',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot
$Slug = "$Owner/$Name"

function Write-Step { param([string]$Message) Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "    $Message" -ForegroundColor Green }
function Write-Note { param([string]$Message) Write-Host "    $Message" -ForegroundColor Yellow }

# One reusable file for the request bodies: the base64 of a PNG is far larger
# than the Windows command line limit, so it has to travel through a file.
$BodyFile = Join-Path ([System.IO.Path]::GetTempPath()) 'codex-gh-api-body.json'

function Invoke-GhApi {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Json
  )
  $arguments = @('api', '--method', $Method, $Path)
  if ($Json) {
    [System.IO.File]::WriteAllText($BodyFile, $Json, (New-Object System.Text.UTF8Encoding($false)))
    $arguments += @('--input', $BodyFile)
  }
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & gh @arguments 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  $text = ($output | Out-String).Trim()
  if ($code -ne 0) {
    throw "gh api $Method $Path failed ($code): $text"
  }
  return $text
}

# ------------------------------------------------------------------ 1. files
Write-Step 'Collecting the files'

$RepoPath = ((Resolve-Path $RepoRoot).Path -replace '\\', '/')
$gitArgs = @('-c', "safe.directory=$RepoPath", 'ls-files', '-c', '-o', '--exclude-standard')
$files = @(& git @gitArgs 2>$null) | Where-Object { $_ -and $_.Trim() }
if ($files.Count -eq 0) {
  Write-Note 'No files to upload.'
  exit 0
}
Write-Ok "$($files.Count) files."

if ($DryRun) {
  $files | ForEach-Object { Write-Host "    $_" }
  exit 0
}

# ----------------------------------------------------------------- 2. blobs
Write-Step 'Creating the blobs'

$entries = @()
$index = 0
foreach ($relative in $files) {
  $index++
  $full = Join-Path $RepoRoot ($relative -replace '/', '\')
  $base64 = [System.Convert]::ToBase64String([System.IO.File]::ReadAllBytes($full))
  $json = '{"content":"' + $base64 + '","encoding":"base64"}'
  $blob = Invoke-GhApi -Method POST -Path "repos/$Slug/git/blobs" -Json $json | ConvertFrom-Json
  $entries += ,@{ path = $relative; mode = '100644'; type = 'blob'; sha = $blob.sha }
  Write-Host "    [$index/$($files.Count)] $relative"
}

# ------------------------------------------------------------------ 3. tree
Write-Step 'Creating the tree'

$treeJson = '{"tree":[' + (($entries | ForEach-Object {
  '{"path":"' + ($_.path -replace '\\', '\\\\' -replace '"', '\"') + '","mode":"' + $_.mode + '","type":"' + $_.type + '","sha":"' + $_.sha + '"}'
}) -join ',') + ']}'
$tree = Invoke-GhApi -Method POST -Path "repos/$Slug/git/trees" -Json $treeJson | ConvertFrom-Json
Write-Ok "tree $($tree.sha)"

# ---------------------------------------------------------------- 4. commit
Write-Step 'Creating the commit'

$headSha = ''
try {
  $ref = Invoke-GhApi -Method GET -Path "repos/$Slug/git/ref/heads/main" | ConvertFrom-Json
  $headSha = [string]$ref.object.sha
} catch {
  $headSha = ''
}

$commitJson = '{"message":"' + ($Message -replace '\\', '\\\\' -replace '"', '\"') + '","tree":"' + $tree.sha + '"'
if ($headSha) {
  $commitJson += ',"parents":["' + $headSha + '"]'
}
$commitJson += '}'
$commit = Invoke-GhApi -Method POST -Path "repos/$Slug/git/commits" -Json $commitJson | ConvertFrom-Json
Write-Ok "commit $($commit.sha)"

# ------------------------------------------------------------------- 5. ref
Write-Step 'Updating the branch'

if ($headSha) {
  Invoke-GhApi -Method PATCH -Path "repos/$Slug/git/refs/heads/main" -Json ('{"sha":"' + $commit.sha + '","force":true}') | Out-Null
  Write-Ok 'main now points at the new commit.'
} else {
  Invoke-GhApi -Method POST -Path "repos/$Slug/git/refs" -Json ('{"ref":"refs/heads/main","sha":"' + $commit.sha + '"}') | Out-Null
  Write-Ok 'Created main.'
}

Write-Host "`nDone. The dashboard will be live in a minute or two at:" -ForegroundColor Green
Write-Host "    https://$Owner.github.io/$Name/" -ForegroundColor Green
Write-Host "`nWatch the build with: gh run watch --repo $Slug" -ForegroundColor DarkGray