<#
  Pedalito · recolección con IA de fichas y actividades culturales (Groq + búsqueda en la web)

  La IA busca, redacta y cita la fuente. NUNCA publica: todo sale como borrador y lo revisa una persona.

  Uso (desde la raíz del repo):
    ./codigo/recolectar_actividades.ps1 -Modo fichas                 # ficha de cada uno de los 30 hotspots  → app/data/fichas.js
    ./codigo/recolectar_actividades.ps1 -Modo enriquecer             # completa las actividades ya cargadas   → app/data/actividades.js
    ./codigo/recolectar_actividades.ps1 -Modo actividades            # busca las actividades del mes siguiente → borrador
    ./codigo/recolectar_actividades.ps1 -Modo actividades -Mes 2026-12
  Pruebas: -Solo 2568,2989 (ids de lugares)  ·  -Max 3 (cantidad de lugares o actividades)

  Necesita GROQ_API_KEY (variable de entorno, o en el archivo .env de la raíz). Funciona con Windows PowerShell 5.1 y con PowerShell 7.
  En GitHub se corre solo el día 15 de cada mes: ver .github/workflows/actividades-mensual.yml
#>
param(
  [ValidateSet("fichas", "enriquecer", "actividades")][string]$Modo = "actividades",
  [string]$Mes = "",
  [int]$Max = 0,
  [string]$Solo = "",
  [switch]$Rehacer,
  [switch]$Buscar,              # fichas: usar siempre la búsqueda web (más lento y de más gasto) en lugar de Wikipedia
  [int]$PausaSegundos = 75      # entre búsquedas: el plan gratuito de Groq permite ~8.000 tokens por minuto y cada búsqueda web usa varios miles
)
$ErrorActionPreference = "Stop"
$Raiz = Split-Path -Parent $PSScriptRoot
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Modelo = if ($env:GROQ_MODEL_BUSQUEDA) { $env:GROQ_MODEL_BUSQUEDA } else { "openai/gpt-oss-120b" }   # modelo de Groq con búsqueda en la web
$Hoy = (Get-Date).ToString("yyyy-MM-dd")
$MESES = "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
$TIPOS = "muestra", "ciclo", "festival", "feria", "temporada", "obra", "concierto", "visita", "otro"

# ---------- Clave ----------
$Clave = $env:GROQ_API_KEY
if (-not $Clave -and (Test-Path "$Raiz/.env")) {
  $linea = Get-Content "$Raiz/.env" -Encoding UTF8 | Where-Object { $_ -match "^GROQ_API_KEY=" } | Select-Object -First 1
  if ($linea) { $Clave = ($linea -replace "^GROQ_API_KEY=", "").Trim().Trim('"') }
}
if (-not $Clave) { throw "Falta GROQ_API_KEY (variable de entorno o archivo .env en la raíz)." }

# ---------- Utilidades ----------
function Escribir([string]$ruta, [string]$texto) { [IO.File]::WriteAllText($ruta, $texto, $Utf8) }
function Leer([string]$ruta) { [IO.File]::ReadAllText($ruta, $Utf8) }

function Texto($v, [int]$largo = 600) {
  if ($null -eq $v) { return $null }
  $t = ([string]$v -replace "【[^】]*】", "" -replace "\s+", " ").Trim()
  if (-not $t -or $t -match "^(null|n/?a|sin dato|no (se )?(encontr|informa|disponible).*)$") { return $null }
  if ($t.Length -gt $largo) { $t = $t.Substring(0, $largo - 1).TrimEnd() + "…" }
  return $t
}
function Lista($v, [int]$max = 6) {
  $salida = @()
  foreach ($x in @($v)) { $t = Texto $x 120; if ($t) { $salida += $t } }
  return , @($salida | Select-Object -First $max)
}
function Url($v) { $t = Texto $v 400; if ($t -and $t -match "^https?://") { return $t } return $null }
function Fecha($v) { $t = Texto $v 20; if ($t -and $t -match "^\d{4}-\d{2}-\d{2}$") { return $t } return $null }
function Hora($v) { $t = Texto $v 10; if ($t -and $t -match "^\d{1,2}:\d{2}$") { return $t.PadLeft(5, "0") } return $null }

