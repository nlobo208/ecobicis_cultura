"""
Limpia y recorta los datasets originales de datasets/ y guarda el resultado en datasets_procesados/.
Uso (desde la raiz del proyecto):  python codigo/limpiar_datasets.py
Requiere: pandas, openpyxl
"""
import re
import unicodedata
import numpy as np
import pandas as pd

COMUNAS_FOCO = [1, 2, 3, 4, 14]
DIR_IN, DIR_OUT = "datasets/", "datasets_procesados/"

# ---------- 1. ESPACIOS CULTURALES ----------
def arreglar_texto(s):
    """Corrige tildes rotas (ej. 'SAN JOSÃ‰' -> 'SAN JOSE') y saca acentos."""
    if not isinstance(s, str):
        return s
    try:
        s = s.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return s.strip()

GRUPOS = {
    "MUSEO": "exhibicion", "GALERIA DE ARTE": "exhibicion", "CENTRO CULTURAL": "exhibicion",
    "SALA DE TEATRO": "escenico", "CLUB DE MUSICA EN VIVO": "escenico",
    "CLUB DE MUSICA EN VIVO - NUEVO": "escenico", "SALA DE CINE": "escenico", "ANFITEATRO": "escenico",
    "MONUMENTOS Y LUGARES HISTORICOS": "patrimonio_feria", "ESPACIO FERIAL": "patrimonio_feria",
    "BIBLIOTECA": "complementario", "LIBRERIA": "complementario", "BAR": "complementario",
    "DISQUERIA": "complementario", "ESPACIO DE FORMACION": "complementario", "CALESITA": "complementario",
}

e = pd.read_excel(DIR_IN + "espacios-culturales__1_.xlsx")
n0 = len(e)
for c in ["FUNCION_PRINCIPAL", "SUBCATEGORIA", "ESTABLECIMIENTO", "SALA", "CALLE", "BARRIO", "DIRECCION"]:
    e[c] = e[c].map(arreglar_texto)
e["comuna"] = e["COMUNA"].str.extract(r"(\d+)").astype(float)
log = {"filas_originales": n0}

e = e[e["comuna"].isin(COMUNAS_FOCO)]
log["en_comunas_foco"] = len(e)
e = e[~e["DIRECCION"].fillna("").str.upper().eq("ONLINE")]
log["sin_online"] = len(e)
# coordenadas validas dentro de CABA (lat -34.71..-34.52, lon -58.54..-58.33)
ok = e["LATITUD"].between(-34.71, -34.52) & e["LONGITUD"].between(-58.54, -58.33)
log["descartadas_coord_invalidas_o_faltantes"] = int((~ok).sum())
e = e[ok].copy()
# una fila por establecimiento y punto (varias filas son salas/pabellones del mismo lugar)
e["n_filas_mismo_lugar"] = e.groupby(["ESTABLECIMIENTO", "LATITUD", "LONGITUD", "FUNCION_PRINCIPAL"])["fid"].transform("count")
e = e.drop_duplicates(["ESTABLECIMIENTO", "LATITUD", "LONGITUD", "FUNCION_PRINCIPAL"])
log["tras_deduplicar"] = len(e)

e["grupo"] = e["FUNCION_PRINCIPAL"].map(GRUPOS).fillna("otro")
e["nucleo_hipotesis"] = e["grupo"].isin(["exhibicion", "escenico"])
out = e.rename(columns={"fid": "id_original", "FUNCION_PRINCIPAL": "funcion_principal", "SUBCATEGORIA": "subcategoria",
                        "ESTABLECIMIENTO": "nombre", "BARRIO": "barrio", "DIRECCION": "direccion",
                        "LATITUD": "lat", "LONGITUD": "lon", "CAPACIDAD_TOTAL": "capacidad_total",
                        "CANTIDAD_SALAS": "cantidad_salas", "WEB": "web"})
out["comuna"] = out["comuna"].astype(int)
cols = ["id_original", "nombre", "funcion_principal", "subcategoria", "grupo", "nucleo_hipotesis",
        "comuna", "barrio", "direccion", "lat", "lon", "cantidad_salas", "capacidad_total", "web", "n_filas_mismo_lugar"]
out = out[cols].copy()

# ---------- 2. CICLOVIAS ----------
c = pd.read_excel(DIR_IN + "ciclovias.xlsx")
c["nombre"] = c["nombre"].map(arreglar_texto)
c["barrio"] = c["barrio"].map(arreglar_texto)
c = c[c["comuna"].isin(COMUNAS_FOCO)].copy()

