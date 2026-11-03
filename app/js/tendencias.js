// Pedalito · tendencias: los lugares más visitados en los últimos 7 días
// Una "visita" es un recorrido iniciado ("Ir a retirar la bici") que incluye ese lugar.
//
// Dónde se guarda:
//  - En este navegador, por día: { "2026-11-02": { "1769": 2 } }. Se usa siempre y alimenta el ranking local.
//  - En el servidor (netlify/functions/visitas.mjs), si está publicado: ahí se cuentan PERSONAS distintas de todos los
//    usuarios. Sin servidor (por ejemplo abriendo el archivo local), el ranking muestra solo tus propias visitas.
//
// La ventana es móvil: "hoy y los 6 días anteriores". Como se calcula al abrir la app, se actualiza solo todos los días.

(function () {
  const CLAVE = "pedalito_visitas", CLAVE_USUARIO = "pedalito_usuario", CLAVE_CACHE = "pedalito_ranking";
  const ENDPOINT = "/.netlify/functions/visitas";
  const DIAS = 7;

  const dia = (fecha = new Date()) => {                 // YYYY-MM-DD en la hora local de quien usa la app
    const p = n => String(n).padStart(2, "0");
    return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
  };
  const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; } };
  const guardar = d => { try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch { /* modo privado */ } };

  /** Identificador anónimo de este navegador (no es el email): sirve para contar personas distintas. */
  function usuario() {
    try {
      let u = localStorage.getItem(CLAVE_USUARIO);
      if (!u) { u = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem(CLAVE_USUARIO, u); }
      return u;
    } catch { return "anonimo"; }
  }

  /** Suma 1 visita de hoy a cada lugar del recorrido y la manda al servidor si existe. */
  function registrarInicio(idsLugares) {
    const datos = leer(), hoy = dia();
    datos[hoy] = datos[hoy] || {};
    idsLugares.forEach(id => { datos[hoy][id] = (datos[hoy][id] || 0) + 1; });
    Object.keys(datos).filter(f => f < dia(new Date(Date.now() - 30 * 86400000))).forEach(f => delete datos[f]);   // guarda 30 días
    guardar(datos);
    try { sessionStorage.removeItem(CLAVE_CACHE); } catch { /* nada */ }
    fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: usuario(), lugares: idsLugares }) }).catch(() => {});
  }

  /** Ranking local de los últimos 7 días: [{ id, personas }] (acá "personas" es 1 si vos lo visitaste). */
  function rankingLocal(n) {
    const desde = dia(new Date(Date.now() - (DIAS - 1) * 86400000)), datos = leer(), visitados = new Map();
    Object.entries(datos).filter(([f]) => f >= desde).forEach(([, porLugar]) =>
      Object.entries(porLugar).forEach(([id, c]) => visitados.set(Number(id), (visitados.get(Number(id)) || 0) + c)));
    return [...visitados].map(([id, visitas]) => ({ id, personas: 1, visitas })).sort((a, b) => b.visitas - a.visitas).slice(0, n);
  }

  /**
   * Ranking de los últimos 7 días. Con servidor: personas distintas de todos los usuarios.
   * Devuelve { items: [{ id, personas }], origen: "servidor" | "local" }.
   */
  async function ranking(n = 10) {
    const hoy = dia();
    try {
      const cache = JSON.parse(sessionStorage.getItem(CLAVE_CACHE));
      if (cache && cache.dia === hoy) return { items: cache.items.slice(0, n), origen: "servidor" };
    } catch { /* sin cache */ }
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(`${ENDPOINT}?dias=${DIAS}`, { signal: ctl.signal }); clearTimeout(t);
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      if (!Array.isArray(d.ranking)) throw new Error("respuesta inválida");
      try { sessionStorage.setItem(CLAVE_CACHE, JSON.stringify({ dia: hoy, items: d.ranking })); } catch { /* nada */ }
      return { items: d.ranking.slice(0, n), origen: "servidor" };
    } catch {
      return { items: rankingLocal(n), origen: "local" };
    }
  }

  window.PedalitoTendencias = { registrarInicio, ranking, rankingLocal };
})();
