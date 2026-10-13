# v8 stage 4: draws the MSIX tile/store logos and the launcher icon (navy tile, white U+BC95).
# Run once when the design changes; the output in Assets/ is committed so builds are reproducible.
#   powershell -NoProfile -ExecutionPolicy Bypass -File packaging/msix/make-assets.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot "Assets"
New-Item -ItemType Directory -Force $out | Out-Null
$navy = [System.Drawing.Color]::FromArgb(255, 10, 21, 48)   # DESIGN.md navigation #0a1530

function New-Tile([int]$w, [int]$h, [double]$glyph, [bool]$plate) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "AntiAliasGridFit"; $g.Clear([System.Drawing.Color]::Transparent)
  if ($plate) {
    $r = [Math]::Max(2, [int]([Math]::Min($w, $h) * 0.18)); $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, 2*$r, 2*$r, 180, 90); $path.AddArc($w-2*$r-1, 0, 2*$r, 2*$r, 270, 90)
    $path.AddArc($w-2*$r-1, $h-2*$r-1, 2*$r, 2*$r, 0, 90); $path.AddArc(0, $h-2*$r-1, 2*$r, 2*$r, 90, 90); $path.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush($navy)), $path)
  }
  $size = [single]([Math]::Min($w, $h) * $glyph)
  $font = New-Object System.Drawing.Font("Malgun Gothic", $size, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = "Center"; $fmt.LineAlignment = "Center"
  $brush = New-Object System.Drawing.SolidBrush($(if ($plate) { [System.Drawing.Color]::White } else { $navy }))
  $g.DrawString([string][char]0xBC95, $font, $brush, (New-Object System.Drawing.RectangleF(0, [single]($h * 0.03), $w, $h)), $fmt)
  $g.Dispose(); return $bmp
}
function Save-Png($bmp, $name) { $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose() }

Save-Png (New-Tile 44 44 0.62 $true) "Square44x44Logo.png"
Save-Png (New-Tile 44 44 0.62 $true) "Square44x44Logo.targetsize-44_altform-unplated.png"
Save-Png (New-Tile 150 150 0.5 $true) "Square150x150Logo.png"
Save-Png (New-Tile 310 150 0.5 $true) "Wide310x150Logo.png"
Save-Png (New-Tile 50 50 0.62 $true) "StoreLogo.png"

# Launcher icon: ICO with PNG-compressed entries (16, 32, 48, 256).
$sizes = 16, 32, 48, 256; $pngs = @()
foreach ($s in $sizes) { $b = New-Tile $s $s 0.62 $true; $ms = New-Object System.IO.MemoryStream; $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose(); $pngs += ,$ms.ToArray() }
$ico = New-Object System.IO.MemoryStream; $w = New-Object System.IO.BinaryWriter($ico)
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $d = $(if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] })
  $w.Write([byte]$d); $w.Write([byte]$d); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$pngs[$i].Length); $w.Write([uint32]$offset); $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $w.Write($p) }
$w.Flush(); [System.IO.File]::WriteAllBytes((Join-Path $out "app.ico"), $ico.ToArray())
Write-Output "assets written"
