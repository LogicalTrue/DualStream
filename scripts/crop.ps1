Add-Type -AssemblyName System.Drawing

$srcPath = 'C:\Users\alanm\.gemini\antigravity-ide\brain\12d9d900-86b0-48dd-82f5-b359a5cb985d\.user_uploaded\media_1787557388346.png'
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)

$minX = $bmp.Width
$minY = $bmp.Height
$maxX = 0
$maxY = 0

for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $pixel = $bmp.GetPixel($x, $y)
        if ($pixel.A -gt 40) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

# Hacemos zoom directo al círculo rojo y lobo central (cortando las gotas largas de abajo para que el logo se vea GIGANTE)
$circleW = $maxX - $minX
$circleH = $circleW # El círculo es simétrico

$targetSize = 128
$outBmp = New-Object System.Drawing.Bitmap($targetSize, $targetSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($outBmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$srcRect = New-Object System.Drawing.Rectangle($minX, $minY, $circleW, $circleH)
$destRect = New-Object System.Drawing.Rectangle(0, 0, $targetSize, $targetSize)

$g.DrawImage($bmp, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$bmp.Dispose()

$outBmp.Save('c:\Ediciones\Herramientas\DualStream\public\favicon.png', [System.Drawing.Imaging.ImageFormat]::Png)
$outBmp.Save('c:\Ediciones\Herramientas\DualStream\public\favicon.ico', [System.Drawing.Imaging.ImageFormat]::Png)
$outBmp.Save('c:\Ediciones\Herramientas\DualStream\favicon.png', [System.Drawing.Imaging.ImageFormat]::Png)
$outBmp.Save('c:\Ediciones\Herramientas\DualStream\favicon.ico', [System.Drawing.Imaging.ImageFormat]::Png)
$outBmp.Dispose()

Write-Host 'SUCCESS: Favicon cropped tightly and maximized to 100% full frame!'
