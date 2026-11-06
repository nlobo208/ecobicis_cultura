// Pedalito · zona que cubre la herramienta (12 barrios)
// El límite real sale del dataset oficial de barrios de BA Data (data.buenosaires.gob.ar/dataset/barrios),
// recortado con codigo/generar_zona_barrios.py → data/zona_barrios.js (window.PEDALITO_ZONA).
// Si ese archivo todavía no está, la app sigue funcionando: no dibuja el borde y usa la regla anterior
// (punto a menos de 2 km de una estación EcoBici).

(function () {
  // Nombres como los usa la app (los del dataset vienen en mayúsculas y sin tildes)
  const BARRIOS = ["Palermo", "Recoleta", "Retiro", "San Nicolás", "Puerto Madero", "Monserrat", "San Telmo",
    "Constitución", "La Boca", "Barracas", "Parque Patricios", "Nueva Pompeya"];
  const zona = window.PEDALITO_ZONA || null;

  /** Punto dentro de un anillo (ray casting). anillo = [[lon, lat], …] */
  function enAnillo(lon, lat, anillo) {
    let dentro = false;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  }
  const enPoligono = (lon, lat, pol) => enAnillo(lon, lat, pol[0]) && !pol.slice(1).some(h => enAnillo(lon, lat, h));
  const poligonos = g => g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];

  /** Barrio de la zona que contiene el punto, o null si queda afuera (o si no hay límite cargado). */
  function barrioDe(p) {
    if (!zona) return null;
    const f = zona.features.find(f => poligonos(f.geometry).some(pol => enPoligono(p.lon, p.lat, pol)));
    return f ? f.properties.nombre : null;
  }

  /** Dibuja el límite en un mapa MapLibre: relleno muy suave adentro y borde punteado. */
  function dibujar(mapa) {
    if (!zona || !mapa) return;
    const agregar = () => {
      if (mapa.getSource("zona")) return;
      mapa.addSource("zona", { type: "geojson", data: zona });
      const primera = mapa.getStyle().layers.find(l => l.type === "symbol")?.id;   // debajo de los nombres de calles
      mapa.addLayer({ id: "zona-relleno", type: "fill", source: "zona", paint: { "fill-color": "#203ae9", "fill-opacity": .04 } }, primera);
      mapa.addLayer({ id: "zona-borde", type: "line", source: "zona",
        paint: { "line-color": "#092957", "line-width": 1.5, "line-opacity": .55, "line-dasharray": [2, 2] } }, primera);
    };
    if (mapa.isStyleLoaded()) agregar(); else mapa.on("style.load", agregar);
  }

  window.PedalitoZona = { hay: !!zona, barrios: BARRIOS, barrioDe, dibujar,
    texto: "Palermo, Recoleta, Retiro, San Nicolás, Puerto Madero, Monserrat, San Telmo, Constitución, La Boca, Barracas, Parque Patricios y Nueva Pompeya" };
})();
