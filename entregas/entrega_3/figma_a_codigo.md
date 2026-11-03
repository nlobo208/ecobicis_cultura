# Del Figma al código · Entrega 3

Cómo pasamos el prototipo de Figma (archivo "Pedalito · prototipo Lisa", sección **Mobile 2.0**, 12 pantallas de 390 × 844) a la app publicada en `app/`.

## 1. Qué se leyó del diseño con un agente de IA

Usamos Claude con el conector oficial de Figma (Figma MCP) en modo lectura.

- **Estructura:** el agente listó las 3 secciones del archivo (Mobile v1, Web y Mobile 2.0) y sus 32 pantallas. Elegimos Mobile 2.0 por ser la más reciente y la más completa.
- **Estilos:** colores, tipografía (Inter), tamaños de letra, radios de borde, alturas de botones y chips, y espaciados de cada pantalla. Se pasaron a variables CSS en `app/estilos.css` (`--fondo`, `--tinta`, `--celeste`, `--violeta`, `--azul`, `--radio`).
- **Imágenes:** el logo y 3 fotos (MALBA, Museo Nacional de Arte Decorativo y Centro Cultural Recoleta) se exportaron como capturas, porque el enlace de descarga de los archivos originales devolvía error.
- **Revisión del diseño:** el agente detectó que el archivo no tiene componentes ni variables (cada chip y botón está dibujado aparte) y que conviven 3 paletas distintas.

## 2. Qué se programó y cómo

- **Con asistencia de IA (Claude Code en VS Code):** las 7 pantallas en HTML, CSS y JavaScript sin frameworks, la navegación entre pantallas, el filtrado de lugares, el cálculo de distancias, la conexión con Groq a través de una función de Netlify, el clima y el mapa.
- **A mano (el equipo):** la elección de pantallas y de cambios, la revisión de textos, la prueba de la clave de Groq desde la terminal y la subida al repo.
- **Generado con un script:** los datos de la app (`app/data/lugares.js`) salen de `codigo/generar_lugares_app.py`, que lee los datasets procesados.

## 3. Pantallas implementadas

| Figma Mobile 2.0 | App | Estado |
|---|---|---|
| 02 Intereses | `#intereses` | Igual, con los 16 chips de categorías |
| 03 Home | `#inicio` | Igual, con clima real y link a "Cómo funciona" |
| 04 Explorar | `#explorar` | Igual, con buscador y filtros |
| 11 Detalle de lugar | `#lugar` | Sin puntuación; con distancias calculadas y estado del horario |
| 05 Planificar | `#planificar` | Cambia el modo (ver abajo) |
| 06 Recorrido | `#recorrido` | Mapa real y propuesta de la IA |
| 09 Perfil | `#perfil` | Solo datos reales: km, salidas, lugares visitados |
| (no existe) | `#sobre` | Nueva: hipótesis, cálculos, rol de la IA y limitaciones |

Las pantallas de bienvenida, registro, estaciones paso a paso y llegada no se implementaron en esta entrega.

## 4. Decisiones tomadas fuera de Figma, en el código

- **Estados de carga y error:** "Pensando tu recorrido…" mientras responde la IA; "Clima no disponible" si falla Open-Meteo; propuesta sin IA si falla Groq. En Figma no había estados.
- **Responsive:** la app ocupa todo el ancho en el celular y se muestra como una columna centrada de 430 px en la computadora.
- **Accesibilidad:** el gris de los textos secundarios se oscureció (de #6b6e6b a #5f625f) para que se lea mejor, y los chips miden al menos 44 px de alto para tocarlos con el dedo.
- **Etiquetas de origen:** "Dato calculado" (celeste) y "Sugerido por IA" (violeta), para distinguir lo que sale de los datos de lo que propone la IA.
- **Lista larga:** Explorar muestra los 50 lugares más cercanos de un total de más de 3.000; el resto se encuentra con el buscador.

## 5. Diferencias con el diseño original y por qué

| En Figma | En la app | Por qué |
|---|---|---|
| Botón de la barra "Salir" | "Pedalear" | "Salir" se confundía con cerrar sesión |
| Tarjeta "Modo" a medio completar | Dos modos: "Sin destino" y "Con destino" | Completa una decisión que el diseño dejaba abierta |
| Puntuaciones con estrellas | No se muestran | No tenemos datos reales de puntuación y no inventamos datos |
| Mapa abstracto | Mapa real (MapLibre + OpenFreeMap) | Lo pidieron los docentes en la Entrega 2 |
| Sin clima | Clima real en Inicio, que también se le pasa a la IA | Es parte de la hipótesis del producto |
| Sección "Tendencias" con contenido | "Próximamente" | No hay datos de uso propios todavía |
| Fotos en todos los lugares | Foto en 3 lugares; el resto muestra la categoría | No hay fotos con licencia para los 3.390 lugares |
| Trazado por calles | Línea recta punteada, con la aclaración "Trazado aproximado" | El trazado por calles necesita otro servicio con clave |

## 6. Qué falta del lado del diseño

- Convertir chips, botones, tarjetas y barra de navegación en componentes de Figma.
- Unificar la paleta en una sola.
- Exportar el logo en SVG (el de la app es una captura de baja resolución).
- Actualizar Mobile 2.0 con los cambios de la tabla de arriba, para que diseño y app coincidan.
