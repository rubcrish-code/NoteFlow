param(
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$BundleRoot,
    [string]$OutputRoot
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $BundleRoot) { $BundleRoot = Join-Path $projectRoot 'src-tauri\target\release' }
if (-not $OutputRoot) { $OutputRoot = Join-Path $projectRoot "releases\windows\$Version" }

$sources = @(
    @{ Path = (Join-Path $BundleRoot "bundle\msi\NoteFlow_${Version}_x64_en-US.msi"); Name = "NoteFlow_${Version}_x64_en-US.msi" },
    @{ Path = (Join-Path $BundleRoot "bundle\msi\NoteFlow_${Version}_x64_ru-RU.msi"); Name = "NoteFlow_${Version}_x64_ru-RU.msi" },
    @{ Path = (Join-Path $BundleRoot "bundle\nsis\NoteFlow_${Version}_x64-setup.exe"); Name = "NoteFlow_${Version}_x64-setup.exe" },
    @{ Path = (Join-Path $BundleRoot 'noteflow.exe'); Name = "NoteFlow_${Version}_x64-standalone.exe" }
)

foreach ($source in $sources) {
    if (-not (Test-Path -LiteralPath $source.Path -PathType Leaf)) {
        throw "Missing release artifact: $($source.Name)"
    }
}

$sha256 = [System.Security.Cryptography.SHA256]::Create()
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
$checksums = try {
    foreach ($source in $sources) {
        $destination = Join-Path $OutputRoot $source.Name
        Copy-Item -LiteralPath $source.Path -Destination $destination -Force
        $stream = [System.IO.File]::OpenRead($destination)
        try {
            $hash = [System.BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
        } finally {
            $stream.Dispose()
        }
        "$hash  $($source.Name)"
    }
} finally {
    $sha256.Dispose()
}
$manifest = Join-Path $OutputRoot 'SHA256SUMS.txt'
[System.IO.File]::WriteAllText($manifest, ($checksums -join "`n") + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Output "Staged $($sources.Count) artifacts in $OutputRoot"
Write-Output "SHA-256 manifest: $manifest"
