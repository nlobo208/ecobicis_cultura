# Busca fotos con licencia libre (Wikimedia Commons) para los hotspots que todavia no tienen, en 3 etapas.
#
# Uso:   powershell -ExecutionPolicy Bypass -File codigo\buscar_imagenes_lugares.ps1 -Etapa 1
#        (y despues -Etapa 2 y -Etapa 3). Se puede cortar y volver a correr: sigue donde quedo.
# Prueba corta: agregar -Max 20.  Reintentar los que no tuvieron foto: -Rehacer.
#
# Como reparte: toma los lugares sin foto (los 27 con foto de la primera tanda ya estan resueltos), los ordena por
# importancia (culturales primero, y dentro de cada grupo los mas cercanos a una estacion EcoBici) y los parte en 3 tramos
# iguales. La etapa 1 es la mas visible en la app; la 3, la menos.
#
# Criterio (precision antes que cantidad): una foto se acepta SOLO si
#   - su titulo en Commons nombra al lugar (palabras distintivas del nombre),
#   - tiene licencia libre (CC BY, CC BY-SA, CC0, dominio publico; se descartan NC y ND),
#   - es JPG/PNG de al menos 500 px de ancho y no es un mapa, logo, escudo ni placa.
# Los lugares sin foto que cumpla eso quedan sin imagen (la app ya lo soporta). No se inventa ni se usa una foto "parecida".
#
# Salidas (todo versionable en GitHub):
#   app/img/lugares/<id>_<nombre>.jpg      la foto, a 640 px de ancho
#   app/data/fotos_etapaN.js               datos que lee la app (autor, licencia, pagina de Commons)
#   app/img/lugares/CREDITOS.md            creditos (se agregan al final)
#   datasets_procesados/hotspots_imagenes_etapaN.csv
#   datasets_procesados/imagenes_progreso.json   que se probo y que resulto (para no repetir busquedas)
param(
  [Parameter(Mandatory = $true)][ValidateSet(1, 2, 3)][int]$Etapa,
  [int]$Max = 0,
  [int]$Ancho = 640,
  [switch]$Rehacer
)
$ErrorActionPreference = "Stop"
$Raiz = Split-Path -Parent $PSScriptRoot
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$UA = "Pedalito/1.0 (proyecto educativo de rutas culturales en bici; busqueda de fotos libres)"
$Carpeta = Join-Path $Raiz "app\img\lugares"
$ArchProgreso = Join-Path $Raiz "datasets_procesados\imagenes_progreso.json"

function Sin-Tildes([string]$t) {
  $d = $t.ToLowerInvariant().Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($c in $d.ToCharArray()) { if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($c) -ne "NonSpacingMark") { [void]$sb.Append($c) } }
  return $sb.ToString()
}
$Genericas = @("museo","teatro","centro","cultural","plaza","parque","casa","sala","galeria","biblioteca","cine","bar","cafe","restaurante",
  "club","fundacion","instituto","escuela","iglesia","basilica","catedral","paseo","jardin","feria","mercado","espacio","teatro","nacional",
  "ciudad","buenos","aires","argentina","general","gral","doctor","intendente","presidente","avenida","calle","oficial","antiguo","nuevo",
  "grande","anfiteatro","monumento","escultura","estatua","fuente","pizzeria","parrilla","confiteria","heladeria","cerveceria","bodegon")
$TiposLugar = @("feria","biblioteca","museo","teatro","cine","cafe","bar","galeria","iglesia","basilica","catedral","club","mercado","planetario","fundacion")
function Palabras([string]$t) { return ((Sin-Tildes $t) -split "[^a-z0-9]+" | Where-Object { $_.Length -ge 3 }) }
function Distintivas([string]$nombre) {
  $p = Palabras $nombre | Where-Object { $_.Length -ge 4 -and $Genericas -notcontains $_ } | Select-Object -Unique
  return @($p)
}
function Slug([string]$t) { $s = ((Sin-Tildes $t) -replace "[^a-z0-9]+", "_").Trim("_"); if ($s.Length -gt 40) { $s = $s.Substring(0, 40).Trim("_") }; return $s }

function Commons([string]$consulta) {
  for ($i = 1; $i -le 4; $i++) {
    try {
      $r = Invoke-WebRequest -Uri "https://commons.wikimedia.org/w/api.php?format=json&formatversion=2&$consulta" -UseBasicParsing -TimeoutSec 30 -UserAgent $UA
      Start-Sleep -Milliseconds 250
      return ($Utf8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json)
    } catch { Start-Sleep -Seconds (3 * $i) }
  }
  return $null
}
function Enc([string]$t) { return [uri]::EscapeDataString($t) }

