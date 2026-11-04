// Pedalito · bicis y anclajes disponibles en vivo (API de EcoBici de la Ciudad)
//
// La clave de la API NO viaja al navegador: la usa la función de Netlify netlify/functions/ecobici.mjs, que devuelve
// el estado de cada estación (bicis, anclajes libres, capacidad). Acá se lo asocia a las 110 estaciones de la app
// por cercanía y se calcula el color de cada una.
//
// Si la función no está disponible (sin claves, sin Netlify, sin internet) `enVivo` queda en false y la app usa
// la estimación de js/prediccion.js, avisando que es una estimación.

(function () {
  const ENV = Object.assign({ ECOBICI_ENDPOINT: "/.netlify/functions/ecobici" }, window.PEDALITO_ENV || {});
  const ESTACIONES = window.PEDALITO_ESTACIONES;
  const RADIO_M = 120;                       // una estación de la API se asocia a la nuestra si está a esta distancia o menos
  const REFRESCO_MS = 60000;

  const estado = { enVivo: false, actualizado: null, error: "" };
  const porNumero = new Map();               // número de estación de la app → { bicis, anclajes, capacidad, ... }
  const oyentes = [];
  let intervalo = null;

  // ---------- Colores ----------
  const COLORES = { ninguna: "#111418", baja: "#e5202e", media: "#f76c09", alta: "#ffd400" };

  /**
   * Nivel y color según qué parte de la estación está ocupada (bicis disponibles o anclajes libres sobre el total):
   *   0 unidades → negro · 1 a 35 % → rojo · 36 a 70 % → naranja · 71 a 100 % → amarillo
   * Si hay al menos una unidad, nunca cae en negro aunque el porcentaje redondee a 0.
   */
  function nivelDe(cantidad, capacidad) {
    const n = Number(cantidad) || 0;
    if (n <= 0) return { nivel: "ninguna", color: COLORES.ninguna, claro: false, pct: 0 };
    const pct = Math.min(100, Math.max(1, Math.round(100 * n / Math.max(Number(capacidad) || n, n))));
    const nivel = pct <= 35 ? "baja" : pct <= 70 ? "media" : "alta";
    return { nivel, color: COLORES[nivel], claro: nivel === "alta", pct };      // claro: el amarillo lleva texto oscuro
  }

  const distM = (a, b) => {
    const r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon);
    return 12742000 * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2));
  };

  // ---------- Carga ----------
  async function cargar() {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(ENV.ECOBICI_ENDPOINT, { signal: ctl.signal }); clearTimeout(t);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `respondió ${r.status}`);
      if (!Array.isArray(d.estaciones) || !d.estaciones.length) throw new Error("sin estaciones");
      porNumero.clear();
      let asociadas = 0;
      ESTACIONES.forEach(e => {
        let mejor = null, md = Infinity;
        d.estaciones.forEach(s => { if (s.lat == null) return; const m = distM(e, s); if (m < md) { md = m; mejor = s; } });
        if (!mejor || md > RADIO_M) return;
        const bicis = Number(mejor.bicis) || 0, anclajes = Number(mejor.anclajes) || 0, desh = Number(mejor.deshabilitadas) || 0;
        const capacidad = Number(mejor.capacidad) > 0 ? Number(mejor.capacidad) : bicis + anclajes + desh;
        porNumero.set(e.numero, { bicis, anclajes, capacidad, deshabilitadas: desh, activa: mejor.activa !== false, idApi: mejor.id });
        asociadas++;
      });
      if (!asociadas) throw new Error("ninguna estación de la API coincide con las de la app");
      estado.enVivo = true; estado.error = ""; estado.actualizado = d.actualizado ? new Date(d.actualizado) : new Date();
    } catch (e) {
      porNumero.clear(); estado.enVivo = false; estado.actualizado = null; estado.error = String(e.message || e);
    }
    oyentes.forEach(f => { try { f(estado); } catch { /* un oyente no frena a los demás */ } });
    return estado;
  }

  /** Datos en vivo de una estación (o null si no hay): { bicis, anclajes, capacidad }. */
  const de = numero => porNumero.get(numero) || null;
  const alCambiar = f => oyentes.push(f);
  const hora = f => f ? f.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "";

  /** Carga ahora y vuelve a cargar cada minuto mientras la pestaña esté a la vista. */
  function iniciar() {
    cargar();
    clearInterval(intervalo);
    intervalo = setInterval(() => { if (!document.hidden) cargar(); }, REFRESCO_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - (estado.actualizado?.getTime() || 0) > REFRESCO_MS) cargar(); });
  }

  window.PedalitoDisponibilidad = { iniciar, cargar, de, nivelDe, alCambiar, hora, estado, COLORES };
})();
