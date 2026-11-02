// Pedalito · predicción de disponibilidad de EcoBici por estación
// Datos: datos/insight_estaciones.js (hoja "Estaciones" y "Horario x dia" del insight, EcoBici 2024).
//
// Qué se puede y qué no con ese xlsx:
//  - SÍ: cuánto "se vacía" o "se llena" cada estación en el año (llegadas − salidas) y qué tan fuerte es
//    el movimiento del sistema en cada hora y día de la semana.
//  - NO: cuántas bicis hay físicamente ahora. El insight no trae stock ni capacidad por estación.
// Por eso el resultado es una PROBABILIDAD ESTIMADA (0 a 1), no un conteo. Las constantes de abajo son supuestos
// de diseño, no están ajustadas con datos de stock. Para cifras reales hay que cruzar con el feed en vivo de EcoBici.

(function () {
  const INSIGHT = window.PEDALITO_INSIGHT;
  const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]; // Date.getDay() → clave de viajesPorHora

  // Supuestos del modelo
  const K_SESGO = 6;     // cuánto pesa que la estación tienda a vaciarse o llenarse
  const K_DEMANDA = 0.5; // cuánto pesa que sea una estación muy movida
  const PRIOR = 0.4;     // a priori, es más probable que haya bici/anclaje que no

  const sigmoide = z => 1 / (1 + Math.exp(-z));
  const mediana = xs => { const o = [...xs].sort((a, b) => a - b); return o[Math.floor(o.length / 2)]; };

  const celdas = Object.values(INSIGHT.viajesPorHora).flat();
  const mediaCelda = celdas.reduce((a, b) => a + b, 0) / celdas.length;
  const medSalidas = mediana(INSIGHT.estaciones.map(e => e.salidas));
  const medLlegadas = mediana(INSIGHT.estaciones.map(e => e.llegadas));

  /** Intensidad del sistema en esa hora (1 = promedio de la semana). */
  function carga(fecha) {
    return INSIGHT.viajesPorHora[DIAS[fecha.getDay()]][fecha.getHours()] / mediaCelda;
  }

  /**
   * Probabilidad estimada de que la estación `numero` tenga bicis para retirar a las `fecha`
   * y anclajes libres para devolver `minutos` después.
   */
  function predecirEstacion(numero, fecha = new Date(), minutos = 0) {
    const e = INSIGHT.estaciones.find(x => x.numero === numero);
    if (!e) return null;
    const llegada = new Date(fecha.getTime() + minutos * 60000);
    const sesgo = (e.llegadas - e.salidas) / (e.llegadas + e.salidas); // >0 acumula bicis, <0 las pierde
    const cRetiro = carga(fecha), cDevol = carga(llegada);

    const bicis = sigmoide(PRIOR + K_SESGO * sesgo * cRetiro - K_DEMANDA * (e.salidas / medSalidas * cRetiro - 1));
    const anclajes = sigmoide(PRIOR - K_SESGO * sesgo * cDevol - K_DEMANDA * (e.llegadas / medLlegadas * cDevol - 1));
    return { numero, nombre: e.nombre, bicis, anclajes, nivelBicis: nivel(bicis), nivelAnclajes: nivel(anclajes) };
  }

  function nivel(p) { return p >= 0.7 ? "alta" : p >= 0.45 ? "media" : "baja"; }

  const distKm = (a, b) => {
    const r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon);
    return 12742 * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2));
  };

  /**
   * Recomienda estaciones: para retirar (cerca del origen, ordenadas por probabilidad de bici) y
   * para devolver (cerca del destino, ordenadas por probabilidad de anclaje libre).
   * Solo considera estaciones a `radioKm` o menos del punto.
   */
  function recomendarEstaciones(origen, destino, fecha = new Date(), minutosViaje = 20, radioKm = 0.6) {
    const cerca = (p, clave, min) => INSIGHT.estaciones
      .filter(e => distKm(p, e) <= radioKm)
      .map(e => ({ ...predecirEstacion(e.numero, fecha, min), distM: Math.round(distKm(p, e) * 1000), lat: e.lat, lon: e.lon }))
      .sort((a, b) => b[clave] - a[clave] || a.distM - b.distM)
      .slice(0, 3);
    return { retirar: cerca(origen, "bicis", 0), devolver: cerca(destino, "anclajes", minutosViaje) };
  }

  window.PedalitoPrediccion = { predecirEstacion, recomendarEstaciones, carga, distKm };
})();
