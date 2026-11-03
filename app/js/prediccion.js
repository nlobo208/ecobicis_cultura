// Pedalito · predicción de disponibilidad de EcoBici por estación
// Datos: data/estaciones_modelo.js, generado del insight de EcoBici 2024 cruzado con las 110 estaciones VIGENTES.
//
// Importante: el insight es del sistema anterior (150 estaciones) y 37 de ellas hoy no existen. Acá solo se usan
// las estaciones oficiales actuales; cada una hereda el historial de la estación antigua más cercana (≤ 200 m).
//
// Qué se puede y qué no con ese xlsx:
//  - SÍ: cuánto "se vacía" o "se llena" cada zona en el año (llegadas − salidas) y qué tan fuerte es el movimiento
//    del sistema en cada hora y día de la semana.
//  - NO: cuántas bicis hay físicamente ahora. El insight no trae stock ni capacidad por estación.
// Por eso el resultado es una PROBABILIDAD ESTIMADA (0 a 1), no un conteo. Las constantes son supuestos de diseño,
// no están ajustadas con datos de stock. Para cifras reales hay que cruzar con el feed en vivo de EcoBici.

(function () {
  const MODELO = window.PEDALITO_MODELO;
  const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]; // Date.getDay() → clave de viajesPorHora

  // Supuestos del modelo
  const K_SESGO = 6;     // cuánto pesa que la zona tienda a vaciarse o llenarse
  const K_DEMANDA = 0.5; // cuánto pesa que sea una estación muy movida
  const PRIOR = 0.4;     // a priori, es más probable que haya bici/anclaje que no

  const sigmoide = z => 1 / (1 + Math.exp(-z));
  const mediana = xs => { const o = [...xs].sort((a, b) => a - b); return o[Math.floor(o.length / 2)]; };

  const celdas = Object.values(MODELO.viajesPorHora).flat();
  const mediaCelda = celdas.reduce((a, b) => a + b, 0) / celdas.length;
  const medSalidas = mediana(MODELO.estaciones.map(e => e.historial.salidas));
  const medLlegadas = mediana(MODELO.estaciones.map(e => e.historial.llegadas));
  const porNumero = new Map(MODELO.estaciones.map(e => [e.numero, e]));

  /** Intensidad del sistema en esa hora (1 = promedio de la semana). */
  function carga(fecha) {
    return MODELO.viajesPorHora[DIAS[fecha.getDay()]][fecha.getHours()] / mediaCelda;
  }
  // Mismos cortes que los colores del mapa: 0 a 25 % baja (rojo), 26 a 69 % media (naranja), 70 a 100 % alta (amarillo)
  const nivel = p => { const x = Math.round(p * 100); return x >= 70 ? "alta" : x >= 26 ? "media" : "baja"; };

  /**
   * Probabilidad estimada de que la estación `numero` tenga bicis para retirar a las `fecha`
   * y anclajes libres para devolver `minutos` después.
   */
  function predecirEstacion(numero, fecha = new Date(), minutos = 0) {
    const e = porNumero.get(numero);
    if (!e) return null;
    const h = e.historial, llegada = new Date(fecha.getTime() + minutos * 60000);
    const sesgo = (h.llegadas - h.salidas) / (h.llegadas + h.salidas); // >0 acumula bicis, <0 las pierde
    const cRetiro = carga(fecha), cDevol = carga(llegada);
    const bicis = sigmoide(PRIOR + K_SESGO * sesgo * cRetiro - K_DEMANDA * (h.salidas / medSalidas * cRetiro - 1));
    const anclajes = sigmoide(PRIOR - K_SESGO * sesgo * cDevol - K_DEMANDA * (h.llegadas / medLlegadas * cDevol - 1));
    return { numero, nombre: e.nombre, barrio: e.barrio, lat: e.lat, lon: e.lon, bicis, anclajes,
             nivelBicis: nivel(bicis), nivelAnclajes: nivel(anclajes) };
  }

  const distKm = (a, b) => {
    const r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon);
    return 12742 * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2));
  };

  /**
   * Las `n` mejores estaciones vigentes a `radioKm` o menos de un punto.
   * clave "bicis" → para retirar; "anclajes" → para devolver (con `minutos` de viaje).
   */
  function estacionesCerca(punto, clave, fecha = new Date(), minutos = 0, radioKm = 0.7, n = 3) {
    // Puntaje: probabilidad menos una penalidad por distancia (caminar hasta la estación también cuesta)
    const puntaje = e => e[clave] - 0.4 * e.distM / (radioKm * 1000);
    return MODELO.estaciones
      .map(e => ({ ...predecirEstacion(e.numero, fecha, minutos), distM: Math.round(distKm(punto, e) * 1000) }))
      .filter(e => e.distM <= radioKm * 1000)
      .sort((a, b) => puntaje(b) - puntaje(a))
      .slice(0, n);
  }

  /** Pares de estaciones con más viajes en 2024 entre las estaciones dadas (dato histórico real del insight). */
  function corredoresEntre(numeros) {
    const set = new Set(numeros);
    return MODELO.corredores.filter(c => set.has(c.desde) && set.has(c.hasta));
  }

  window.PedalitoPrediccion = { predecirEstacion, estacionesCerca, corredoresEntre, carga, distKm, existe: n => porNumero.has(n) };
})();
