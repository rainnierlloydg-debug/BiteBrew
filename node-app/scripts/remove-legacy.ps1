[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = 'Stop'
$workspacePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\')
$nodeProjectPath = Join-Path $workspacePath 'node-app'
if (-not (Test-Path -LiteralPath (Join-Path $nodeProjectPath 'server\index.js'))) { throw 'Node project was not found. No files were removed.' }
if (-not (Test-Path -LiteralPath (Join-Path $nodeProjectPath 'prisma\schema.prisma'))) { throw 'Prisma schema was not found. No files were removed.' }

# Private business media and database connection settings were preserved before removal.
$preservedImportPath = Join-Path $nodeProjectPath 'var\import'
if (-not (Test-Path -LiteralPath (Join-Path $preservedImportPath 'source.env'))) { throw 'Preserved database settings are missing. No files were removed.' }
$sourcePrivatePath = Join-Path $workspacePath 'storage\app\private'
if (Test-Path -LiteralPath $sourcePrivatePath) {
    Get-ChildItem -LiteralPath $sourcePrivatePath -File -Recurse | Where-Object { $_.Name -ne '.gitignore' } | ForEach-Object {
        $relativeFilePath = $_.FullName.Substring($sourcePrivatePath.Length).TrimStart('\')
        $preservedFilePath = [System.IO.Path]::GetFullPath((Join-Path $preservedImportPath $relativeFilePath))
        if (-not $preservedFilePath.StartsWith($preservedImportPath + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid preservation path.' }
        if (-not (Test-Path -LiteralPath $preservedFilePath)) { throw 'A business file was not preserved. No files were removed.' }
        if ((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $preservedFilePath -Algorithm SHA256).Hash) { throw 'A preserved business file checksum differs. No files were removed.' }
    }
}

$relativeTargets = @(
    '.bootstrap-temp', 'app', 'bootstrap', 'config', 'database', 'deployment', 'docs',
    'legacy-reference', 'node_modules', 'public', 'resources', 'routes', 'scripts',
    'storage', 'tests', 'vendor', 'artisan', 'composer.json', 'composer.lock',
    'phpunit.mysql.xml', 'phpunit.xml', 'vite.config.js', '.env', '.env.example',
    '.env.testing', '.phpunit.result.cache', '.runtime\composer', '.runtime\available.lock',
    '.runtime\backup-fixtures.json', '.runtime\backup-fixtures.php',
    '.runtime\clean-backup-fixtures.php', '.runtime\inspect-menu.php', '.runtime\qa-session.json',
    '.runtime\refresh-lock.php', '.runtime\seed-qa.php', '.runtime\setup-local.php', '.runtime\browser-debug.log'
)
$runtimePath = Join-Path $workspacePath '.runtime'
if (Test-Path -LiteralPath $runtimePath) {
    $relativeTargets += @(Get-ChildItem -LiteralPath $runtimePath -Directory -Filter 'browser-qa*' | ForEach-Object { '.runtime\' + $_.Name })
}

$verifiedTargets = @()
foreach ($relativeTarget in $relativeTargets) {
    $absoluteTarget = [System.IO.Path]::GetFullPath((Join-Path $workspacePath $relativeTarget))
    if (-not $absoluteTarget.StartsWith($workspacePath + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'A removal target escaped the workspace.' }
    if ($absoluteTarget -eq $nodeProjectPath -or $absoluteTarget.StartsWith($nodeProjectPath + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'The Node application cannot be removed.' }
    if ($absoluteTarget.StartsWith((Join-Path $runtimePath 'mysql-data'), [System.StringComparison]::OrdinalIgnoreCase) -or $absoluteTarget.StartsWith((Join-Path $runtimePath 'mysql-tmp'), [System.StringComparison]::OrdinalIgnoreCase)) { throw 'MySQL storage cannot be removed.' }
    if (Test-Path -LiteralPath $absoluteTarget) {
        $item = Get-Item -LiteralPath $absoluteTarget -Force
        if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'A removal target is a link. Inspect it manually before cleanup.' }
        if ($item.PSIsContainer) {
            $links = @(Get-ChildItem -LiteralPath $absoluteTarget -Recurse -Force | Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint })
            if ($links.Count -gt 0) { throw 'A legacy directory contains filesystem links. Inspect these before cleanup.' }
        }
        $verifiedTargets += $absoluteTarget
    }
}

foreach ($absoluteTarget in $verifiedTargets) {
    if ($PSCmdlet.ShouldProcess($absoluteTarget, 'Remove verified legacy framework files')) {
        Remove-Item -LiteralPath $absoluteTarget -Recurse -Force
    }
}
if (-not $WhatIfPreference) { Write-Output 'Legacy cleanup finished. Node source, preserved business files, and MySQL storage remain.' }
