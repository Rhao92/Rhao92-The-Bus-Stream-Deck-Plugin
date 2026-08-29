[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePlugin,

    [Parameter(Mandatory = $true)]
    [string]$DestinationPlugin
)

$ErrorActionPreference = "Stop"

$sourcePath = (Resolve-Path -LiteralPath $SourcePlugin).Path
$destinationPath = [System.IO.Path]::GetFullPath($DestinationPlugin)

if (-not $sourcePath.EndsWith(".sdPlugin", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "SourcePlugin must point to an .sdPlugin directory."
}
if (-not $destinationPath.EndsWith(".sdPlugin", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "DestinationPlugin must end with .sdPlugin."
}
if ($destinationPath.StartsWith($sourcePath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "DestinationPlugin must not be inside SourcePlugin."
}
if (Test-Path -LiteralPath $destinationPath) {
    throw "DestinationPlugin already exists: $destinationPath"
}

Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse

Add-Type -AssemblyName System.Drawing

function Convert-ToWhiteTransparentIcon {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $temporaryPath = "$resolvedPath.marketplace.tmp.png"
    $source = [System.Drawing.Bitmap]::new($resolvedPath)
    $target = [System.Drawing.Bitmap]::new(
        $source.Width,
        $source.Height,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )

    try {
        for ($y = 0; $y -lt $source.Height; $y++) {
            for ($x = 0; $x -lt $source.Width; $x++) {
                $pixel = $source.GetPixel($x, $y)
                # The colored source icons intentionally use opaque dark key
                # backgrounds. Marketplace list icons require transparency,
                # so luminance becomes the output alpha while hue is removed.
                $intensity = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B))
                $mask = [Math]::Min(1, [Math]::Max(0, ($intensity - 70) / 60))
                $outputAlpha = [Math]::Round($pixel.A * $mask)
                $target.SetPixel(
                    $x,
                    $y,
                    [System.Drawing.Color]::FromArgb($outputAlpha, 255, 255, 255)
                )
            }
        }
        $target.Save($temporaryPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $target.Dispose()
        $source.Dispose()
    }

    Move-Item -LiteralPath $temporaryPath -Destination $resolvedPath -Force
}

$manifestPath = Join-Path $destinationPath "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$iconReferences = @($manifest.CategoryIcon)
$iconReferences += @(
    $manifest.Actions |
        Where-Object { $_.VisibleInActionsList -ne $false } |
        ForEach-Object { $_.Icon } |
        Sort-Object -Unique
)

foreach ($iconReference in $iconReferences | Sort-Object -Unique) {
    Convert-ToWhiteTransparentIcon -Path (Join-Path $destinationPath "$iconReference.png")
    Convert-ToWhiteTransparentIcon -Path (Join-Path $destinationPath "$iconReference@2x.png")
}

Write-Output "Marketplace plugin copy prepared: $destinationPath"
Write-Output "Converted category and visible action-list icons to white with original transparency."
Write-Output "Plugin icon, key-state images, manifest identities and runtime files were not modified."
