# Rebuild the original game diagram with Windows System.Drawing; no downloads.
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '../assets/signs'
New-Item -ItemType Directory -Force $out | Out-Null
foreach ($entrance in 1,2) {
  $bmp = [Drawing.Bitmap]::new(1440,1000)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  function Rect($x,$y,$w,$h,$color) {
    $b=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($color))
    $g.FillRectangle($b,[single]$x,[single]$y,[single]$w,[single]$h); $b.Dispose()
  }
  function Text($text,$x,$y,$size,$color='#193c37') {
    $f=[Drawing.Font]::new('Arial',[single]$size,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
    $b=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($color))
    $g.DrawString($text,$f,$b,[single]$x,[single]$y); $f.Dispose(); $b.Dispose()
  }
  function Line($x1,$y1,$x2,$y2,$color='#138455',$arrow=$false,$dashed=$false) {
    $p=[Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml($color),8)
    if($arrow){$p.CustomEndCap=[Drawing.Drawing2D.AdjustableArrowCap]::new(5,6)}
    if($dashed){$p.DashStyle='Dash'}
    $g.DrawLine($p,[single]$x1,[single]$y1,[single]$x2,[single]$y2); $p.Dispose()
  }
  $g.Clear([Drawing.ColorTranslator]::FromHtml('#f4f8ee'))
  Rect 0 0 1440 112 '#136b4b'
  Text 'ПЛАН ЭВАКУАЦИИ' 48 20 52 '#ffffff'
  Text "ПОДЪЕЗД $entrance" 1050 36 32 '#ffffff'
  Text 'ДОМ · СХЕМА ПО ЭТАЖАМ' 50 140 30
  Text 'ДВОР · ВИД СВЕРХУ' 810 140 30
  foreach($e in 1,2) {
    $x=100+($e-1)*310
    Text "Подъезд $e" $x 193 27
    Rect $x 240 240 420 '#dae5dc'
    for($floor=9;$floor -ge 1;$floor--) {
      $y=240+(9-$floor)*46
      Rect $x $y 240 3 '#9aafa3'
      Text "$floor" ($x+$(if($e -eq 1){16}else{195})) ($y+5) 26
    }
    Line ($x+145) 265 ($x+145) 665
    Line ($x+145) 265 ($x+145) 400 '#138455' $true
    Line ($x+145) 520 ($x+145) 685 '#138455' $true
    Text 'ВЫХОД' ($x+65) 701 29
  }
  # Crossing joins the two entrances at floor four, never at another floor.
  Line 265 493 535 493 '#b97819' $true $true
  Text '4 этаж' 333 450 23 '#9a5d0e'
  Text 'Лестницы вниз' 90 754 27
  Rect 800 230 570 140 '#dae5dc'
  Line 1085 230 1085 370 '#9aafa3'
  Text 'Подъезд 1' 824 257 27
  Text 'Подъезд 2' 1114 257 27
  Rect 885 350 55 25 '#138455'
  Rect 1200 350 55 25 '#138455'
  Line 912 382 912 490
  Line 1227 382 1227 490
  Line 912 490 1068 490
  Line 1227 490 1068 490
  Line 1068 490 1068 620 '#138455' $true
  Rect 860 650 460 110 '#d3ecd8'
  Text 'МЕСТО СБОРА' 919 662 32
  Text 'Детская площадка' 911 707 28
  $here=if($entrance -eq 1){820}else{1135}
  Rect $here 391 20 20 '#ce533e'
  Text 'Вы здесь' ($here-25) 422 24 '#b14131'
  Rect 42 818 1356 144 '#e4ece2'
  Text 'Спуск по лестницам. ЛИФТОМ НЕ ПОЛЬЗОВАТЬСЯ.' 65 833 30
  Text 'Пунктир: обход завала через переход на 4-м этаже во 2-й подъезд.' 65 877 27
  Text 'Схема игрового мира · не в масштабе' 65 920 23 '#526c61'
  $bmp.Save((Join-Path $out "evacuation-e$entrance.png"),[Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