function UrlViva([string]$url) {
  if (-not $url) { return $false }
  try {
    $r = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 20 -UseBasicParsing -UserAgent "Mozilla/5.0 (Pedalito verificador de enlaces)"
    return ([int]$r.StatusCode -lt 400)
  } catch { return $false }
}

# ---------- Groq con búsqueda en la web ----------
function Llamar-Groq([string]$prompt, [bool]$conBusqueda = $true) {
  if ($env:PEDALITO_RESPUESTA_FALSA) { return (Get-Content $env:PEDALITO_RESPUESTA_FALSA -Raw -Encoding UTF8) }   # solo para pruebas del flujo, sin gastar cupo
  $pedido = @{
    model = $Modelo; temperature = 0.2; max_completion_tokens = 3500; reasoning_effort = "low"   # razonamiento corto: ahorra tokens
    messages = @(@{ role = "user"; content = $prompt })
  }
  # Con búsqueda web cada llamada puede gastar ~100.000 tokens (el plan gratuito de Groq da ~8.000 por minuto); sin búsqueda, ~3.000
  if ($conBusqueda) { $pedido.tools = @(@{ type = "browser_search" }); $pedido.tool_choice = "auto" }
  $cuerpo = $pedido | ConvertTo-Json -Depth 8
  $bytes = $Utf8.GetBytes($cuerpo)
  for ($intento = 1; $intento -le 6; $intento++) {
    try {
      $r = Invoke-WebRequest -Uri "https://api.groq.com/openai/v1/chat/completions" -Method Post -UseBasicParsing -TimeoutSec 240 `
        -Headers @{ Authorization = "Bearer $Clave" } -ContentType "application/json; charset=utf-8" -Body $bytes
      $j = $Utf8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
      Write-Host ("   tokens usados: " + $j.usage.total_tokens)
      return [string]$j.choices[0].message.content
    } catch {
      if ($intento -eq 6) { throw }
      $espera = 65                                        # 429 = límite de tokens por minuto: se espera lo que pide Groq (o 65 s)
      try { $ra = $_.Exception.Response.Headers["Retry-After"]; if ($ra) { $espera = [Math]::Max(5, [int][Math]::Ceiling([double]$ra) + 2) } } catch { }
      if ($espera -gt 900) { throw "LIMITE_DIARIO: Groq pide esperar $espera s (se agotó el cupo del día). Se guarda lo hecho; volvé a correr mañana o pasá a un plan con más cupo." }
      Write-Host "   (reintento ${intento}: espera ${espera} s - $($_.Exception.Message))"
      Start-Sleep -Seconds $espera
    }
  }
}

# ---------- Wikipedia y Wikidata (datos fijos de un lugar: rápidos, citables y casi sin gasto de IA) ----------
function Get-Json([string]$url) {
  $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 -UserAgent "Pedalito/1.0 (proyecto educativo; recolector de fichas culturales)"
  return ($Utf8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json)
}
function Wikipedia-Datos([string]$nombre) {
  try {
    $limpio = ($nombre -replace "\s*\([^)]*\)", "").Trim()
    $q = [uri]::EscapeDataString("$limpio Buenos Aires")
    $busq = Get-Json "https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=$q&srlimit=3&format=json"
    # Palabras que distinguen al lugar (sin acentos ni palabras genéricas): todas tienen que aparecer en el título de la página
    $sinAcentos = { param($s) ([string]$s).Normalize([Text.NormalizationForm]::FormD) -replace "\p{Mn}", "" }
    $genericas = "centro", "cultural", "museo", "teatro", "galeria", "palacio", "fundacion", "feria", "club", "casa", "de", "del", "la", "el", "los", "las", "y", "en", "nacional", "plaza", "sala", "espacio", "arte"
    $claves = @((& $sinAcentos $limpio).ToLower() -split "[^a-z0-9]+" | Where-Object { $_.Length -gt 1 -and $genericas -notcontains $_ })
    if (-not $claves.Count) { $claves = @((& $sinAcentos $limpio).ToLower() -split "[^a-z0-9]+" | Where-Object { $_.Length -gt 1 }) }
    foreach ($h in @($busq.query.search)) {
      $titulo = (& $sinAcentos $h.title).ToLower()
      $palabrasTitulo = @($titulo -split "[^a-z0-9]+")                       # palabra completa: "ciencia" no vale como "ciencias"
      if (@($claves | Where-Object { $palabrasTitulo -notcontains $_ }).Count) { continue }
      $res = Get-Json ("https://es.wikipedia.org/api/rest_v1/page/summary/" + [uri]::EscapeDataString(($h.title -replace " ", "_")))
      $texto = [string]$res.extract
      if ($texto.Length -lt 200 -or $texto -notmatch "Buenos Aires|Argentina|porte") { continue }       # que sea de acá y tenga contenido
      $datos = [ordered]@{ texto = $texto; url_wiki = [string]$res.content_urls.desktop.page; web = $null; fundacion = $null }
      if ($res.wikibase_item) {
        try {
          $e = (Get-Json "https://www.wikidata.org/wiki/Special:EntityData/$($res.wikibase_item).json").entities.($res.wikibase_item)
          $web = $e.claims.P856; if ($web) { $datos.web = [string]$web[0].mainsnak.datavalue.value }
          $ini = $e.claims.P571; if ($ini) { $datos.fundacion = ([string]$ini[0].mainsnak.datavalue.value.time).TrimStart("+").Substring(0, 10) }
        } catch { }
      }
      return $datos
    }
  } catch { }
  return $null
}

function Extraer-Json([string]$texto, [string]$abre, [string]$cierra) {
  $t = $texto -replace "【[^】]*】", "" -replace '(?s)```json|```', ""
  $a = $t.IndexOf($abre); $z = $t.LastIndexOf($cierra)
  if ($a -lt 0 -or $z -le $a) { return $null }
  try { return ($t.Substring($a, $z - $a + 1) | ConvertFrom-Json) } catch { return $null }
}

# ---------- Datos de la app ----------
function Leer-JsAsignacion([string]$ruta) {                 # "window.X = <json>;" → objeto
  if (-not (Test-Path $ruta)) { return $null }
  $t = Leer $ruta
  $i = $t.IndexOf("=")
  return ($t.Substring($i + 1).Trim().TrimEnd(";") | ConvertFrom-Json)
}
function Hotspots {                                          # los 30 hotspots = lugares con horario verificado
  $lineas = (Leer "$Raiz/app/data/lugares.js") -split "`n" | Where-Object { $_ -match '^\{"id":' -and $_ -match '"verificado": true' }
  $lista = @($lineas | ForEach-Object { $_.Trim().TrimEnd(",") | ConvertFrom-Json })
  if ($Solo) { $ids = $Solo -split "," | ForEach-Object { [int]$_ }; $lista = @($lista | Where-Object { $ids -contains $_.id }) }
  if ($Max -gt 0) { $lista = @($lista | Select-Object -First $Max) }
  return , $lista
}

$ESTILO = "Español rioplatense, tono cercano y que invite a ir, sin exagerar. No inventes: si no encontrás un dato en una fuente, ponelo en null. No incluyas marcas de cita ni notas fuera del JSON."

# ====================================================================================================
if ($Modo -eq "fichas") {
  $ruta = "$Raiz/app/data/fichas.js"
  $fichas = [ordered]@{}
  $previo = Leer-JsAsignacion $ruta
  if ($previo) { $previo.PSObject.Properties | ForEach-Object { $fichas[$_.Name] = $_.Value } }
  $lugares = Hotspots
  # Se guarda después de cada ficha: si el proceso se corta (cupo diario, cierre de la compu), lo hecho no se pierde y al volver a correr sigue donde quedó
  $guardar = {
    $json = $fichas | ConvertTo-Json -Depth 6
    Escribir $ruta ("// Fichas de los 30 hotspots: síntesis, referentes, antigüedad, dato curioso y enlace oficial.`n// Las genera codigo/recolectar_actividades.ps1 (Wikipedia/Wikidata o búsqueda web con IA) como BORRADOR (verificado: false).`n// Una persona las revisa y pone verificado: true; esas ya no se pisan al volver a correr el script.`nwindow.PEDALITO_FICHAS = $json;`n")
  }
  $n = 0
  foreach ($l in $lugares) {
    $n++
    if ($fichas["$($l.id)"] -and $fichas["$($l.id)"].verificado) { Write-Host "[$n/$($lugares.Count)] $($l.nombre): ya verificada por una persona, se respeta"; continue }
    if (-not $Rehacer -and $fichas["$($l.id)"] -and $fichas["$($l.id)"].sinopsis) { Write-Host "[$n/$($lugares.Count)] $($l.nombre): ya tiene ficha, se salta (-Rehacer para rehacerla)"; continue }
    Write-Host "[$n/$($lugares.Count)] $($l.nombre)"
    try {
      $wiki = if ($Buscar) { $null } else { Wikipedia-Datos $l.nombre }
      if ($wiki) {
        # Camino barato: se arma la ficha SOLO con el texto de Wikipedia y los datos de Wikidata (la IA no agrega nada de memoria)
        Write-Host "   fuente: $($wiki.url_wiki)"
        $resp = Llamar-Groq @"
Sos investigador cultural de Pedalito, una app de recorridos culturales en bici por la Ciudad de Buenos Aires.
Con SOLO la información de abajo (no uses otros conocimientos ni inventes), armá la ficha de «$($l.nombre)» ($($l.categoria), $($l.barrio)).
TEXTO DE WIKIPEDIA: $($wiki.texto)
DATOS DE WIKIDATA: fecha de fundación o inauguración: $(if ($wiki.fundacion) { $wiki.fundacion } else { "sin dato" }).
Respondé SOLO un objeto JSON:
{"sinopsis":"2 frases que cuenten qué se ve o se vive ahí y por qué vale la pena ir",
 "referentes":["personas o instituciones clave que aparezcan en el texto: artistas, arquitecto, fundador (máximo 5)"],
 "desde":"desde cuándo existe, con año, por ejemplo 'Inaugurado en 1908'",
 "dato_curioso":"una frase con un dato curioso que figure en el texto"}
$ESTILO
"@ $false
        $j = Extraer-Json $resp "{" "}"
        if ($j) { $j | Add-Member -NotePropertyName url_oficial -NotePropertyValue $wiki.web -Force; $j | Add-Member -NotePropertyName fuentes -NotePropertyValue @($wiki.url_wiki, $wiki.web) -Force }
      } else {
        Write-Host "   sin página en Wikipedia: búsqueda web (gasta más cupo)"
        $resp = Llamar-Groq @"
Sos investigador cultural de Pedalito, una app de recorridos culturales en bici por la Ciudad de Buenos Aires.
Buscá en la web información CONFIABLE sobre «$($l.nombre)» ($($l.categoria), $($l.direccion), $($l.barrio), Buenos Aires). Priorizá su sitio oficial. Hacé pocas búsquedas y abrí como máximo 2 páginas.
Respondé SOLO un objeto JSON con estas claves:
{"sinopsis":"2 frases que cuenten qué se ve o se vive ahí y por qué vale la pena ir",
 "referentes":["personas o instituciones clave: artistas, arquitecto, fundador, compañías estables (máximo 5)"],
 "desde":"desde cuándo existe, con año, por ejemplo 'Inaugurado en 1908'",
 "dato_curioso":"una frase con un dato curioso verificable",
 "url_oficial":"https://sitio-oficial",
 "fuentes":["urls que usaste"]}
$ESTILO
"@
        $j = Extraer-Json $resp "{" "}"
      }
      if (-not $j) { Write-Host "   sin respuesta válida, se salta"; continue }
      $url = Url $j.url_oficial
      $fichas["$($l.id)"] = [ordered]@{
        sinopsis = Texto $j.sinopsis 500; referentes = Lista $j.referentes 5; desde = Texto $j.desde 120; dato_curioso = Texto $j.dato_curioso 300
        url_oficial = $url; url_ok = (UrlViva $url); fuentes = Lista ($j.fuentes | ForEach-Object { Url $_ }) 4
        verificado = $false; generado = $Hoy
      }
      & $guardar
    } catch { Write-Host "   falló: $($_.Exception.Message)"; if ($_.Exception.Message -like "LIMITE_DIARIO*") { break } }
    Start-Sleep -Seconds $PausaSegundos
  }
  & $guardar
  Write-Host "Listo: $($fichas.Count) fichas en app/data/fichas.js"
  return
}

# ====================================================================================================
if ($Modo -eq "enriquecer") {
  $ruta = "$Raiz/app/data/actividades.js"
  $acts = @(Leer-JsAsignacion $ruta)
  $guardar = {                                                # se guarda después de cada actividad (ver la nota de las fichas)
    $json = ConvertTo-Json -InputObject @($acts) -Depth 6 -Compress
    Escribir $ruta ("// Actividades de noviembre 2026. Base: datasets_procesados/actividades_noviembre_2026_pedalito.xlsx (hoja actividades). Estado 'propuesta': verificar antes de publicar.`n// Los campos sinopsis, artistas, trayectoria, dato_curioso, url_oficial y fuentes los completa codigo/recolectar_actividades.ps1 (IA) como borrador: ficha_verificada: false hasta que una persona los revise.`nwindow.PEDALITO_ACTIVIDADES = $json;`n")
  }
  $n = 0; $cambios = 0
  foreach ($a in $acts) {
    $n++
    if ($Max -gt 0 -and $n -gt $Max) { break }
    if ($a.sinopsis) { continue }
    Write-Host "[$n/$($acts.Count)] $($a.nombre) · $($a.lugar)"
    try {
      $resp = Llamar-Groq @"
Sos investigador cultural de Pedalito (app de recorridos culturales en bici por Buenos Aires).
Buscá en la web información CONFIABLE sobre la actividad «$($a.nombre)» ($($a.tipo)) en «$($a.lugar)», Buenos Aires, vigente en noviembre de 2026. Priorizá el sitio oficial del lugar. Hacé pocas búsquedas y abrí como máximo 2 páginas.
Respondé SOLO un objeto JSON:
{"sinopsis":"2 a 3 frases que cuenten qué van a ver o vivir",
 "artistas":["artistas, curadores o elencos involucrados (máximo 6)"],
 "trayectoria":"hace cuánto se realiza o desde cuándo está en cartel, o si es una edición/estreno",
 "dato_curioso":"una frase con un dato curioso verificable",
 "url_oficial":"https://enlace-con-mas-informacion",
 "fuentes":["urls que usaste"]}
$ESTILO
"@
      $j = Extraer-Json $resp "{" "}"
      if (-not $j) { Write-Host "   sin respuesta válida, se salta"; continue }
      $url = Url $j.url_oficial
      $extra = [ordered]@{ sinopsis = Texto $j.sinopsis 500; artistas = Lista $j.artistas 6; trayectoria = Texto $j.trayectoria 200; dato_curioso = Texto $j.dato_curioso 300
        url_oficial = $url; url_ok = (UrlViva $url); fuentes = Lista ($j.fuentes | ForEach-Object { Url $_ }) 4; ficha_generada = $Hoy; ficha_verificada = $false }
      foreach ($k in $extra.Keys) { $a | Add-Member -NotePropertyName $k -NotePropertyValue $extra[$k] -Force }
      $cambios++
      & $guardar
    } catch { Write-Host "   falló: $($_.Exception.Message)"; if ($_.Exception.Message -like "LIMITE_DIARIO*") { break } }
    Start-Sleep -Seconds $PausaSegundos
  }
  & $guardar
  Write-Host "Listo: $cambios actividades completadas en app/data/actividades.js"
  return
}

# ====================================================================================================
# Modo actividades: busca las actividades del mes siguiente en los 30 hotspots y deja un BORRADOR para revisar
if (-not $Mes) { $Mes = (Get-Date).AddMonths(1).ToString("yyyy-MM") }
if ($Mes -notmatch "^\d{4}-\d{2}$") { throw "Mes con formato AAAA-MM, por ejemplo 2026-12." }
$anio = [int]$Mes.Substring(0, 4); $mesNum = [int]$Mes.Substring(5, 2)
$nombreMes = "$($MESES[$mesNum - 1]) de $anio"
$primero = "$Mes-01"; $ultimo = (Get-Date -Year $anio -Month $mesNum -Day 1).AddMonths(1).AddDays(-1).ToString("yyyy-MM-dd")
$sufijo = "{0}_{1:00}" -f $anio, $mesNum

# Para no repetir lo que ya está cargado
$existentes = @()
$existentes += @(Leer-JsAsignacion "$Raiz/app/data/actividades.js")
Get-ChildItem "$Raiz/app/data" -Filter "actividades_*.js" -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.Name -ne "actividades_$sufijo.js") { $t = (Leer $_.FullName); $i = $t.IndexOf("concat("); if ($i -ge 0) { $existentes += @(($t.Substring($i + 7).Trim().TrimEnd(";").TrimEnd(")")) | ConvertFrom-Json) } }
}
$norm = { param($s) ([string]$s).ToLower() -replace "[^a-z0-9áéíóúñ]", "" }
$yaEstan = @{}
foreach ($e in $existentes) { if ($e) { $yaEstan[(& $norm "$($e.lugar_id)|$($e.nombre)")] = $true } }

