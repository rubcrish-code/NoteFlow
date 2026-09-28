$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

function Invoke-CheckedCommand {
    param([string]$Executable, [string[]]$Arguments)
    Write-Output "> $Executable $($Arguments -join ' ')"
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Executable failed with exit code $LASTEXITCODE"
    }
}

Push-Location $projectRoot
try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'Windows release builds require Windows.'
    }
    $status = & git status --porcelain=v1 --untracked-files=all
    if ($LASTEXITCODE -ne 0 -or $status) {
        throw 'Release requires a clean Git working tree.'
    }

    $package = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
    $lockVersions = & node -e "const lock = require('./package-lock.json'); process.stdout.write(JSON.stringify({version: lock.version, rootVersion: lock.packages[''].version}))"
    if ($LASTEXITCODE -ne 0) { throw 'Unable to read npm lockfile versions.' }
    $lock = $lockVersions | ConvertFrom-Json
    $config = Get-Content -LiteralPath 'src-tauri\tauri.conf.json' -Raw | ConvertFrom-Json
    $cargo = (& cargo metadata --manifest-path 'src-tauri\Cargo.toml' --offline --no-deps --format-version 1 | ConvertFrom-Json).packages |
        Where-Object { $_.name -eq 'noteflow' } | Select-Object -First 1
    if ($LASTEXITCODE -ne 0 -or -not $cargo) { throw 'Unable to read Cargo package metadata.' }
    $version = $package.version
    if ($version -ne $lock.version -or $version -ne $lock.rootVersion -or
        $version -ne $config.version -or $version -ne $cargo.version) {
        throw 'Package, lockfile, Tauri and Cargo versions differ.'
    }
    if ($config.productName -ne 'NoteFlow' -or $config.identifier -ne 'com.noteflow.desktop') {
        throw 'Unexpected product name or bundle identifier.'
    }

    Invoke-CheckedCommand 'npm.cmd' @('run', 'typecheck')
    Invoke-CheckedCommand 'npm.cmd' @('run', 'test')
    Invoke-CheckedCommand 'npm.cmd' @('run', 'build')
    Push-Location 'src-tauri'
    try {
        Invoke-CheckedCommand 'cargo' @('fmt', '--check')
        Invoke-CheckedCommand 'cargo' @('check')
        Invoke-CheckedCommand 'cargo' @('test')
        Invoke-CheckedCommand 'cargo' @('clippy', '--all-targets', '--all-features', '--', '-D', 'warnings')
        Invoke-CheckedCommand 'cargo' @('test', 'search::tests::search_performance_on_ten_thousand_notes', '--', '--ignored', '--nocapture')
    } finally {
        Pop-Location
    }
    Invoke-CheckedCommand 'npm.cmd' @('run', 'tauri', 'build')

    $builtFiles = Get-ChildItem -LiteralPath 'dist' -Recurse -File
    if ($builtFiles | Where-Object { $_.Extension -eq '.map' }) {
        throw 'Production source maps were found in dist.'
    }
    foreach ($file in $builtFiles | Where-Object { $_.Extension -in '.html', '.js' }) {
        if (Select-String -LiteralPath $file.FullName -Pattern 'localhost:1420|127\.0\.0\.1:1420|localhost:1421' -Quiet) {
            throw "Dev server URL found in built asset: $($file.Name)"
        }
    }

    & (Join-Path $PSScriptRoot 'stage-windows-artifacts.ps1') -Version $version
    Invoke-CheckedCommand 'git' @('diff', '--check')
    $status = & git status --porcelain=v1 --untracked-files=all
    if ($LASTEXITCODE -ne 0 -or $status) {
        throw 'The release build changed the Git working tree.'
    }
    Write-Output "Windows release staging complete: NoteFlow $version"
} finally {
    Pop-Location
}
