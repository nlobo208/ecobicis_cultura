"""
Testea la hipotesis: estaciones EcoBici a <=300 m de un espacio cultural (exhibicion o escenico)
tienen mas viajes en fin de semana/feriados, tarde-noche, ida y vuelta y mayor duracion.

ANTES DE CORRER: bajar de BA Data y guardar en datasets/
  - estaciones (csv)  -> datasets/estaciones_bicicletas_publicas.csv
  - recorridos 2024   -> datasets/recorridos_realizados_2024.csv  (viene en zip, descomprimir)
Ajustar el bloque COLUMNAS si los nombres reales son distintos.
Uso: python codigo/cruce_estaciones_culturales.py
"""
import sys
import numpy as np
import pandas as pd

RADIO_M = 300
ESTACIONES = "datasets/estaciones_bicicletas_publicas.csv"
RECORRIDOS = "datasets/recorridos_realizados_2024.csv"
CULTURALES = "datasets_procesados/espacios_culturales__comunas_1_2_3_4_14_limpio.csv"
CICLOVIAS = "datasets_procesados/ciclovias__comunas_1_2_3_4_14.csv"

# ---- AJUSTAR SI HACE FALTA: nombre de columna en tus archivos ----
COLUMNAS = {
    "est_id": "id", "est_lat": "lat", "est_lon": "lon", "est_nombre": "nombre",
    "viaje_fecha_origen": "fecha_origen_recorrido", "viaje_est_origen": "id_estacion_origen",
    "viaje_est_destino": "id_estacion_destino", "viaje_duracion": "duracion_recorrido",  # segundos
}
# Feriados nacionales 2024 (completar/verificar contra argentina.gob.ar/interior/feriados-nacionales-2024)
FERIADOS = pd.to_datetime([
    "2024-01-01", "2024-02-12", "2024-02-13", "2024-03-24", "2024-03-28", "2024-03-29", "2024-04-01",
    "2024-04-02", "2024-05-01", "2024-05-25", "2024-06-17", "2024-06-20", "2024-06-21", "2024-07-09",
    "2024-08-17", "2024-10-11", "2024-11-18", "2024-12-08", "2024-12-25"]).normalize()

def metros(lat1, lon1, lat2, lon2):
    """Distancia aproximada en metros (valida para CABA)."""
    return np.hypot((lon1 - lon2) * 91000, (lat1 - lat2) * 111000)

def main():
    C = COLUMNAS
    est = pd.read_csv(ESTACIONES).rename(columns={C["est_id"]: "est_id", C["est_lat"]: "lat", C["est_lon"]: "lon",
                                                  C["est_nombre"]: "est_nombre"})
    cul = pd.read_csv(CULTURALES)
    ciclo = pd.read_csv(CICLOVIAS)

    # 1) comuna de cada estacion: comuna del vertice de ciclovia mas cercano (aprox.), y filtro a comunas foco
    import re
    pts, com = [], []
    for wkt, cm in zip(ciclo["geometria_wkt"], ciclo["comuna"]):
        for a, b in re.findall(r"(-?\d+\.\d+) (-?\d+\.\d+)", wkt):
            pts.append((float(a), float(b))); com.append(cm)
    pts, com = np.array(pts), np.array(com)
    est["comuna_aprox"] = [com[np.argmin(metros(r.lat, r.lon, pts[:, 1], pts[:, 0]))] for r in est.itertuples()]
    est["dist_ciclovia_m"] = [metros(r.lat, r.lon, pts[:, 1], pts[:, 0]).min() for r in est.itertuples()]
    est = est[est["comuna_aprox"].isin([1, 2, 3, 4, 14])].copy()

    # 2) cercania a espacio cultural del nucleo de la hipotesis
    nuc = cul[cul["nucleo_hipotesis"]]
    est["dist_cultural_m"] = [metros(r.lat, r.lon, nuc["lat"].values, nuc["lon"].values).min() for r in est.itertuples()]
    est["cerca_cultural"] = est["dist_cultural_m"] <= RADIO_M
    est["n_culturales_300m"] = [(metros(r.lat, r.lon, nuc["lat"].values, nuc["lon"].values) <= RADIO_M).sum()
                                for r in est.itertuples()]

    # 3) viajes por estacion de origen
    v = pd.read_csv(RECORRIDOS)
    v = v.rename(columns={C["viaje_fecha_origen"]: "fecha", C["viaje_est_origen"]: "est_id",
                          C["viaje_est_destino"]: "est_destino", C["viaje_duracion"]: "duracion_s"})
    v["fecha"] = pd.to_datetime(v["fecha"])
    v["es_finde_feriado"] = (v["fecha"].dt.dayofweek >= 5) | v["fecha"].dt.normalize().isin(FERIADOS)
    v["es_tarde_noche"] = v["fecha"].dt.hour >= 16
    v["ida_y_vuelta"] = v["est_id"] == v["est_destino"]
    g = v.groupby("est_id").agg(viajes=("fecha", "size"), prop_finde_feriado=("es_finde_feriado", "mean"),
                                prop_tarde_noche=("es_tarde_noche", "mean"), prop_ida_y_vuelta=("ida_y_vuelta", "mean"),
                                duracion_media_min=("duracion_s", lambda s: s.mean() / 60)).reset_index()
    tabla = est.merge(g, on="est_id", how="inner")
    tabla["ciclovia_a_150m"] = tabla["dist_ciclovia_m"] <= 150
    tabla.to_csv("datasets_procesados/estaciones_ecobici__uso_y_cercania_cultural.csv", index=False)

    # 4) comparacion de grupos (dentro de cada comuna y total)
    cols = ["viajes", "prop_finde_feriado", "prop_tarde_noche", "prop_ida_y_vuelta", "duracion_media_min"]
    print(tabla.groupby("cerca_cultural")[cols].mean().round(3))
    print(tabla.groupby(["comuna_aprox", "cerca_cultural"])[cols].mean().round(3))
    try:
        from scipy.stats import mannwhitneyu
        for c in cols[1:]:
            a, b = tabla.loc[tabla.cerca_cultural, c].dropna(), tabla.loc[~tabla.cerca_cultural, c].dropna()
            if len(a) > 2 and len(b) > 2:
                print(c, "p =", round(mannwhitneyu(a, b).pvalue, 4))
    except ImportError:
        print("Instalar scipy para obtener p-valores: pip install scipy")

if __name__ == "__main__":
    main()
