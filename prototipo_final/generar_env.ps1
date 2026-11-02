# Convierte .env en env.js (window.PEDALITO_ENV) para que lo lea la app del navegador.
# Uso, desde la carpeta prototipo_final:   .\generar_env.ps1
$aca = Split-Path -Parent $MyInvocation.MyCommand.Path
$entrada = Join-Path $aca ".env"
if (-not (Test-Path $entrada)) { Write-Error "Falta .env (copiá .env.example como .env)"; exit 1 }

# Variables que NUNCA van a env.js: env.js lo descarga cualquiera que abra la app.
# Estas solo las lee el servidor (la función de Netlify).
$soloServidor = @("GROQ_API_KEY", "GROQ_MODEL")

$valores = [ordered]@{}
foreach ($linea in Get-Content $entrada -Encoding UTF8) {
  if ($linea -match '^\s*#' -or $linea -notmatch '=') { continue }
  $clave, $valor = $linea -split '=', 2
  if ($soloServidor -contains $clave.Trim()) { continue }
  $valores[$clave.Trim()] = $valor.Trim()
}

$json = $valores | ConvertTo-Json
$js = "// Generado por generar_env.ps1 desde .env. No editar ni subir al repo.`nwindow.PEDALITO_ENV = $json;`n"
[IO.File]::WriteAllText((Join-Path $aca "env.js"), $js, [Text.UTF8Encoding]::new($false))
Write-Host "env.js generado con $($valores.Count) variables."