$lugares = Hotspots
$nuevas = New-Object System.Collections.ArrayList
$dudas = New-Object System.Collections.ArrayList
$k = 0
foreach ($l in $lugares) {
  $k++
  Write-Host "[$k/$($lugares.Count)] $($l.nombre)"
  try {
    $resp = Llamar-Groq @"
Sos investigador cultural de Pedalito (app de recorridos culturales en bici por Buenos Aires).
Buscá en la web, preferentemente en el sitio oficial de «$($l.nombre)» ($($l.direccion), $($l.barrio)), las actividades culturales vigentes en ese lugar durante $nombreMes (entre $primero y $ultimo): muestras, ciclos, temporadas de obras, conciertos, festivales, ferias o visitas guiadas especiales. Elegí hasta 4, las más atractivas. Hacé pocas búsquedas y abrí como máximo 3 páginas.
Respondé SOLO un arreglo JSON (vacío [] si no encontrás nada confiable):
[{"nombre":"título exacto",
  "tipo":"uno de: $($TIPOS -join ', ')",
  "desde":"AAAA-MM-DD o null","hasta":"AAAA-MM-DD o null",
  "dias":"días en que se puede ir, por ejemplo 'miércoles a domingo'","abre":"HH:MM o null","cierra":"HH:MM o null",
  "precio":"texto corto, por ejemplo 'Gratis' o '\$8.000', o null",
  "sinopsis":"2 a 3 frases sobre qué van a ver o vivir",
  "artistas":["artistas, curadores o elencos (máximo 6)"],
  "trayectoria":"hace cuánto se realiza o desde cuándo está en cartel",
  "dato_curioso":"una frase con un dato curioso verificable",
  "url_oficial":"https://enlace-de-la-actividad",
  "fuentes":["urls que usaste"],
  "obs":"dudas: fechas que no coinciden entre fuentes, datos sin confirmar, etc., o null"}]
$ESTILO
"@
    $arr = Extraer-Json $resp "[" "]"
    if ($null -eq $arr) { [void]$dudas.Add("**$($l.nombre)**: la IA no devolvió un resultado legible."); continue }
    foreach ($x in @($arr)) {
      $nombre = Texto $x.nombre 140
      if (-not $nombre) { continue }
      $clave = & $norm "$($l.id)|$nombre"
      if ($yaEstan.ContainsKey($clave)) { continue }
      $url = Url $x.url_oficial
      $fuentes = Lista ($x.fuentes | ForEach-Object { Url $_ }) 4
      if (-not $url -and -not $fuentes.Count) { [void]$dudas.Add("**$nombre** ($($l.nombre)): sin enlace de fuente, se descartó."); continue }
      $desde = Fecha $x.desde; $hasta = Fecha $x.hasta
      if (($hasta -and $hasta -lt $primero) -or ($desde -and $desde -gt $ultimo)) { [void]$dudas.Add("**$nombre** ($($l.nombre)): no cae en $nombreMes ($desde a $hasta), se descartó."); continue }
      $tipo = (Texto $x.tipo 20); if ($tipo) { $tipo = $tipo.ToLower() }; if ($TIPOS -notcontains $tipo) { $tipo = "otro" }
      $ok = UrlViva ($(if ($url) { $url } else { $fuentes[0] }))
      $obs = Texto $x.obs 300
      if (-not $ok) { $obs = (@($obs, "El enlace no respondió al revisarlo") | Where-Object { $_ }) -join ". " }
      if (-not $desde -and -not $hasta) { $obs = (@($obs, "Sin fechas informadas") | Where-Object { $_ }) -join ". " }
      $yaEstan[$clave] = $true
      [void]$nuevas.Add([ordered]@{
        nombre = $nombre; tipo = $tipo; lugar_id = $l.id; lugar = $l.nombre; lat = $l.lat; lon = $l.lon; barrio = $l.barrio.ToUpper()
        desde = $desde; hasta = $hasta; dias = Texto $x.dias 80; abre = Hora $x.abre; cierra = Hora $x.cierra; precio = Texto $x.precio 60
        sinopsis = Texto $x.sinopsis 500; artistas = Lista $x.artistas 6; trayectoria = Texto $x.trayectoria 200; dato_curioso = Texto $x.dato_curioso 300
        url_oficial = $url; url_ok = $ok; fuentes = $fuentes; estado = "borrador"; ficha_generada = $Hoy; ficha_verificada = $false; obs = $obs })
      if ($obs) { [void]$dudas.Add("**$nombre** ($($l.nombre)): $obs") }
    }
  } catch { [void]$dudas.Add("**$($l.nombre)**: falló la búsqueda ($($_.Exception.Message))."); Write-Host "   falló: $($_.Exception.Message)"; if ($_.Exception.Message -like "LIMITE_DIARIO*") { [void]$dudas.Add("Se agotó el cupo diario de Groq: faltan lugares por buscar (desde **$($l.nombre)**). Volvé a correr el flujo mañana."); break } }
  Start-Sleep -Seconds $PausaSegundos
}

