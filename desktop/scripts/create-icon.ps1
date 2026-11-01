$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../assets'))
[IO.Directory]::CreateDirectory($iconDirectory) | Out-Null
$bitmap = [Drawing.Bitmap]::new(256,256)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([Drawing.Color]::Transparent)
$back = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#1B1A21'))
$ring = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#B68AFF'),16)
$ring.StartCap = [Drawing.Drawing2D.LineCap]::Round
$ring.EndCap = [Drawing.Drawing2D.LineCap]::Round
$ink = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#F4EFFA'),20)
function Add-RoundedRect($drawing,$brush,$x,$y,$width,$height,$radius){
 $shape = [Drawing.Drawing2D.GraphicsPath]::new()
 $diameter = $radius*2
 $shape.AddArc($x,$y,$diameter,$diameter,180,90)
 $shape.AddArc($x+$width-$diameter,$y,$diameter,$diameter,270,90)
 $shape.AddArc($x+$width-$diameter,$y+$height-$diameter,$diameter,$diameter,0,90)
 $shape.AddArc($x,$y+$height-$diameter,$diameter,$diameter,90,90)
 $shape.CloseFigure()
 $drawing.FillPath($brush,$shape)
 $shape.Dispose()
}
Add-RoundedRect $graphics $back 4 4 248 248 60
$graphics.DrawEllipse($ring,48,48,160,160)
$graphics.DrawLine($ring,128,24,128,72)
$graphics.DrawLine($ring,128,184,128,232)
$graphics.DrawLine($ring,24,128,72,128)
$graphics.DrawLine($ring,184,128,232,128)
$graphics.DrawLine($ink,128,88,128,168)
$graphics.DrawLine($ink,93,108,163,148)
$graphics.DrawLine($ink,93,148,163,108)
$stream = [IO.MemoryStream]::new()
$bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
$png = $stream.ToArray()
[IO.File]::WriteAllBytes((Join-Path $iconDirectory 'icon.png'),$png)
$output = [IO.MemoryStream]::new()
$writer = [IO.BinaryWriter]::new($output)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32)
$writer.Write([uint32]$png.Length); $writer.Write([uint32]22); $writer.Write($png)
[IO.File]::WriteAllBytes((Join-Path $iconDirectory 'icon.ico'),$output.ToArray())
$writer.Dispose(); $output.Dispose(); $stream.Dispose(); $ink.Dispose(); $ring.Dispose(); $back.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
