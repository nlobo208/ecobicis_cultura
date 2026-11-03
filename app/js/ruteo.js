// Pedalito · ruteo por calles
// Calcula el trazado real (siguiendo calles, no en línea recta) con el ruteo de OpenStreetMap:
//   - "bici": respeta sentidos de circulación y prefiere ciclovías y calles tranquilas
//   - "pie":  usa veredas y cruces peatonales
// Servicio comunitario, sin clave (routing.openstreetmap.de). Es para prototipo: tiene límites de uso justo.
// Si falla devuelve null: la app lo avisa y NO dibuja una línea recta que atraviese edificios.
//
// También mide qué porcentaje de cada trazado de bici va por una ciclovía real
// (data/ciclovias.js, dataset de ciclovías de las comunas 1, 2, 4 y 14).

(function () {
  const BASE = { bici: "https://routing.openstreetmap.de/routed-bike", pie: "https://routing.openstreetmap.de/routed-foot" };
  const cache = new Map();
  const espera = ms => new Promise(r => setTimeout(r, ms));

  /** Hasta 3 alternativas de ruta entre dos puntos: [{ coords, metros, segundos, pctCiclovia }] o null. */
  async function ruta(modo, desde, hasta, alternativas = false) {
    const clave = `${modo}|${desde.lon},${desde.lat}|${hasta.lon},${hasta.lat}|${alternativas}`;
    if (cache.has(clave)) return cache.get(clave);
    const url = `${BASE[modo]}/route/v1/driving/${desde.lon},${desde.lat};${hasta.lon},${hasta.lat}` +
      `?overview=full&geometries=geojson&steps=true${alternativas ? "&alternatives=true" : ""}`;
    for (let intento = 0; intento < 3; intento++) {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
        const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
        if (r.status === 429) { await espera(800 * (intento + 1)); continue; }
        if (!r.ok) break;
        const d = await r.json();
        if (d.code !== "Ok" || !d.routes?.length) break;
        const rutas = d.routes.slice(0, 3).map(x => {
          const coords = x.geometry.coordinates;
          // Maniobras de la ruta (para la guía paso a paso): qué hacer, en qué calle, a qué distancia y dónde
          const pasos = (x.legs?.[0]?.steps || []).map(s => ({
            maniobra: s.maneuver?.type || "continue", giro: s.maneuver?.modifier || null, salida: s.maneuver?.exit || null,
            calle: s.name || "", metros: Math.round(s.distance), punto: s.maneuver?.location || null }));
          return { coords, pasos, metros: Math.round(x.distance), segundos: Math.round(x.duration),
                   pctCiclovia: modo === "bici" ? porcentajeCiclovia(coords) : 0 };
        });
        cache.set(clave, rutas);
        return rutas;
      } catch { await espera(500); }
    }
    return null;
  }

  // ---------- % del trazado que va por ciclovía ----------
  // Índice espacial simple: se muestrean los tramos de ciclovía cada ~15 m y se agrupan en celdas de ~40 m.
  const CELDA = 0.0004;
  const indice = new Map();
  const celda = (lon, lat) => `${Math.floor(lon / CELDA)}|${Math.floor(lat / CELDA)}`;
  const aMetros = (a, b) => {
    const k = 111320, dx = (b[0] - a[0]) * k * Math.cos(a[1] * Math.PI / 180), dy = (b[1] - a[1]) * k;
    return Math.hypot(dx, dy);
  };
  function armarIndice() {
    const gj = window.PEDALITO_CICLOVIAS;
    if (!gj) return;
    gj.features.forEach(f => {
      const c = f.geometry.coordinates;
      for (let i = 1; i < c.length; i++) {
        const pasos = Math.max(1, Math.round(aMetros(c[i - 1], c[i]) / 15));
        for (let p = 0; p <= pasos; p++) {
          const lon = c[i - 1][0] + (c[i][0] - c[i - 1][0]) * p / pasos, lat = c[i - 1][1] + (c[i][1] - c[i - 1][1]) * p / pasos;
          const k = celda(lon, lat);
          if (!indice.has(k)) indice.set(k, []);
          indice.get(k).push([lon, lat]);
        }
      }
    });
  }
  armarIndice();

  function cercaDeCiclovia(p, tolerancia = 20) {
    const cx = Math.floor(p[0] / CELDA), cy = Math.floor(p[1] / CELDA);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const pts = indice.get(`${cx + dx}|${cy + dy}`);
      if (pts && pts.some(q => aMetros(p, q) <= tolerancia)) return true;
    }
    return false;
  }

  /** Porcentaje (0 a 100) de la longitud del trazado que queda a ≤ 20 m de una ciclovía. */
  function porcentajeCiclovia(coords) {
    let total = 0, enCiclovia = 0;
    for (let i = 1; i < coords.length; i++) {
      const largo = aMetros(coords[i - 1], coords[i]); if (!largo) continue;
      const medio = [(coords[i - 1][0] + coords[i][0]) / 2, (coords[i - 1][1] + coords[i][1]) / 2];
      total += largo; if (cercaDeCiclovia(medio)) enCiclovia += largo;
    }
    return total ? Math.round(100 * enCiclovia / total) : 0;
  }

  window.PedalitoRuteo = { ruta, porcentajeCiclovia };
})();
