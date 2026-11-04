# Convierte .env (en la raíz del repo) en app/env.js (window.PEDALITO_ENV) para que lo lea la app del navegador.
# Uso, desde la raíz del repo:   .\codigo\generar_env.ps1
#
# .env vive en la raíz y NO dentro de app/ porque Netlify publica toda la carpeta app/:
# un .env ahí sería descargable desde internet.
$raiz = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$entrada = Join-Path $raiz ".env"
if (-not (Test-Path $entrada)) { Write-Error "Falta .env en la raíz (copiá .env.example como .env)"; exit 1 }

# Variables que NUNCA van a env.js: env.js lo descarga cualquiera que abra la app.
# Estas solo las lee el servidor (la función de Netlify).
$soloServidor = @("GROQ_API_KEY", "GROQ_MODEL", "ECOBICI_CLIENT_ID", "ECOBICI_CLIENT_SECRET")

$valores = [ordered]@{}
foreach ($linea in Get-Content $entrada -Encoding UTF8) {
  if ($linea -match '^\s*#' -or $linea -notmatch '=') { continue }
  $clave, $valor = $linea -split '=', 2
  if ($soloServidor -contains $clave.Trim()) { continue }
  $valores[$clave.Trim()] = $valor.Trim()
}

$json = $valores | ConvertTo-Json
$js = "// Generado por codigo/generar_env.ps1 desde .env. No editar ni subir al repo.`nwindow.PEDALITO_ENV = $json;`n"
[IO.File]::WriteAllText((Join-Path $raiz "app\env.js"), $js, [Text.UTF8Encoding]::new($false))
Write-Host "app/env.js generado con $($valores.Count) variables."
