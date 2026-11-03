"""Genera app/data/lugares.js, los datos que usa la app.

Uso (desde la carpeta del repo):  python codigo/generar_lugares_app.py

Lee:
- datasets_procesados/hotspots_pedalito.xlsx: espacios culturales + gastronomía de las comunas 1, 2, 4 y 14
- datasets_procesados/estaciones_ecobici_pedalito.xlsx: las 110 estaciones EcoBici
- codigo/lugares_verificados.json: 30 lugares con horario verificado a mano, fuente e imagen
Calcula la estación más cercana a cada lugar y su distancia en línea recta.
Solo se cambia la capitalización de los nombres; no se inventa ningún dato.
"""
import json, math, re
from pathlib import Path
import pandas as pd

REPO = Path(__file__).resolve().parent.parent
hot = pd.read_excel(REPO / "datasets_procesados" / "hotspots_pedalito.xlsx")
hot = hot[hot["categoria"] != "CALESITA"]  # decisión del 17/10: las calesitas no entran
est = pd.read_excel(REPO / "datasets_procesados" / "estaciones_ecobici_pedalito.xlsx")
curados = json.loads((REPO / "codigo" / "lugares_verificados.json").read_text(encoding="utf-8"))
SALIDA = REPO / "app" / "data" / "lugares.js"

CATEGORIAS = {
    "ANFITEATRO": "Anfiteatro", "BAR": "Bar", "BIBLIOTECA": "Biblioteca", "CAFE": "Café",
    "CENTRO CULTURAL": "Centro cultural", "CLUB DE MUSICA EN VIVO": "Club de música en vivo",
    "CLUB DE MUSICA EN VIVO - NUEVO": "Club de música en vivo", "DISQUERIA": "Disquería",
    "ESPACIO DE FORMACION": "Espacio de formación", "ESPACIO FERIAL": "Espacio ferial",
    "GALERIA DE ARTE": "Galería de arte", "LIBRERIA": "Librería",
    "MONUMENTOS Y LUGARES HISTORICOS": "Monumentos y lugares históricos", "MUSEO": "Museo",
    "RESTAURANTE": "Restaurante", "SALA DE CINE": "Sala de cine", "SALA DE TEATRO": "Sala de teatro",
}
MENORES = {"de", "del", "la", "las", "los", "el", "y", "en", "e", "a", "al", "por", "con"}
SIGLAS = {"BA", "CABA", "GCBA", "UBA", "ANSES", "MALBA", "MAMBA", "MACBA", "CCK", "AMIA", "UCA", "UTN", "II", "III", "IV"}


def nombre_lindo(t):
    """'MUSEO DE ARTE (MACBA)' -> 'Museo de Arte (MACBA)'. Si ya tiene minúsculas, lo deja como está."""
    if not isinstance(t, str) or not t.strip():
        return ""
    if t != t.upper():
        return t.strip()
    palabras = []
    for i, p in enumerate(t.strip().split()):
        limpia = re.sub(r"[^\w]", "", p)
        if limpia in SIGLAS or (p.startswith("(") and p.endswith(")") and len(limpia) <= 6):
            palabras.append(p)
        elif i and p.lower() in MENORES:
            palabras.append(p.lower())
        else:
            palabras.append(p[:1] + p[1:].lower())
    return " ".join(palabras)


def texto(v):
    return v.strip() if isinstance(v, str) and v.strip() else None


def distancia_m(lat1, lon1, lat2, lon2):
    """Distancia en línea recta (fórmula de haversine), en metros."""
    rad = math.radians
    h = (math.sin(rad(lat2 - lat1) / 2) ** 2
         + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.sin(rad(lon2 - lon1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(h))


def estacion_cercana(lat, lon):
    return min((distancia_m(lat, lon, e.lat, e.lon), int(e.numero_estacion)) for e in est.itertuples())


lugares = []
for r in hot.itertuples():
    cultural = isinstance(r.grupo, str)  # True = espacio cultural (los 1.696 de la hipótesis)
    dist, numero = estacion_cercana(r.lat, r.lon)
    l = {
        # El ID se repite entre el dataset cultural y el gastronómico: a los gastronómicos se les suma 100000
        "id": int(r.ID) if cultural else 100000 + int(r.ID),
        "nombre": nombre_lindo(r.lugar_nombre),
        "categoria": CATEGORIAS[r.categoria],
        "cultural": cultural,
        "barrio": nombre_lindo(r.barrio),
        "comuna": int(r.comuna),
        "direccion": nombre_lindo((texto(r.direccion) or "").replace(", CABA", "")),
        "lat": round(float(r.lat), 6),
        "lon": round(float(r.lon), 6),
        "estacion": numero,
        "dist_m": round(dist),
    }
    if texto(r.horario):
        l["horario"] = texto(r.horario)
        l["fuente_horario"] = "declarado en BA Data, sin verificar"
    # Los 30 revisados a mano se reconocen por ID original + categoría + ubicación
    c = next((c for c in curados if c["id"] == int(r.ID) and c["categoria"] == l["categoria"]
              and abs(c["lat"] - l["lat"]) < 0.001 and abs(c["lon"] - l["lon"]) < 0.001), None)
    if c:
        for k in ("nombre", "horario", "cerrado", "fuente_horario", "url_fuente", "img"):
            if c.get(k):
                l[k] = c[k]
        l["verificado"] = True
    lugares.append(l)

estaciones = [{
    "numero": int(r.numero_estacion), "nombre": nombre_lindo(r.nombre),
    "barrio": nombre_lindo(r.barrio), "comuna": int(r.comuna),
    "lat": round(float(r.lat), 6), "lon": round(float(r.lon), 6),
} for r in est.itertuples()]

assert len([l for l in lugares if l.get("verificado")]) == len(curados), "No se encontraron los 30 lugares verificados"

culturales = [l for l in lugares if l["cultural"]]
cerca = sum(l["dist_m"] <= 300 for l in culturales)
with open(SALIDA, "w", encoding="utf-8") as f:
    f.write("// Generado con codigo/generar_lugares_app.py desde datasets_procesados (no editar a mano)\n")
    f.write(f"// {len(lugares)} lugares ({len(culturales)} culturales) y {len(estaciones)} estaciones EcoBici\n")
    f.write("window.PEDALITO_LUGARES = [\n" + ",\n".join(json.dumps(l, ensure_ascii=False) for l in lugares) + "\n];\n")
    f.write("window.PEDALITO_ESTACIONES = [\n" + ",\n".join(json.dumps(e, ensure_ascii=False) for e in estaciones) + "\n];\n")

print(f"{len(lugares)} lugares ({len(culturales)} culturales), {len(estaciones)} estaciones")
print(f"Culturales a 300 m o menos de una estación: {cerca} ({100 * cerca / len(culturales):.1f} %)")
