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
