# Diccionario de datos

Ultima actualizacion: 2026-09-28. Los archivos de esta carpeta son los originales tal como se descargaron (no modificar).

## espacios-culturales__1_.xlsx (original) y espacios_culturales__comunas_1_2_3_4_14_limpio.csv (procesado)
Fuente: BA Data, dataset de espacios culturales de CABA. Una fila = un espacio (el original repite filas por sala o pabellon).

| Columna procesada | Significado | Unidad / valores |
|---|---|---|
| id_original | fid del archivo original | numero |
| nombre | nombre del establecimiento | texto sin tildes |
| funcion_principal | tipo de espacio | MUSEO, GALERIA DE ARTE, SALA DE TEATRO, etc. |
| subcategoria | detalle del tipo | texto |
| grupo | agrupacion propia para el analisis | exhibicion, escenico, patrimonio_feria, complementario |
| nucleo_hipotesis | True si grupo es exhibicion o escenico | True/False |
| comuna, barrio | ubicacion administrativa | 1, 2, 3, 4, 14 |
| direccion | calle y altura | texto |
| lat, lon | coordenadas | grados decimales (WGS84) |
| cantidad_salas, capacidad_total | datos de sala | numero (muchos vacios) |
| web | sitio del espacio | texto |
| n_filas_mismo_lugar | cuantas filas originales se juntaron en esta | numero |
| dist_ciclovia_m | distancia a la ciclovia mas cercana | metros (aproximada) |
| ciclovia_a_150m | True si hay ciclovia a 150 m o menos | True/False |

Filtros aplicados: solo comunas 1, 2, 3, 4 y 14; se sacaron 10 librerias "online" sin direccion fisica; se sacaron 5 filas con coordenadas faltantes o fuera de CABA (una tenia longitud -5.83, un error de carga); se unieron 16 filas repetidas del mismo lugar; se corrigieron tildes rotas.
Agrupacion (decision propia, cambiar en `codigo/limpiar_datasets.py`, diccionario GRUPOS): exhibicion = museo, galeria, centro cultural; escenico = teatro, cine, musica en vivo, anfiteatro; patrimonio_feria = monumentos y espacios feriales; complementario = bibliotecas, librerias, bares, disquerias, formacion, calesitas.

## ciclovias.xlsx (original) y ciclovias__comunas_1_2_3_4_14.csv (procesado)
Fuente: BA Data, ciclovias. Una fila = un tramo.

| Columna | Significado | Unidad |
|---|---|---|
| id | id del tramo | numero |
| nombre | calle | texto |
| tipo | Ciclovias o Ciclovias mano unica | texto |
| comuna, barrio | ubicacion | numero, texto |
| longitud_m | largo del tramo | metros |
| geometria_wkt | trazado (LINESTRING lon lat) | WKT |

Filtro aplicado: comunas 1, 2, 3, 4 y 14.

## usuarios_ecobici_2024.xlsx (original) y usuarios_ecobici_2024__edad_filtrada.csv (procesado)
Fuente: BA Data, Bicicletas Publicas, altas de usuarios 2024 (1 de enero al 8 de octubre de 2024). IMPORTANTE: es el registro de altas, no de viajes. No tiene estacion ni recorrido.

| Columna | Significado | Unidad / valores |
|---|---|---|
| ID_usuario | id del usuario | numero |
| genero_usuario | genero declarado | varon, mujer, otro |
| edad_usuario | edad al registrarse | anios |
| tiene_dni | si cargo DNI | Yes/No |
| fecha_alta, mes_alta | dia y mes del alta | fecha, AAAA-MM |

Filtros aplicados: se sacaron 65 usuarios con edad menor a 16 o mayor a 90 (errores de carga, habia edades de 1 y de 961). Se saco la hora de alta. Resumen por genero y edad en usuarios_ecobici_2024__resumen_genero_edad.csv.

## Conteo-cicilistas.xlsx (original) y conteo_ciclistas__numerico.csv (procesado)
Fuente: GCBA, conteo de ciclistas 2013 a 2019. Solo 7 filas. Los numeros venian con punto de miles y como texto; se convirtieron a enteros. Columnas: anio, viajes_diarios, viajes_anuales. Sirve como contexto historico (crecimiento del uso), no para cruzar.

## Pendientes de descarga (ver readme.md)
estaciones_bicicletas_publicas.csv y recorridos_realizados_2024.csv (cuando se descarguen, documentar aca sus columnas).

## EcoBici en tiempo real (feed GBFS v3.0) · fuente en vivo, no se guarda como archivo
Fuente: feed público de EcoBici de la Ciudad, sin claves. Protocolo: https://gbfs.org/documentation/reference/
- `https://buenosaires.publicbikesystem.net/customer/gbfs/v3.0/station_status` (se actualiza cada ~20 s): por estación, `num_vehicles_available` (bicis), `num_docks_available` (anclajes libres), `num_vehicles_disabled`, `is_installed`, `is_renting`, `is_returning`.
- `https://buenosaires.publicbikesystem.net/customer/gbfs/v3.0/station_information`: `station_id`, `name` (lista por idioma, con el número adelante: "002 - Retiro I"), `lat`, `lon`, `capacity`.
- Cruce: `station_id` es el número oficial de la estación, el mismo que `numero` en estaciones_ecobici_pedalito.xlsx. El feed trae 392 estaciones; la app usa las 110 de las comunas 1, 2, 4 y 14. Al probarlo (16/11/2026), 4 de las 110 no figuraban en el feed (63 Reconquista, 172 Brasil, 108 Usina del Arte, 341 Comuna 4): para esas la app muestra la estimación.
- Cómo se usa: netlify/functions/ecobici.mjs pide el feed desde el servidor (el feed no manda el encabezado CORS) y app/js/disponibilidad.js lo asocia a cada estación.

## barrios.geojson (original) · límites de los barrios de CABA
Fuente: BA Data, Barrios (https://data.buenosaires.gob.ar/dataset/barrios), descargado el 16/11/2026 de https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-educacion/barrios/barrios.geojson. Sistema de coordenadas CRS84 (lon, lat).
48 barrios (polígonos). Campos: id, objeto, nombre (sin tildes, "La Boca" y "Nueva Pompeya" con ese nombre), comuna (1 a 15), perimetro_, area_metro.
Uso: se recorta a los 12 barrios que cubre la herramienta (Palermo, Recoleta, Retiro, San Nicolás, Puerto Madero, Monserrat, San Telmo, Constitución, La Boca, Barracas, Parque Patricios, Nueva Pompeya) y se genera app/data/zona_barrios.js. La app pinta de gris desaturado lo que queda fuera de esos barrios (sin datos) y usa el recorte para validar el punto de salida. Las 110 estaciones usadas caen dentro; de los 3.390 lugares, 2 quedan justo afuera del borde.