$i = 0
foreach ($a in $nuevas) { $i++; $a["id"] = "ACT-{0}-{1:00}-{2:000}" -f $anio, $mesNum, $i }
$lista = @($nuevas | ForEach-Object { $o = [ordered]@{ id = $_["id"] }; foreach ($c in $_.Keys) { if ($c -ne "id") { $o[$c] = $_[$c] } }; $o })

Escribir "$Raiz/datasets_procesados/actividades_$sufijo.json" ((ConvertTo-Json -InputObject $lista -Depth 6) + "`n")
$jsLista = ConvertTo-Json -InputObject $lista -Depth 6 -Compress
Escribir "$Raiz/app/data/actividades_$sufijo.js" ("// Actividades de $nombreMes, BORRADOR generado por IA (codigo/recolectar_actividades.ps1) el $Hoy.`n// La app no muestra las de estado 'borrador': una persona las revisa y pasa cada una a 'propuesta' o 'verificada'.`nwindow.PEDALITO_ACTIVIDADES = (window.PEDALITO_ACTIVIDADES || []).concat($jsLista);`n")

# Índice de meses que carga la app
$rutaMeses = "$Raiz/app/data/meses.js"
$meses = @(); if (Test-Path $rutaMeses) { $meses = @(Leer-JsAsignacion $rutaMeses) }
if ($meses -notcontains $sufijo) { $meses += $sufijo }
Escribir $rutaMeses ("// Meses con archivo de actividades (app/data/actividades_AAAA_MM.js). Lo actualiza codigo/recolectar_actividades.ps1.`nwindow.PEDALITO_MESES = " + (ConvertTo-Json -InputObject @($meses) -Compress) + ";`n")