def coords(wkt):
    pares = re.findall(r"(-?\d+\.\d+) (-?\d+\.\d+)", wkt)
    return [(float(a), float(b)) for a, b in pares]  # (lon, lat)
c["puntos"] = c["geometry"].map(coords)
c = c[c["puntos"].map(len) >= 2]
c = c.rename(columns={"geometry": "geometria_wkt"})

def densificar(pts, paso_m=25):
    """Agrega puntos intermedios cada ~25 m para medir distancias a la ciclovia sin librerias GIS."""
    res = []
    for (x1, y1), (x2, y2) in zip(pts[:-1], pts[1:]):
        d = np.hypot((x2 - x1) * 91000, (y2 - y1) * 111000)
        k = max(int(d // paso_m), 1)
        for t in np.linspace(0, 1, k, endpoint=False):
            res.append((x1 + (x2 - x1) * t, y1 + (y2 - y1) * t))
    res.append(pts[-1])
    return res

pts_c = np.array([p for lst in c["puntos"] for p in densificar(lst)])  # lon, lat
c_out = c[["id", "nombre", "tipo", "comuna", "barrio", "longitud_m", "geometria_wkt"]]

# ---------- 3. CRUCE: cada espacio cultural vs ciclovia mas cercana ----------
def dist_min_m(lat, lon):
    dx = (pts_c[:, 0] - lon) * 91000   # ~metros por grado de longitud en CABA
    dy = (pts_c[:, 1] - lat) * 111000
    return float(np.sqrt(dx * dx + dy * dy).min())

out["dist_ciclovia_m"] = out.apply(lambda r: round(dist_min_m(r["lat"], r["lon"]), 0), axis=1)
out["ciclovia_a_150m"] = out["dist_ciclovia_m"] <= 150

# ---------- 4. USUARIOS ECOBICI 2024 (altas de usuario) ----------
u = pd.read_excel(DIR_IN + "usuarios_ecobici_2024.xlsx")
u = u.rename(columns={"Customer.Has.Dni..Yes...No.": "tiene_dni"})
log["usuarios_originales"] = len(u)
u = u[u["edad_usuario"].between(16, 90)].copy()   # edades <16 o >90 son errores de carga
log["usuarios_tras_filtro_edad_16_90"] = len(u)
u["genero_usuario"] = u["genero_usuario"].str.lower().map({"male": "varon", "female": "mujer", "other": "otro"})
u["edad_usuario"] = u["edad_usuario"].astype(int)
u["mes_alta"] = pd.to_datetime(u["fecha_alta"]).dt.to_period("M").astype(str)
u["fecha_alta"] = pd.to_datetime(u["fecha_alta"]).dt.date
u = u.drop(columns=["hora_alta"])

res_u = (u.groupby(["genero_usuario", pd.cut(u["edad_usuario"], [15, 24, 34, 44, 54, 90],
         labels=["16-24", "25-34", "35-44", "45-54", "55+"])], observed=True).size().reset_index(name="altas"))

# ---------- 5. CONTEO CICLISTAS (contexto historico) ----------
k = pd.read_excel(DIR_IN + "Conteo-cicilistas.xlsx")
k.columns = ["anio", "viajes_diarios", "viajes_anuales"]
for col in ["viajes_diarios", "viajes_anuales"]:
    k[col] = k[col].astype(str).str.replace(".", "", regex=False).astype(int)

# ---------- GUARDAR ----------
out.to_csv(DIR_OUT + "espacios_culturales__comunas_1_2_3_4_14_limpio.csv", index=False, encoding="utf-8")
c_out.to_csv(DIR_OUT + "ciclovias__comunas_1_2_3_4_14.csv", index=False, encoding="utf-8")
u.to_csv(DIR_OUT + "usuarios_ecobici_2024__edad_filtrada.csv", index=False, encoding="utf-8")
res_u.to_csv(DIR_OUT + "usuarios_ecobici_2024__resumen_genero_edad.csv", index=False, encoding="utf-8")
k.to_csv(DIR_OUT + "conteo_ciclistas__numerico.csv", index=False, encoding="utf-8")

print(log)
print(out["grupo"].value_counts().to_string())
print("nucleo_hipotesis:", int(out["nucleo_hipotesis"].sum()))
print(out.groupby("comuna")["nucleo_hipotesis"].agg(["size", "sum"]))
print("con ciclovia a 150m (nucleo):", round(out[out.nucleo_hipotesis]["ciclovia_a_150m"].mean(), 3))
print(k)
