# Ecobicis-Cultura
Proyecto Udesa - IA Aplicada a Diseño
# Recorridos culturales en EcoBici (comunas 1, 2, 3, 4 y 14)

Integrantes: Nicolas Lobo, Belen Moreno Crotto, Lisa Jakubavicius
Sitio: (link a Netlify)
Captura: (agregar en entregas/)

## Idea
Una app que arma un recorrido cultural en EcoBici segun el tiempo que tenga la persona y sus gustos (museos, galerias, teatros, mainstream o under), con paradas intermedias, clima y feriados. Se ofrece como alianza entre la Secretaria de Transporte, el Ministerio de Cultura y BA EcoBici.

## Hipotesis
En las comunas 1, 2, 3, 4 y 14, las estaciones EcoBici a menos de 300 m de un espacio cultural de exhibicion o escenico tienen mas viajes en fin de semana y feriados (y en la tarde-noche, con mas ida y vuelta y mas duracion) que las estaciones sin espacio cultural cerca. Variable de control: ciclovia cercana.

## Fuentes de datos
Todos de BA Data (data.buenosaires.gob.ar), descargados el 2026-09-28 salvo que se indique otra fecha. Verificar y anotar la licencia de cada ficha antes de entregar. La ficha de Bicicletas Publicas indica licencia CC-BY-2.5-AR (citar a la Secretaria de Transporte y Obras Publicas, GCBA).

| Dataset | Estado | Uso | Link |
| Espacios culturales | Descargado y limpio | Oferta cultural (lat, lon, tipo) | https://data.buenosaires.gob.ar/dataset/espacios-culturales |
| Ciclovias | Descargado y limpio | Variable de control | https://data.buenosaires.gob.ar/dataset/ciclovias |
| Usuarios EcoBici 2024 | Descargado, limpio | Perfil (genero, edad). No tiene viajes | https://data.buenosaires.gob.ar/dataset/bicicletas-publicas |
| Conteo de ciclistas 2013-2019 | Descargado | Contexto historico | https://data.buenosaires.gob.ar/dataset/conteo-ciclistas |
| Estaciones de bicicletas publicas | Descargado | Ubicacion y capacidad de estaciones | https://data.buenosaires.gob.ar/dataset/estaciones-bicicletas-publicas |
| Recorridos realizados 2024 (zip) | FALTA (critico - error 504) | Viajes por estacion, fecha, hora, duracion | https://data.buenosaires.gob.ar/dataset/bicicletas-publicas |
| Ferias y mercados | Opcional | Feria de artesanos como oferta cultural | https://data.buenosaires.gob.ar/dataset/ferias-mercados |
| Bicicleteros en via publica | Opcional | Donde dejar la bici cerca de cada espacio | https://data.buenosaires.gob.ar/dataset/bicicleteros-via-publica |
| EcoBici tiempo real (GBFS) | Opcional (V2) | Disponibilidad de bicis en la app | https://data.buenosaires.gob.ar/dataset/api-transporte-publico |
| Feriados y clima | FALTA | Calendario y clima por dia | por definir |

## Como reproducir
1. Descargar los archivos pendientes en datasets/ (si pesan mas de 50 MB, no subirlos: anotar aca link y fecha de descarga).
2. `python codigo/limpiar_datasets.py`
3. `python codigo/cruce_estaciones_culturales.py`

## Seguridad
Las claves de API (Groq u otras) van como variables de entorno en Netlify. Nunca en el repo.
