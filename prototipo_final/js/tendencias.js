// Pedalito · tendencias: cuántos recorridos se inician por lugar (hotspot)
// Guarda un contador por lugar en el navegador (localStorage). Cada vez que se inicia un recorrido
// ("Ir a retirar la bici") se suma 1 a cada lugar del recorrido, y "Tendencias" muestra los más elegidos.
//
// Limitación: el contador vive en este navegador. Para un ranking de TODOS los usuarios hay que enviar
// `registrarInicio` a un servidor (por ejemplo otra función de Netlify con una base de datos).
// Ese punto de conexión es `ENVIAR_A_SERVIDOR` más abajo.

(function () {
  const CLAVE = "pedalito_clicks";
  const ENVIAR_A_SERVIDOR = null; // ej.: "/.netlify/functions/clicks" cuando exista el backend

  function leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; }
  }
  function guardar(datos) {
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* modo privado */ }
  }

  /** Suma 1 recorrido iniciado a cada lugar del recorrido. */
  function registrarInicio(idsLugares) {
    const datos = leer();
    idsLugares.forEach(id => {
      const fila = datos[id] || { recorridos: 0, ultimo: null };
      fila.recorridos += 1;
      fila.ultimo = new Date().toISOString();
      datos[id] = fila;
    });
    guardar(datos);
    if (ENVIAR_A_SERVIDOR) {
      fetch(ENVIAR_A_SERVIDOR, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lugares: idsLugares }) }).catch(() => {});
    }
  }

  /** Los `n` lugares con más recorridos iniciados: [{ id, recorridos }]. */
  function masElegidos(n = 5) {
    return Object.entries(leer())
      .map(([id, f]) => ({ id: Number(id), recorridos: f.recorridos }))
      .sort((a, b) => b.recorridos - a.recorridos)
      .slice(0, n);
  }

  function recorridosDe(id) { return (leer()[id] || {}).recorridos || 0; }

  window.PedalitoTendencias = { registrarInicio, masElegidos, recorridosDe };
})();
