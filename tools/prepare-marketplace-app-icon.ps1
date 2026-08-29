[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SourceIcon,

    [Parameter(Mandatory = $true)]
    [string]$OutputIcon
)

$ErrorActionPreference = "Stop"
$sourcePath = (Resolve-Path -LiteralPath $SourceIcon).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputIcon)
$outputDirectory = Split-Path -Parent $outputPath

if ([System.IO.Path]::GetExtension($outputPath) -ne ".png") {
    throw "OutputIcon must be a PNG file."
}
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Image]::FromFile($sourcePath)
$target = [System.Drawing.Bitmap]::new(
    288,
    288,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)
$graphics = [System.Drawing.Graphics]::FromImage($target)

try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($source, 0, 0, 288, 288)
    $target.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $graphics.Dispose()
    $target.Dispose()
    $source.Dispose()
}

Write-Output "Marketplace app icon created: $outputPath"
Write-Output "Size: 288x288 PNG; source metadata was not copied."