$MalosTitulos = "plano|mapa|logo|escudo|bandera|flag|placa|plaque|cartel|poster|afiche|diagrama|interior de la estacion|subte|map\b|coat of arms|plan "
function Acepta-Licencia([string]$l) {
  if (-not $l) { return $false }
  if ($l -match "NC|ND") { return $false }
  return ($l -match "^(CC BY|CC0|Public domain|PD|Attribution)")
}
function Sin-Html([string]$t) { if (-not $t) { return "" }; return (([regex]::Replace($t, "<[^>]+>", "")) -replace "&amp;", "&" -replace "&quot;", '"' -replace "&#039;", "'" -replace "\s+", " ").Trim() }

function Buscar-Foto($lugar) {
  $dist = Distintivas $lugar.nombre
  if ($dist.Count -eq 0) { return $null }                    # nombre sin palabra distintiva: no se arriesga
  $tipos = @(Palabras $lugar.nombre | Where-Object { $TiposLugar -contains $_ } | Select-Object -Unique)
  $exigidas = @($dist) + $tipos                            # todas tienen que aparecer en el titulo de la foto
  $titulos = New-Object System.Collections.ArrayList
  $geo = Commons ("action=query&list=geosearch&gscoord=$($lugar.lat)|$($lugar.lon)&gsradius=150&gsnamespace=6&gslimit=30")
  foreach ($g in @($geo.query.geosearch)) { if ($g.title) { [void]$titulos.Add($g.title) } }
  $geoTitulos = @($titulos)
  $buenos = @($titulos | Where-Object { $t = $_; (@($exigidas | Where-Object { (Sin-Tildes $t) -match "(^|[^a-z0-9])$_([^a-z0-9]|$)" }).Count -eq $exigidas.Count) })
  if ($buenos.Count -eq 0) {
    $q = Commons ("action=query&list=search&srnamespace=6&srlimit=15&srsearch=" + (Enc ("$($lugar.nombre) Buenos Aires")))
    $titulos2 = @($q.query.search | ForEach-Object { $_.title })
    $buenos = @($titulos2 | Where-Object { $t = $_; (@($exigidas | Where-Object { (Sin-Tildes $t) -match "(^|[^a-z0-9])$_([^a-z0-9]|$)" }).Count -eq $exigidas.Count) })
  }
  $buenos = @($buenos | Where-Object { (Sin-Tildes $_) -notmatch $MalosTitulos } | Select-Object -First 8)
  if ($buenos.Count -eq 0) { return $null }
  $info = Commons ("action=query&prop=imageinfo|coordinates&colimit=50&iiprop=url|size|mime|extmetadata&iiurlwidth=$Ancho&titles=" + (Enc ($buenos -join "|")))
  $cands = @()
  foreach ($p in @($info.query.pages)) {
    $ii = @($p.imageinfo)[0]; if (-not $ii) { continue }
    if ($geoTitulos -notcontains $p.title) {   # vino de la busqueda por texto: tiene que estar geolocalizada a menos de 400 m
      $c = @($p.coordinates)[0]; if (-not $c) { continue }
      $dx = ($c.lon - $lugar.lon) * 92000; $dy = ($c.lat - $lugar.lat) * 111320
      if ([Math]::Sqrt($dx * $dx + $dy * $dy) -gt 400) { continue }
    }
    if ($ii.mime -notin @("image/jpeg", "image/png")) { continue }
    if ($ii.width -lt 500) { continue }
    $lic = [string]$ii.extmetadata.LicenseShortName.value
    if (-not (Acepta-Licencia $lic)) { continue }
    if (@($progreso.Values | Where-Object { $_.estado -eq "ok" -and $_.pagina -eq $ii.descriptionurl }).Count -gt 0) { continue }   # esa foto ya es de otro lugar
    $cands += [pscustomobject]@{ titulo = ($p.title -replace "^File:", ""); url = $ii.thumburl; pagina = $ii.descriptionurl; licencia = $lic
      autor = (Sin-Html ([string]$ii.extmetadata.Artist.value)); ancho = $ii.width; orden = [array]::IndexOf($buenos, $p.title) }
  }
  if ($cands.Count -eq 0) { return $null }
  return ($cands | Sort-Object @{e = { $_.orden } }, @{e = { $_.ancho }; Descending = $true } | Select-Object -First 1)
}

# ---------- lugares y reparto en etapas ----------
$js = [IO.File]::ReadAllText((Join-Path $Raiz "app\data\lugares.js"), $Utf8)
$lugares = [regex]::Matches($js, '(?m)^\{.*\},?$') | ForEach-Object { $_.Value.TrimEnd(",") | ConvertFrom-Json }
$conFoto = New-Object System.Collections.Generic.HashSet[int]
foreach ($m in [regex]::Matches([IO.File]::ReadAllText((Join-Path $Raiz "app\data\fotos.js"), $Utf8), '"(\d+)":\s*\{')) { [void]$conFoto.Add([int]$m.Groups[1].Value) }
$pend = @($lugares | Where-Object { -not $conFoto.Contains([int]$_.id) } |
  Sort-Object @{e = { if ($_.cultural) { 0 } else { 1 } } }, @{e = { [double]$_.dist_m } }, @{e = { [int]$_.id } })
