$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildDirectory = Join-Path $projectRoot "dist"
$resolvedProjectRoot = [System.IO.Path]::GetFullPath($projectRoot)
$resolvedBuildDirectory = [System.IO.Path]::GetFullPath($buildDirectory)
$expectedBuildPrefix = $resolvedProjectRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

if (-not $resolvedBuildDirectory.StartsWith($expectedBuildPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Build directory must stay inside the project directory."
}

if (Test-Path -LiteralPath $resolvedBuildDirectory) {
    Remove-Item -LiteralPath $resolvedBuildDirectory -Recurse -Force
}

New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null

$publicFiles = @(
    "index.html",
    "account.html",
    "style.css",
    "script.js",
    "account.js",
    "firebase-config.js",
    "og.png"
)

foreach ($publicFile in $publicFiles) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $publicFile) -Destination $buildDirectory -Force
}

Write-Output "Static site built in $buildDirectory"
