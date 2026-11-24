// Ubicación en tiempo real de quien usa la app (Chrome y cualquier navegador con geolocalización).
// Un solo watchPosition para toda la app: lo piden todos los mapas y se comparte.
// Chrome pide permiso al llamar a iniciar() (se llama al tocar "Comenzar a pedalear") y solo funciona con HTTPS
// (Netlify ya lo da) o en localhost. La posición NO se guarda ni se envía a ningún servidor: vive en memoria.
window.UBI = (function () {
  const oyentes = new Set(), mapas = new Set();
  const u = { pos: null, estado: "sin-pedir", watch: null };   // estado: sin-pedir | pidiendo | activa | denegada | no-disponible

  function avisar() { oyentes.forEach(f => { try { f(u); } catch (e) { /* un oyente roto no frena al resto */ } }); mapas.forEach(actualizarMapa); }

  function iniciar() {
    if (u.watch !== null) return;
    if (!navigator.geolocation) { u.estado = "no-disponible"; avisar(); return; }
    u.estado = "pidiendo"; avisar();
    u.watch = navigator.geolocation.watchPosition(pos => {
      u.estado = "activa";
      u.pos = { lat: pos.coords.latitude, lon: pos.coords.longitude, precision: pos.coords.accuracy || 0,
                rumbo: pos.coords.heading, t: pos.timestamp };
      avisar();
    }, err => {
      if (err.code === 1) { u.estado = "denegada"; navigator.geolocation.clearWatch(u.watch); u.watch = null; }   // sin permiso: se deja de insistir
      else if (!u.pos) u.estado = "no-disponible";   // señal débil: el watch sigue y se recupera solo
      avisar();
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  }

  // Si el permiso ya estaba dado de una visita anterior, arranca sin esperar un toque
  if (navigator.permissions?.query) {
    navigator.permissions.query({ name: "geolocation" }).then(p => {
      if (p.state === "granted") iniciar();
      p.onchange = () => { if (p.state === "granted" && u.watch === null) iniciar(); if (p.state === "denied") { u.estado = "denegada"; avisar(); } };
    }).catch(() => {});
  }

  // Cuando la pestaña vuelve a estar visible, se asegura de que el GPS siga activo
  document.addEventListener("visibilitychange", () => { if (!document.hidden && u.estado === "activa" && u.watch === null) iniciar(); });

  // ---- Punto "Vos estás acá" en un mapa de MapLibre (distinto del punto azul del origen elegido) ----
  const FUENTE = "ubi-viva-precision", CAPA = "ubi-viva-precision-capa";
  function circulo(p) {
    const n = 48, r = Math.max(p.precision, 8), dLat = r / 111320, dLon = r / (111320 * Math.cos(p.lat * Math.PI / 180)), anillo = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; anillo.push([p.lon + dLon * Math.cos(a), p.lat + dLat * Math.sin(a)]); }
    return { type: "Feature", geometry: { type: "Polygon", coordinates: [anillo] }, properties: {} };
  }
  function actualizarMapa(m) {
    const e = m._ubi; if (!e || !u.pos) return;
    e.marca.setLngLat([u.pos.lon, u.pos.lat]);
    if (!e.visible) { e.marca.getElement().style.display = ""; e.visible = true; }
    if (m.isStyleLoaded() || m.getSource(FUENTE)) {
      const dato = { type: "FeatureCollection", features: [circulo(u.pos)] };
      if (m.getSource(FUENTE)) m.getSource(FUENTE).setData(dato);
      else {
        m.addSource(FUENTE, { type: "geojson", data: dato });
        m.addLayer({ id: CAPA, type: "fill", source: FUENTE, paint: { "fill-color": "#000", "fill-opacity": 0.12 } });
      }
    }
  }
  /** Dibuja la ubicación en vivo en el mapa y suma el botón "ir a mi ubicación". */
  function dibujar(mapa) {
    if (mapa._ubi) return;
    const el = document.createElement("div");
    el.className = "ubi-viva"; el.style.display = "none"; el.title = "Vos estás acá";
    el.innerHTML = "<i></i>";
    const marca = new maplibregl.Marker({ element: el }).setLngLat([0, 0]).addTo(mapa);
    mapa._ubi = { marca, visible: false };
    mapa.addControl({
      onAdd() {
        const c = document.createElement("div"); c.className = "maplibregl-ctrl maplibregl-ctrl-group";
        const b = document.createElement("button"); b.type = "button"; b.className = "ubi-boton";
        b.setAttribute("aria-label", "Ir a mi ubicación"); b.title = "Ir a mi ubicación"; b.innerHTML = "◎";
        b.addEventListener("click", () => {
          if (u.pos) { mapa.easeTo({ center: [u.pos.lon, u.pos.lat], zoom: Math.max(mapa.getZoom(), 15.5), duration: 700 }); return; }
          if (u.estado === "denegada") { alert("Chrome tiene bloqueada tu ubicación para esta página. Tocá el candado de la barra de direcciones → Permisos → Ubicación → Permitir, y recargá."); return; }
          iniciar();
        });
        c.appendChild(b); this._c = c; return c;
      },
      onRemove() { this._c?.remove(); }
    }, "top-right");
    mapa.on("styledata", () => actualizarMapa(mapa));   // si el estilo se recarga, vuelve a dibujar el círculo de precisión
    mapas.add(mapa); actualizarMapa(mapa);
  }

  return { iniciar, dibujar, estado: () => u.estado, posicion: () => u.pos, alCambiar: f => { oyentes.add(f); return () => oyentes.delete(f); } };
})();
