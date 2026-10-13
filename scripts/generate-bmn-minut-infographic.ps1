$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$scale = 4
$width = 3508
$height = 2480
$outDir = Join-Path $PSScriptRoot '..\Dokumentasi'
$pngPath = Join-Path $outDir 'Infografik_Alur_Sistem_BMN-Minut.png'
$pdfPath = Join-Path $outDir 'Infografik_Alur_Sistem_BMN-Minut_A4_Landscape.pdf'
$logoPath = Join-Path $PSScriptRoot '..\public\bps-minut-logo.png'

New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

function Get-Color([string]$hex) {
  $value = $hex.TrimStart('#')
  return [System.Drawing.Color]::FromArgb(
    255,
    [Convert]::ToInt32($value.Substring(0, 2), 16),
    [Convert]::ToInt32($value.Substring(2, 2), 16),
    [Convert]::ToInt32($value.Substring(4, 2), 16)
  )
}

function New-Brush([string]$hex) {
  return [System.Drawing.SolidBrush]::new((Get-Color $hex))
}

function New-Pen([string]$hex, [float]$size = 1) {
  return [System.Drawing.Pen]::new((Get-Color $hex), [float]($size * $scale))
}

function New-Font([float]$size, [bool]$bold = $false) {
  $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  return [System.Drawing.Font]::new('Arial', [float]($size * $scale), $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$radius, [string]$fill, [string]$stroke = '', [float]$strokeWidth = 1) {
  $rect = [System.Drawing.RectangleF]::new($x * $scale, $y * $scale, $w * $scale, $h * $scale)
  $d = [float]($radius * 2 * $scale)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $brush = New-Brush $fill
  $graphics.FillPath($brush, $path)
  $brush.Dispose()
  if ($stroke) {
    $pen = New-Pen $stroke $strokeWidth
    $graphics.DrawPath($pen, $path)
    $pen.Dispose()
  }
  $path.Dispose()
}

function Draw-Text([string]$text, [float]$x, [float]$y, [float]$w, [float]$h, [float]$size, [string]$color, [bool]$bold = $false, [string]$align = 'Near', [string]$valign = 'Near') {
  $font = New-Font $size $bold
  $brush = New-Brush $color
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::$align
  $format.LineAlignment = [System.Drawing.StringAlignment]::$valign
  $format.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
  $format.FormatFlags = [System.Drawing.StringFormatFlags]::LineLimit
  $rect = [System.Drawing.RectangleF]::new($x * $scale, $y * $scale, $w * $scale, $h * $scale)
  $graphics.DrawString($text, $font, $brush, $rect, $format)
  $font.Dispose()
  $brush.Dispose()
  $format.Dispose()
}

function Draw-Line([float]$x1, [float]$y1, [float]$x2, [float]$y2, [string]$color, [float]$stroke = 1) {
  $pen = New-Pen $color $stroke
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($pen, $x1 * $scale, $y1 * $scale, $x2 * $scale, $y2 * $scale)
  $pen.Dispose()
}

function Draw-Icon([string]$kind, [float]$x, [float]$y, [string]$color, [float]$size = 13) {
  $u = $size / 16
  $pen = New-Pen $color 1.25
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $sx = { param($v) [float](($x + ($v * $u)) * $scale) }
  $sy = { param($v) [float](($y + ($v * $u)) * $scale) }
  if ($kind -eq 'dashboard' -or $kind -eq 'report') {
    $graphics.DrawRectangle($pen, (&$sx 2), (&$sy 2), 12 * $u * $scale, 12 * $u * $scale)
    $graphics.DrawLine($pen, (&$sx 5), (&$sy 11), (&$sx 5), (&$sy 8))
    $graphics.DrawLine($pen, (&$sx 8), (&$sy 11), (&$sx 8), (&$sy 5))
    $graphics.DrawLine($pen, (&$sx 11), (&$sy 11), (&$sx 11), (&$sy 7))
  } elseif ($kind -eq 'document' -or $kind -eq 'request') {
    $graphics.DrawLine($pen, (&$sx 4), (&$sy 2), (&$sx 10), (&$sy 2))
    $graphics.DrawLine($pen, (&$sx 10), (&$sy 2), (&$sx 13), (&$sy 5))
    $graphics.DrawLine($pen, (&$sx 13), (&$sy 5), (&$sx 13), (&$sy 14))
    $graphics.DrawLine($pen, (&$sx 13), (&$sy 14), (&$sx 4), (&$sy 14))
    $graphics.DrawLine($pen, (&$sx 4), (&$sy 14), (&$sx 4), (&$sy 2))
    $graphics.DrawLine($pen, (&$sx 7), (&$sy 7), (&$sx 11), (&$sy 7))
    $graphics.DrawLine($pen, (&$sx 7), (&$sy 10), (&$sx 11), (&$sy 10))
    if ($kind -eq 'request') {
      $graphics.DrawLine($pen, (&$sx 3), (&$sy 11), (&$sx 5), (&$sy 13))
    }
  } elseif ($kind -eq 'asset' -or $kind -eq 'inventory') {
    $graphics.DrawLine($pen, (&$sx 2), (&$sy 5), (&$sx 8), (&$sy 2))
    $graphics.DrawLine($pen, (&$sx 8), (&$sy 2), (&$sx 14), (&$sy 5))
    $graphics.DrawLine($pen, (&$sx 2), (&$sy 5), (&$sx 8), (&$sy 8))
    $graphics.DrawLine($pen, (&$sx 8), (&$sy 8), (&$sx 14), (&$sy 5))
    $graphics.DrawLine($pen, (&$sx 2), (&$sy 5), (&$sx 2), (&$sy 12))
    $graphics.DrawLine($pen, (&$sx 8), (&$sy 8), (&$sx 8), (&$sy 15))
    $graphics.DrawLine($pen, (&$sx 14), (&$sy 5), (&$sx 14), (&$sy 12))
    $graphics.DrawLine($pen, (&$sx 2), (&$sy 12), (&$sx 8), (&$sy 15))
    $graphics.DrawLine($pen, (&$sx 14), (&$sy 12), (&$sx 8), (&$sy 15))
  } else {
    $graphics.DrawEllipse($pen, (&$sx 3), (&$sy 2), 10 * $u * $scale, 10 * $u * $scale)
    $graphics.DrawLine($pen, (&$sx 8), (&$sy 12), (&$sx 8), (&$sy 15))
    $graphics.DrawLine($pen, (&$sx 5), (&$sy 15), (&$sx 11), (&$sy 15))
  }
  $pen.Dispose()
}

function Draw-Arrow([float]$x1, [float]$y1, [float]$x2, [float]$y2, [string]$color) {
  Draw-Line $x1 $y1 $x2 $y2 $color 1.5
  if ($x2 -ge $x1) {
    Draw-Line ($x2 - 3) ($y2 - 2) $x2 $y2 $color 1.5
    Draw-Line ($x2 - 3) ($y2 + 2) $x2 $y2 $color 1.5
  } elseif ($x2 -lt $x1) {
    Draw-Line ($x2 + 3) ($y2 - 2) $x2 $y2 $color 1.5
    Draw-Line ($x2 + 3) ($y2 + 2) $x2 $y2 $color 1.5
  }
}

function Draw-SectionHeader([float]$x, [float]$y, [string]$number, [string]$title, [string]$subtitle, [string]$color) {
  Draw-RoundRect $x $y 23 23 6 $color
  Draw-Text $number $x ($y + 1) 23 20 9 '#FFFFFF' $true 'Center' 'Center'
  Draw-Text $title ($x + 31) ($y + 1) 300 12 9 '#16345C' $true
  Draw-Text $subtitle ($x + 31) ($y + 14) 730 9 6.2 '#68788E'
}

function Draw-FlowStep([float]$x, [float]$y, [float]$w, [string]$number, [string]$title, [string]$detail) {
  Draw-RoundRect $x $y $w 48 6 '#F7FAFE' '#D9E3F0' 0.7
  Draw-RoundRect ($x + 6) ($y + 6) 17 17 5 '#E3EEFC'
  Draw-Text $number ($x + 6) ($y + 7) 17 14 7 '#19569B' $true 'Center' 'Center'
  Draw-Text $title ($x + 27) ($y + 6) ($w - 32) 16 6.7 '#18385F' $true
  Draw-Text $detail ($x + 7) ($y + 27) ($w - 14) 17 5.8 '#65768B'
}

try {
  $graphics.Clear((Get-Color '#F2F5FA'))
  $graphics.FillRectangle((New-Brush '#FFFFFF'), 0, 0, $width, 100 * $scale)
  $headerBrush = New-Brush '#123B70'
  $graphics.FillRectangle($headerBrush, 0, 0, $width, 100 * $scale)
  $headerBrush.Dispose()
  $graphics.FillRectangle((New-Brush '#2C79C5'), 0, 96 * $scale, $width, 4 * $scale)

  Draw-RoundRect 24 16 82 62 7 '#FFFFFF'
  $logo = [System.Drawing.Image]::FromFile((Resolve-Path $logoPath))
  $graphics.DrawImage($logo, [System.Drawing.Rectangle]::new(25 * $scale, 17 * $scale, 80 * $scale, 60 * $scale))
  $logo.Dispose()
  Draw-Text 'ALUR SISTEM BMN-MINUT' 120 17 610 30 24 '#FFFFFF' $true
  Draw-Text 'Digitalisasi Pengelolaan BMN, Persediaan, dan Dokumentasi di BPS Kabupaten Minahasa Utara' 122 53 680 22 10.3 '#D9E8F8'
  Draw-RoundRect 732 22 117 37 9 '#1C4D83'
  Draw-Text 'BPS KAB. MINAHASA UTARA' 738 30 105 19 6.1 '#FFFFFF' $true 'Center' 'Center'

  Draw-RoundRect 24 110 829 130 10 '#FFFFFF' '#DEE6F0' 0.8
  Draw-SectionHeader 38 120 'A' 'KONDISI SEBELUM BMN-MINUT' 'Sistem dan proses memiliki fungsi berbeda; pekerjaan operasional masih memerlukan dukungan.' '#C04B4B'

  $issues = @(
    @{ Icon = 'asset'; Title = 'SIMAN'; Body = 'Informasi aset, belum ada dashboard operasional terpadu sesuai kebutuhan internal.' },
    @{ Icon = 'report'; Title = 'SAKTI'; Body = 'Data persediaan dan administrasi perlu dukungan pemantauan harian.' },
    @{ Icon = 'request'; Title = 'Permohonan manual'; Body = 'Pengajuan ATK/ARK dan penelusuran permohonan belum praktis.' },
    @{ Icon = 'inventory'; Title = 'Stok berbeda'; Body = 'Pengambilan dapat berbeda dari catatan stok; perlu pemeriksaan.' },
    @{ Icon = 'document'; Title = 'Rincian transaksi'; Body = 'Operator perlu alat bantu untuk pemeriksaan dan pendetailan.' },
    @{ Icon = 'document'; Title = 'Dokumen tersebar'; Body = 'Nota belanja dan dokumen pendukung sulit ditemukan kembali.' }
  )
  $issueW = 124
  for ($i = 0; $i -lt $issues.Count; $i++) {
    $x = 38 + ($i * 133)
    Draw-RoundRect $x 153 $issueW 75 6 '#FBFCFE' '#E8EDF4' 0.6
    Draw-Icon $issues[$i].Icon ($x + 8) 160 '#B94B54' 14
    Draw-Text $issues[$i].Title ($x + 28) 158 ($issueW - 34) 15 6.8 '#18385F' $true
    Draw-Text $issues[$i].Body ($x + 8) 178 ($issueW - 16) 44 5.9 '#66768A'
  }

  Draw-RoundRect 24 250 402 208 10 '#FFFFFF' '#DEE6F0' 0.8
  Draw-SectionHeader 38 260 'B' 'SOLUSI MELALUI BMN-MINUT' 'Satu dukungan operasional internal - bukan pengganti SIMAN atau SAKTI.' '#2774B9'
  $features = @(
    @{ Icon = 'dashboard'; Title = 'Dashboard'; Body = 'Ringkasan sesuai role pengguna.' },
    @{ Icon = 'inventory'; Title = 'Persediaan'; Body = 'Stok, kartu stok, dan opname.' },
    @{ Icon = 'request'; Title = 'Permohonan ATK/ARK'; Body = 'Pengajuan dan status permintaan.' },
    @{ Icon = 'report'; Title = 'Transaksi stok'; Body = 'Barang masuk, keluar, dan pemeriksaan.' },
    @{ Icon = 'document'; Title = 'Dokumen digital'; Body = 'Nota, kuitansi, BAST, dan pencarian.' },
    @{ Icon = 'asset'; Title = 'BMN & laporan'; Body = 'Aset, ruangan, mutasi, pemeliharaan, laporan.' }
  )
  for ($i = 0; $i -lt $features.Count; $i++) {
    $column = $i % 2
    $row = [Math]::Floor($i / 2)
    $x = 38 + ($column * 190)
    $y = 300 + ($row * 48)
    Draw-RoundRect $x $y 180 42 6 '#F5F9FE' '#E3EBF5' 0.6
    Draw-Icon $features[$i].Icon ($x + 8) ($y + 8) '#2879BD' 14
    Draw-Text $features[$i].Title ($x + 29) ($y + 6) 145 14 6.7 '#18385F' $true
    Draw-Text $features[$i].Body ($x + 29) ($y + 22) 145 16 5.7 '#66768A'
  }

  Draw-RoundRect 438 250 415 208 10 '#FFFFFF' '#DEE6F0' 0.8
  Draw-SectionHeader 452 260 'C' 'ALUR KERJA PENGGUNA' 'Menu dan tindakan mengikuti role serta hak akses di aplikasi.' '#287F8C'
  $flowX = @(452, 550, 648, 746)
  $flowW = 88
  $topY = 300
  $bottomY = 359
  $steps = @(
    @{ Title = 'Login'; Detail = 'Pengguna masuk' },
    @{ Title = 'Dashboard'; Detail = 'Sesuai role' },
    @{ Title = 'Pilih menu'; Detail = 'Fitur yang diizinkan' },
    @{ Title = 'Ajukan / catat'; Detail = 'Permintaan atau transaksi' },
    @{ Title = 'Keputusan'; Detail = 'Verifikasi, setuju / tolak' },
    @{ Title = 'Proses gudang'; Detail = 'Permintaan disetujui' },
    @{ Title = 'Catat status'; Detail = 'Stok dan transaksi' },
    @{ Title = 'Arsip & pantau'; Detail = 'Dokumen dan dashboard' }
  )
  for ($i = 0; $i -lt 4; $i++) {
    Draw-FlowStep $flowX[$i] $topY $flowW ([string]($i + 1)) $steps[$i].Title $steps[$i].Detail
    if ($i -lt 3) { Draw-Arrow ($flowX[$i] + $flowW + 2) ($topY + 24) ($flowX[$i + 1] - 3) ($topY + 24) '#74A5D0' }
  }
  Draw-Line 842 324 847 324 '#74A5D0' 1.5
  Draw-Line 847 324 847 383 '#74A5D0' 1.5
  Draw-Line 847 383 839 383 '#74A5D0' 1.5
  Draw-Line 842 381 839 383 '#74A5D0' 1.5
  Draw-Line 842 385 839 383 '#74A5D0' 1.5
  for ($i = 0; $i -lt 4; $i++) {
    $stepIndex = 7 - $i
    Draw-FlowStep $flowX[$i] $bottomY $flowW ([string]($stepIndex + 1)) $steps[$stepIndex].Title $steps[$stepIndex].Detail
    if ($i -lt 3) { Draw-Arrow ($flowX[$i + 1] - 2) ($bottomY + 24) ($flowX[$i] + $flowW + 3) ($bottomY + 24) '#74A5D0' }
  }
  Draw-Text 'Status permohonan: Diajukan > Diverifikasi > Disetujui > Diproses > Selesai, atau Ditolak.' 452 414 390 13 5.9 '#3D5878' $true
  Draw-Text 'Pimpinan memantau; keputusan dan proses dilakukan sesuai kewenangan role.' 452 431 390 12 5.6 '#68788E'

  Draw-RoundRect 24 468 829 121 10 '#FFFFFF' '#DEE6F0' 0.8
  Draw-SectionHeader 38 478 'D' 'HASIL DAN MANFAAT' 'Informasi dan dokumentasi yang lebih tertata mendukung pekerjaan operator serta pimpinan.' '#32815E'
  $benefits = @(
    'Informasi dashboard lebih jelas',
    'Permohonan lebih tertata',
    'Stok dan transaksi mudah dipantau',
    'Selisih pengambilan lebih mudah diketahui',
    'Pendetailan transaksi terbantu',
    'Nota dan dokumen mudah ditemukan',
    'Mendukung operator dan pimpinan'
  )
  $benefitW = 111
  for ($i = 0; $i -lt $benefits.Count; $i++) {
    $x = 38 + ($i * 116)
    Draw-RoundRect $x 516 $benefitW 57 6 '#F7FAF8' '#E3EEE7' 0.6
    Draw-RoundRect ($x + 8) 526 18 18 6 '#E6F3EB'
    Draw-Text ([string]($i + 1)) ($x + 8) 527 18 15 7 '#2B8055' $true 'Center' 'Center'
    Draw-Text $benefits[$i] ($x + 31) 523 ($benefitW - 36) 43 5.9 '#365B4B' $true
  }

  Draw-Text 'BMN-Minut mendukung operasional internal. Data dan proses pada SIMAN serta SAKTI tetap berjalan sesuai fungsinya.' 30 597 817 12 5.8 '#5D6E83' $false 'Center'
  Draw-Text 'Fitur dan alur disusun berdasarkan source code aplikasi yang ditinjau.' 30 608 817 9 5.1 '#8793A2' $false 'Center'

  $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $jpegPath = Join-Path $outDir 'Infografik_Alur_Sistem_BMN-Minut_print.jpg'
  $jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  $encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
  $encoderParameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [long]95)
  $bitmap.Save($jpegPath, $jpegEncoder, $encoderParameters)
  $encoderParameters.Dispose()
  $bitmap.Dispose()
  $graphics.Dispose()

  $jpegBytes = [System.IO.File]::ReadAllBytes($jpegPath)
  $stream = [System.IO.MemoryStream]::new()
  $writer = [System.IO.BinaryWriter]::new($stream, [System.Text.Encoding]::ASCII, $true)
  $offsets = [System.Collections.Generic.List[long]]::new()
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("%PDF-1.4`n%"))
  $writer.Write([byte[]]@(226, 227, 207, 211, 10))
  $objects = @(
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>'
  )
  foreach ($object in $objects) {
    $offsets.Add($stream.Position)
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes("$($offsets.Count) 0 obj`n$object`nendobj`n"))
  }
  $content = "q`n841.89 0 0 595.28 0 0 cm`n/Im0 Do`nQ`n"
  $contentBytes = [System.Text.Encoding]::ASCII.GetBytes($content)
  $offsets.Add($stream.Position)
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("4 0 obj`n<< /Length $($contentBytes.Length) >>`nstream`n"))
  $writer.Write($contentBytes)
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("endstream`nendobj`n"))
  $offsets.Add($stream.Position)
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("5 0 obj`n<< /Type /XObject /Subtype /Image /Width $width /Height $height /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Interpolate true /Length $($jpegBytes.Length) >>`nstream`n"))
  $writer.Write($jpegBytes)
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("`nendstream`nendobj`n"))
  $xrefOffset = $stream.Position
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("xref`n0 6`n0000000000 65535 f `n"))
  foreach ($offset in $offsets) {
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes(("{0:0000000000} 00000 n `n" -f $offset)))
  }
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("trailer`n<< /Size 6 /Root 1 0 R >>`nstartxref`n$xrefOffset`n%%EOF`n"))
  $writer.Flush()
  [System.IO.File]::WriteAllBytes($pdfPath, $stream.ToArray())
  $writer.Dispose()
  $stream.Dispose()
  Remove-Item $jpegPath

  Write-Output "PNG: $pngPath"
  Write-Output "PDF: $pdfPath"
  Write-Output "PNG dimensions: $width x $height (300 dpi A4 landscape)"
}
finally {
  if ($graphics) { $graphics.Dispose() }
  if ($bitmap) { $bitmap.Dispose() }
}