$tam = [Math]::Ceiling($pend.Count / 3)
$deEtapa = @($pend | Select-Object -Skip (($Etapa - 1) * $tam) -First $tam)
Write-Host "Lugares sin foto: $($pend.Count). Etapa $Etapa = $($deEtapa.Count) lugares."

$progreso = @{}
if (Test-Path $ArchProgreso) {
  $o = [IO.File]::ReadAllText($ArchProgreso, $Utf8) | ConvertFrom-Json
  foreach ($p in $o.PSObject.Properties) { $progreso[$p.Name] = $p.Value }
}
function Guardar-Todo {
  [IO.File]::WriteAllText($ArchProgreso, ($progreso | ConvertTo-Json -Depth 5), $Utf8)
  # fotos_etapaN.js y el CSV se rehacen desde el progreso, solo con los ids de esta etapa
  $ids = $deEtapa | ForEach-Object { [string]$_.id }
  $ok = @($ids | Where-Object { $progreso.ContainsKey($_) -and $progreso[$_].estado -eq "ok" })
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine("// Fotos de los hotspots - etapa $Etapa (Wikimedia Commons, licencias libres). Generado con codigo/buscar_imagenes_lugares.ps1 (no editar a mano).")
  [void]$sb.AppendLine("window.PEDALITO_FOTOS = Object.assign(window.PEDALITO_FOTOS || {}, {")
  $filas = @()
  foreach ($id in $ok) {
    $f = $progreso[$id]
    $filas += "  `"$id`": " + (@{ archivo = $f.archivo; autor = $f.autor; licencia = $f.licencia; pagina = $f.pagina; titulo = $f.titulo } | ConvertTo-Json -Compress)
  }
  [void]$sb.AppendLine(($filas -join ",`n"))
  [void]$sb.AppendLine("});")
  [IO.File]::WriteAllText((Join-Path $Raiz "app\data\fotos_etapa$Etapa.js"), $sb.ToString(), $Utf8)
  $csv = @("ID,nombre,imagen_archivo,imagen_url,imagen_autor,imagen_licencia")
  foreach ($id in $ok) {
    $f = $progreso[$id]; $n = ($deEtapa | Where-Object { [string]$_.id -eq $id }).nombre
    $csv += ('{0},"{1}",{2},"{3}","{4}","{5}"' -f $id, ($n -replace '"', '""'), $f.archivo, $f.pagina, ($f.autor -replace '"', '""'), $f.licencia)
  }
  [IO.File]::WriteAllText((Join-Path $Raiz "datasets_procesados\hotspots_imagenes_etapa$Etapa.csv"), ($csv -join "`r`n") + "`r`n", (New-Object System.Text.UTF8Encoding($true)))
}

$hechos = 0; $conseguidas = 0
foreach ($l in $deEtapa) {
  $id = [string]$l.id
  if ($progreso.ContainsKey($id) -and -not ($Rehacer -and $progreso[$id].estado -eq "sin")) { continue }
  if ($Max -gt 0 -and $hechos -ge $Max) { break }
  $hechos++
  try { $f = Buscar-Foto $l } catch { Write-Host "  error en $($l.nombre): $($_.Exception.Message)"; $f = $null; Start-Sleep -Seconds 5 }
  $linea = "[{0}/{1}] {2} " -f $hechos, $deEtapa.Count, $l.nombre
  if ($f) {
    try {
      $ext = if ($f.url -match "\.png($|\?)") { "png" } else { "jpg" }
      $archivo = "{0}_{1}.{2}" -f $id, (Slug $l.nombre), $ext
      Invoke-WebRequest -Uri $f.url -OutFile (Join-Path $Carpeta $archivo) -UseBasicParsing -TimeoutSec 60 -UserAgent $UA
      Start-Sleep -Milliseconds 250
      $progreso[$id] = [pscustomobject]@{ estado = "ok"; archivo = $archivo; autor = $f.autor; licencia = $f.licencia; pagina = $f.pagina; titulo = $f.titulo }
      $conseguidas++; Write-Host ($linea + "-> $archivo")
      $cred = "| $id | $($l.nombre -replace '\|', '/') | $archivo | $($f.autor -replace '\|', '/') | [$($f.licencia)]($($f.pagina)) |"
      Add-Content -Path (Join-Path $Carpeta "CREDITOS.md") -Value $cred -Encoding UTF8
    } catch { Write-Host ($linea + "-> no se pudo descargar"); $progreso[$id] = [pscustomobject]@{ estado = "sin" } }
  } else {
    $progreso[$id] = [pscustomobject]@{ estado = "sin" }; Write-Host ($linea + "-> sin foto libre")
  }
  if ($hechos % 10 -eq 0) { Guardar-Todo }
}
Guardar-Todo
$tot = @($deEtapa | Where-Object { $progreso.ContainsKey([string]$_.id) -and $progreso[[string]$_.id].estado -eq "ok" }).Count
Write-Host "Etapa $Etapa lista: $tot fotos de $($deEtapa.Count) lugares ($conseguidas nuevas en esta corrida)."
