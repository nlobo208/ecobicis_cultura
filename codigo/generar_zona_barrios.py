"""Pedalito · recorte territorial por barrios.

Lee el GeoJSON oficial de barrios de la Ciudad (BA Data: https://data.buenosaires.gob.ar/dataset/barrios),
se queda con los 12 barrios que cubre la herramienta y genera:
  - app/data/zona_barrios.js         → límite real que dibuja la app (window.PEDALITO_ZONA)
  - entregas/entrega_4/mapa_zona.svg → mapa del recorte para el racional y la presentación

Uso (desde la raíz del repo):
    python codigo/generar_zona_barrios.py datasets/barrios.geojson

Solo usa la biblioteca estándar de Python. No inventa geometría: si falta algún barrio, lo avisa y sigue.
"""
import json
import math
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
# Nombre en la app → cómo puede venir en el dataset (sin tildes y en mayúsculas)
BARRIOS = {
    "Palermo": "PALERMO", "Recoleta": "RECOLETA", "Retiro": "RETIRO", "San Nicolás": "SAN NICOLAS",
    "Puerto Madero": "PUERTO MADERO", "Monserrat": "MONSERRAT", "San Telmo": "SAN TELMO",
    "Constitución": "CONSTITUCION", "La Boca": "BOCA", "Barracas": "BARRACAS",
    "Parque Patricios": "PARQUE PATRICIOS", "Nueva Pompeya": "NUEVA POMPEYA",
}
CAMPOS_NOMBRE = ["nombre", "NOMBRE", "barrio", "BARRIO", "Barrio"]
CAMPOS_COMUNA = ["comuna", "COMUNA", "Comuna"]


def normalizar(texto):
    t = unicodedata.normalize("NFD", str(texto)).encode("ascii", "ignore").decode().upper().strip()
    return "BOCA" if t == "LA BOCA" else t


def redondear(coords):
    """Redondea a 5 decimales (≈1 m), suficiente para dibujar y mucho más liviano."""
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 5), round(coords[1], 5)]
    return [redondear(c) for c in coords]


def anillos(geom):
    pols = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    return [anillo for pol in pols for anillo in pol]


def svg_zona(features, destino):
    """Mapa simple en proyección equirectangular corregida por latitud (alcanza para una zona chica)."""
    puntos = [p for f in features for a in anillos(f["geometry"]) for p in a]
    lat0 = sum(p[1] for p in puntos) / len(puntos)
    k = math.cos(math.radians(lat0))
    xs = [p[0] * k for p in puntos]
    ys = [p[1] for p in puntos]
    ancho, margen = 900, 40
    escala = (ancho - 2 * margen) / (max(xs) - min(xs))
    alto = round((max(ys) - min(ys)) * escala + 2 * margen)
    px = lambda p: (margen + (p[0] * k - min(xs)) * escala, margen + (max(ys) - p[1]) * escala)
    partes = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ancho} {alto}" font-family="Inter, sans-serif">',
              f'<rect width="{ancho}" height="{alto}" fill="#fffcfa"/>']
    for f in features:
        d = " ".join("M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in map(px, a)) + " Z" for a in anillos(f["geometry"]))
        partes.append(f'<path d="{d}" fill="#203ae9" fill-opacity=".08" stroke="#092957" stroke-width="1.5" fill-rule="evenodd"/>')
    for f in features:                       # etiqueta en el promedio de los vértices del anillo exterior
        a = anillos(f["geometry"])[0]
        x, y = px((sum(p[0] for p in a) / len(a), sum(p[1] for p in a) / len(a)))
        partes.append(f'<text x="{x:.0f}" y="{y:.0f}" font-size="15" font-weight="700" fill="#092957" text-anchor="middle">{f["properties"]["nombre"]}</text>')
    partes.append(f'<text x="{margen}" y="{alto - 12}" font-size="12" fill="#092957" opacity=".7">'
                  'Fuente: Barrios, BA Data (Gobierno de la Ciudad de Buenos Aires). Elaboración propia.</text></svg>')
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text("\n".join(partes), encoding="utf-8")


def main():
    origen = Path(sys.argv[1] if len(sys.argv) > 1 else RAIZ / "datasets" / "barrios.geojson")
    datos = json.loads(origen.read_text(encoding="utf-8"))
    buscados = {v: k for k, v in BARRIOS.items()}
    elegidos = []
    for f in datos["features"]:
        props = f.get("properties") or {}
        nombre_ds = next((props[c] for c in CAMPOS_NOMBRE if c in props), None)
        if nombre_ds is None or normalizar(nombre_ds) not in buscados:
            continue
        comuna = next((props[c] for c in CAMPOS_COMUNA if c in props), None)
        elegidos.append({"type": "Feature",
                         "properties": {"nombre": buscados[normalizar(nombre_ds)], "comuna": comuna},
                         "geometry": {"type": f["geometry"]["type"], "coordinates": redondear(f["geometry"]["coordinates"])}})
    faltan = sorted(set(BARRIOS) - {f["properties"]["nombre"] for f in elegidos})
    if faltan:
        print("ATENCIÓN: no se encontraron en el dataset:", ", ".join(faltan))
    zona = {"type": "FeatureCollection", "features": elegidos}
    js = RAIZ / "app" / "data" / "zona_barrios.js"
    js.write_text("// Generado con codigo/generar_zona_barrios.py desde el dataset oficial de barrios de BA Data (no editar a mano)\n"
                  f"window.PEDALITO_ZONA = {json.dumps(zona, ensure_ascii=False, separators=(',', ':'))};\n", encoding="utf-8")
    svg_zona(elegidos, RAIZ / "entregas" / "entrega_4" / "mapa_zona.svg")
    print(f"{len(elegidos)} barrios → {js.relative_to(RAIZ)} y entregas/entrega_4/mapa_zona.svg")


if __name__ == "__main__":
    main()
