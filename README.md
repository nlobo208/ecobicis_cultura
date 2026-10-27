# Pedalito

Proyecto UdeSA · IA aplicada al diseño de productos digitales (K576, 2026)
Recorridos culturales en EcoBici por las comunas 1, 2, 4 y 14 de CABA.

**Integrantes:** Nicolás Lobo, Belén Moreno Crotto, Lisa Jakubavicius
**Sitio:** (link a Netlify)
**Captura:** (agregar en `entregas/`)

## Idea

Una app que arma un recorrido cultural en EcoBici según el tiempo que tenga la persona y sus gustos (museos, galerías, teatros, centros culturales, cafés y bares; mainstream o under). El recorrido incluye paradas intermedias, las estaciones donde retirar y devolver la bici, y tiene en cuenta el clima y los feriados. Se ofrece como alianza entre la Secretaría de Transporte, el Ministerio de Cultura y BA EcoBici.

## Hipótesis

En las comunas 1, 2, 4 y 14, las estaciones de EcoBici a menos de 300 m de un espacio cultural de exhibición o escénico tienen más viajes en fin de semana y feriados (y en la tarde-noche, con más ida y vuelta y más duración) que las estaciones sin espacio cultural cerca. Variable de control: ciclovía cercana.

**Lo que muestran los datos hasta ahora.** El 73,9 % de los 1.696 espacios culturales está a 300 m o menos de una estación (comuna 2: 90,3 %; comuna 1: 78,6 %; comuna 14: 56,8 %; comuna 4: 46,1 %). Esto prueba que la oferta está cerca de las estaciones, no que esa cercanía aumente los viajes. Para eso falta cruzarlo con los recorridos realizados.

## Fuentes de datos

Todos de BA Data (data.buenosaires.gob.ar), descargados el 2026-09-28 salvo que se indique otra fecha. Verificar y anotar la licencia de cada ficha antes de entregar. La ficha de Bicicletas Públicas indica licencia CC-BY-2.5-AR (citar a la Secretaría de Transporte y Obras Públicas, GCBA).

| Dataset | Estado | Uso | Link |
|---|---|---|---|
| Espacios culturales | Descargado y limpio. Sin comuna 3 ni calesitas | Oferta cultural (lat, lon, categoría) | https://data.buenosaires.gob.ar/dataset/espacios-culturales |
| Oferta gastronómica | Descargado y limpio (cafés, bares y restaurantes). Verificar fecha y link | Paradas intermedias | https://data.buenosaires.gob.ar/dataset/oferta-gastronomica |
| Estaciones de bicicletas públicas | Descargado y limpio (110 estaciones) | Ubicación de estaciones y cálculo de los 300 m | https://data.buenosaires.gob.ar/dataset/estaciones-bicicletas-publicas |
| Ciclovías | Descargado y recortado (980 tramos) | Variable de control y trazado de recorridos | https://data.buenosaires.gob.ar/dataset/ciclovias |
| Usuarios EcoBici 2024 | Descargado y limpio | Perfil (género, edad). No tiene viajes | https://data.buenosaires.gob.ar/dataset/bicicletas-publicas |
| Conteo de ciclistas 2013-2019 | Descargado | Contexto histórico | https://data.buenosaires.gob.ar/dataset/conteo-ciclistas |
| Recorridos realizados 2024 (zip) | FALTA (crítico, error 504) | Viajes por estación, fecha, hora y duración. Necesario para probar la hipótesis | https://data.buenosaires.gob.ar/dataset/bicicletas-publicas |
| Ferias y mercados | Opcional | Feria de artesanos como oferta cultural | https://data.buenosaires.gob.ar/dataset/ferias-mercados |
| Bicicleteros en vía pública | Opcional | Dónde dejar la bici cerca de cada espacio | https://data.buenosaires.gob.ar/dataset/bicicleteros-via-publica |
| EcoBici tiempo real (GBFS) | Opcional (V2) | Disponibilidad de bicis en la app | https://data.buenosaires.gob.ar/dataset/api-transporte-publico |
| Clima | Propuesto: Open-Meteo | Pronóstico del día | por confirmar |
| Feriados | FALTA | Calendario de feriados | por definir |

## Datos procesados

En `datasets_procesados/`. El detalle de cada columna está en [`datasets/diccionario.md`](datasets/diccionario.md).

| Archivo | Contenido |
|---|---|
| `hotspots_pedalito.xlsx` | Espacios culturales + gastronomía, comunas 1, 2, 4 y 14. 3.390 lugares |
| `hotspots_con_estacion_cercana.xlsx` | Lo mismo, con la estación más cercana, la distancia y si está a 300 m o menos |
| `estaciones_ecobici.xlsx` | 110 estaciones con tildes reparadas |
| `ciclovias_recortecomunas_pedalito.xlsx` | 980 tramos de ciclovía |

Las decisiones del proyecto, con fecha, están en [`decisiones.md`](decisiones.md).

## Cómo reproducir

1. Descargar los archivos pendientes en `datasets/` (si pesan más de 50 MB, no subirlos: anotar acá el link y la fecha de descarga).
2. `python codigo/limpiar_datasets.py`
3. `python codigo/cruce_estaciones_culturales.py`

## Seguridad

Las claves de API (Groq u otras) van como variables de entorno en Netlify. Nunca en el repo.

## El tech stack por capa:
• Diseño: Figma y FigJam, para el flujo y las pantallas.
• Datos: datasets abiertos de Buenos Aires Data en CSV y Excel, limpiados con scripts de Python (codigo/). Los procesados están en datasets_procesados/.
• Frontend (la app): HTML, CSS y JavaScript en la carpeta app/.
• Mapa: MapLibre + OpenFreeMap (recomendado, falta confirmarlo en equipo).
• Clima: Open-Meteo (recomendado).
• IA en tiempo real: Groq, un modelo de lenguaje que arma la propuesta de recorrido ✓.
• Backend: una Netlify Function (chat.js) que guarda la clave y llama a Groq ✓.
• Hosting: Netlify, que publica app/ con un link y se actualiza con cada push ✓.
• Control de versiones: Git + GitHub, en el repo de Nico ✓.
• Herramientas de desarrollo: VS Code, Claude Code y la terminal (PowerShell) ✓.