# Informe para quien revisa (también es el texto del Pull Request)
$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine("## Actividades de $nombreMes (borrador de la IA)")
[void]$md.AppendLine("")
[void]$md.AppendLine("Generado el $Hoy con $Modelo + búsqueda web. **$($nuevas.Count) actividades** en $($lugares.Count) lugares. Todas quedan en estado ``borrador``: la app no las muestra hasta que una persona las revise.")
[void]$md.AppendLine("")
[void]$md.AppendLine("### Cómo revisar")
[void]$md.AppendLine("1. Abrí ``datasets_procesados/actividades_$sufijo.json`` (o ``app/data/actividades_$sufijo.js``).")
[void]$md.AppendLine("2. Por cada actividad, entrá al enlace de ``url_oficial`` y confirmá fechas, horario, precio y los textos (sinopsis, artistas, trayectoria, dato curioso).")
[void]$md.AppendLine("3. Corregí lo que haga falta y cambiá ``estado`` a ``propuesta`` (publicable con la etiqueta *a confirmar*) o ``verificada``; poné ``ficha_verificada: true``.")
[void]$md.AppendLine("4. Borrá las que no correspondan. Cuando termines, hacé merge: Netlify publica solo.")
[void]$md.AppendLine("")
[void]$md.AppendLine("### Actividades encontradas")
[void]$md.AppendLine("| Lugar | Actividad | Tipo | Fechas | Enlace |")
[void]$md.AppendLine("|---|---|---|---|---|")
foreach ($a in $lista) { [void]$md.AppendLine("| $($a.lugar) | $($a.nombre) | $($a.tipo) | $(if ($a.desde -or $a.hasta) { "$($a.desde) → $($a.hasta)" } else { "sin fechas" }) | $(if ($a.url_oficial) { "[$(if ($a.url_ok) { 'ok' } else { 'no responde' })]($($a.url_oficial))" } else { "sin enlace" }) |") }
[void]$md.AppendLine("")
[void]$md.AppendLine("### Dudas para mirar primero")
if ($dudas.Count) { foreach ($d in $dudas) { [void]$md.AppendLine("- $d") } } else { [void]$md.AppendLine("- Ninguna detectada automáticamente.") }
Escribir "$Raiz/datasets_procesados/informe_actividades_$sufijo.md" $md.ToString()

Write-Host "Listo: $($nuevas.Count) actividades de $nombreMes → app/data/actividades_$sufijo.js e informe_actividades_$sufijo.md"
