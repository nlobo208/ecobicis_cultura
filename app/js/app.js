// Pedalito · prototipo final (Figma: UX_pedalito2)
// Datos: data/lugares.js (3.390 lugares y 110 estaciones), data/estaciones_modelo.js (insight 2024 sobre estaciones vigentes),
//        data/ciclovias.js (ciclovías reales), data/actividades.js
// Claves y URLs: env.js (generado desde .env con generar_env.ps1)

const ENV = Object.assign({
  OPENWEATHER_API_KEY: "", OPENWEATHER_URL: "https://api.openweathermap.org/data/2.5/weather",
  OPENFREEMAP_STYLE_URL: "https://tiles.openfreemap.org/styles/positron",
  ORIGEN_LAT: "-34.5886", ORIGEN_LON: "-58.3895", IA_ENDPOINT: "/.netlify/functions/chat"
}, window.PEDALITO_ENV || {});

const LUGARES = window.PEDALITO_LUGARES;
// Fotos con licencia libre de los hotspots (data/fotos.js): se suman a cada lugar. Los lugares sin foto libre quedan sin imagen.
Object.entries(window.PEDALITO_FOTOS || {}).forEach(([id, f]) => { const l = LUGARES.find(x => x.id === Number(id)); if (l) { l.img = `lugares/${f.archivo}`; l.foto = f; } });
const ACTIVIDADES = window.PEDALITO_ACTIVIDADES || [];
const ESTACIONES = window.PEDALITO_ESTACIONES;
const PRED = window.PedalitoPrediccion, TEND = window.PedalitoTendencias, HOR = window.PedalitoHorarios;

// Punto de salida. El de .env es solo el centro del mapa por defecto: la persona elige desde dónde sale en cada
// sesión (pantalla "¿Desde dónde salís?") y vale por 1 hora. No se guarda entre días: "cerca tuyo" es de ahora.
const ORIGEN = { nombre: "Plaza Vicente López", lat: Number(ENV.ORIGEN_LAT), lon: Number(ENV.ORIGEN_LON) };
const CLAVE_ORIGEN = "pedalito_origen", VIGENCIA_ORIGEN_MS = 60 * 60 * 1000;
let origenElegido = false;
try {
  const o = JSON.parse(sessionStorage.getItem(CLAVE_ORIGEN));
  if (o && Date.now() - o.hora < VIGENCIA_ORIGEN_MS) { Object.assign(ORIGEN, o.punto); origenElegido = true; }
} catch { /* sin sessionStorage: se vuelve a preguntar */ }

function fijarOrigen(punto) {
  Object.assign(ORIGEN, { nombre: punto.nombre, lat: punto.lat, lon: punto.lon });
  origenElegido = true;
  try { sessionStorage.setItem(CLAVE_ORIGEN, JSON.stringify({ hora: Date.now(), punto: ORIGEN })); } catch { /* nada */ }
  sessionStorage.removeItem("pedalito_paravos");   // las recomendaciones dependen de dónde estás
  plan.tramos = null;                              // un recorrido armado desde otro lado ya no sirve
  cargarClima();
}

// Mismas 16 categorías que los chips del Figma
const INTERESES = ["Anfiteatro", "Bar", "Biblioteca", "Café", "Centro cultural", "Club de música en vivo",
  "Disquería", "Espacio de formación", "Espacio ferial", "Galería de arte", "Librería",
  "Monumentos y lugares históricos", "Museo", "Restaurante", "Sala de cine", "Sala de teatro"];
const COLORES = ["naranja", "celeste", "verde", "rosa"];       // orden de las tarjetas apiladas de Explorar
const VELOCIDAD_KMH = 14;                                       // para estimar minutos de viaje
const LUGARES_POR_TIEMPO = { 30: 1, 60: 2, 120: 3 };
const MAX_LISTA = 24;

// ---------- Estado guardado en el navegador ----------
const CLAVE_ESTADO = "pedalito_final";
const estado = Object.assign({
  email: "", nombre: "", intereses: [], km: 0, salidas: 0, visitados: [], destinos: [],
  calificaciones: {}, guardados: [], historial: [], ultimo: null
}, leerEstado());
const plan = { modo: "sorpresa", minutos: 60, maxKm: 5, hasta: null, ids: [], km: 0, estaciones: null };

function leerEstado() { try { return JSON.parse(localStorage.getItem(CLAVE_ESTADO)) || {}; } catch { return {}; } }
function guardarEstado() { try { localStorage.setItem(CLAVE_ESTADO, JSON.stringify(estado)); } catch { /* modo privado */ } }

// ---------- Utilidades ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const porId = id => LUGARES.find(l => l.id === Number(id));
const fmtKm = n => n.toFixed(1).replace(".", ",") + " km";
const desdeOrigen = l => PRED.distKm(ORIGEN, l);
const pct = p => Math.round(p * 100) + " %";
const fotoUrl = l => l.img ? `img/${l.img}` : "";

// ---------- Navegación (#inicio, #lugar/123, …) ----------
const TABS = ["inicio", "explorar", "planificar", "perfil"];
const PUBLICAS = ["bienvenida", "cuenta"];
let pantallaActual = "";

function mostrar() {
  let [pantalla, param] = location.hash.slice(1).split("/");
  if (!pantalla || !document.getElementById(pantalla)) pantalla = estado.email ? "inicio" : "bienvenida";
  if (!estado.email && !PUBLICAS.includes(pantalla)) pantalla = "bienvenida";
  if (estado.email && estado.intereses.length < 3 && pantalla !== "intereses" && !PUBLICAS.includes(pantalla)) pantalla = "intereses";
  // Con intereses ya elegidos, antes de ofrecer nada se pregunta desde dónde salís (en cada sesión)
  if (estado.email && estado.intereses.length >= 3 && !origenElegido && !["intereses", "ubicacion", ...PUBLICAS].includes(pantalla)) pantalla = "ubicacion";
  pantallaActual = pantalla;
  // Si un desvío cambió la pantalla (por ejemplo, pedir la ubicación), la URL pasa a decir lo mismo que se ve:
  // si no, tocar "continuar" hacia #inicio no dispararía hashchange porque la URL ya diría #inicio.
  const destino = pantalla === "lugar" && param ? `${pantalla}/${param}` : pantalla;
  if (location.hash.slice(1) !== destino) history.replaceState(null, "", `#${destino}`);

  $$(".pantalla").forEach(s => s.classList.toggle("visible", s.id === pantalla));
  const conNav = TABS.includes(pantalla);
  $("#nav").classList.toggle("visible", conNav);
  document.querySelector(".app").classList.toggle("con-nav", conNav);
  $("#atras").hidden = ["bienvenida", "lugar"].includes(pantalla);   // en el detalle la flecha va sobre la foto
  $$("#nav a").forEach(a => a.classList.toggle("activo", a.dataset.tab === pantalla));
  window.scrollTo(0, 0);
  if (pantalla !== "recorrido") pausarGuia();                          // al salir de la guía se apagan el GPS y la voz

  ({ intereses: pintarIntereses, ubicacion: pintarUbicacion, inicio: pintarInicio, explorar: pintarExplorar,
     lugar: () => pintarLugar(param), planificar: pintarPlanificar, recorrido: armarRecorrido,
     cierre: pintarCierre, perfil: pintarPerfil, compartir: pintarCompartir }[pantalla] || (() => {}))();
}

// ---------- Flecha para volver ----------
// Si la persona ya navegó dentro de la app se usa el historial del navegador; si entró directo, va a la pantalla anterior del flujo.
const PADRE = { cuenta: "bienvenida", intereses: "cuenta", ubicacion: "intereses", inicio: "ubicacion", explorar: "inicio", lugar: "explorar",
  planificar: "inicio", recorrido: "planificar", cierre: "recorrido", perfil: "inicio", compartir: "perfil" };
let navegaciones = 0, volviendo = false;
window.addEventListener("hashchange", () => { if (volviendo) volviendo = false; else navegaciones++; mostrar(); });
function volver() {
  if (navegaciones > 0) { navegaciones--; volviendo = true; history.back(); }
  else location.hash = PADRE[pantallaActual] || "inicio";
}
$("#atras").addEventListener("click", volver);
$("#atras-lugar").addEventListener("click", volver);

// ---------- 01 · Crear cuenta (prototipo: no hay servidor, se guarda solo en este navegador) ----------
$("#form-cuenta").addEventListener("submit", e => {
  e.preventDefault();
  const email = $("#email").value.trim(), clave = $("#clave").value;
  const error = $("#error-cuenta");
  const problema = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? "Ingresá un email válido."
    : clave.length < 8 ? "La contraseña necesita al menos 8 caracteres." : "";
  error.hidden = !problema; error.textContent = problema;
  if (problema) return;
  estado.email = email;
  estado.nombre = email.split("@")[0].replace(/[._-]+/g, " ").replace(/^./, c => c.toUpperCase());
  guardarEstado();
  location.hash = "intereses";
});
$("#google").addEventListener("click", () => {
  const error = $("#error-cuenta"); error.hidden = false;
  error.textContent = "El registro con Google todavía no está disponible en el prototipo.";
});
$("#ya-tengo").addEventListener("click", e => {
  e.preventDefault();
  if (estado.email) { location.hash = "inicio"; return; }
  const error = $("#error-cuenta"); error.hidden = false;
  error.textContent = "No encontramos una cuenta en este dispositivo. Creá una para seguir.";
});

// ---------- 02 · Intereses ----------
function pintarIntereses() {
  $("#chips-intereses").innerHTML = INTERESES.map(i =>
    `<button class="chip ${estado.intereses.includes(i) ? "activo" : ""}" data-interes="${esc(i)}" aria-pressed="${estado.intereses.includes(i)}">${esc(i)}</button>`).join("");
  const n = estado.intereses.length;
  $("#guardar-intereses").disabled = n < 3 || n > 5;
  $("#guardar-intereses").firstChild.textContent = n ? `Guardar intereses · ${n} ` : "Guardar intereses ";
}
$("#chips-intereses").addEventListener("click", e => {
  const i = e.target.dataset.interes; if (!i) return;
  const sel = estado.intereses;
  if (sel.includes(i)) sel.splice(sel.indexOf(i), 1); else if (sel.length < 5) sel.push(i);
  pintarIntereses();
});
$("#guardar-intereses").addEventListener("click", () => { guardarEstado(); sessionStorage.removeItem("pedalito_paravos"); location.hash = "ubicacion"; });

// ---------- 02b · Desde dónde salís ----------
let mapaUbi, marcaUbi, seleccion = null, sugerencias = [];
const sinTildes = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function estacionMasCercana(p) {
  return ESTACIONES.reduce((mejor, e) => { const m = PRED.distKm(p, e) * 1000; return m < mejor.m ? { e, m } : mejor; }, { e: null, m: Infinity });
}

/** Marca el punto de salida elegido y avisa si queda fuera de la zona cubierta (comunas 1, 2, 4 y 14). */
function elegirPunto(p, nombre) {
  const { e, m } = estacionMasCercana(p), dentro = m <= 2000;
  seleccion = { lat: p.lat, lon: p.lon, nombre: nombre || `Cerca de ${e.nombre}` };
  marcaUbi?.setLngLat([p.lon, p.lat]);
  $("#origen-aviso").textContent = dentro
    ? `Estación EcoBici más cercana: ${e.nombre}, a ${Math.round(m)} m.`
    : "Ese punto queda fuera de la zona que cubrimos (comunas 1, 2, 4 y 14). Elegí otro.";
  $("#confirmar-origen").disabled = !dentro;
}

function pintarUbicacion() {
  $("#buscar-origen").value = ""; $("#sugerencias").hidden = true;
  $("#confirmar-origen").disabled = true;
  seleccion = null;
  $("#origen-aviso").textContent = "Tocá el mapa o arrastrá el punto para ajustar.";
  if (!window.maplibregl) return;
  if (!mapaUbi) {
    mapaUbi = new maplibregl.Map({ container: "mapa-ubicacion", style: ENV.OPENFREEMAP_STYLE_URL, center: [ORIGEN.lon, ORIGEN.lat],
      zoom: 13.5, attributionControl: { compact: true } });
    mapaUbi.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    marcaUbi = new maplibregl.Marker({ color: "#203ae9", draggable: true }).setLngLat([ORIGEN.lon, ORIGEN.lat]).addTo(mapaUbi);
    marcaUbi.on("dragend", () => { const p = marcaUbi.getLngLat(); elegirPunto({ lat: p.lat, lon: p.lng }); });
    mapaUbi.on("click", e => elegirPunto({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
  } else {
    mapaUbi.resize();
  }
  // Si ya había uno elegido en esta sesión, queda preseleccionado para poder cambiarlo
  if (origenElegido) { mapaUbi.jumpTo({ center: [ORIGEN.lon, ORIGEN.lat] }); elegirPunto(ORIGEN, ORIGEN.nombre); }
  else marcaUbi.setLngLat([ORIGEN.lon, ORIGEN.lat]);
}

$("#usar-ubicacion").addEventListener("click", () => {
  const aviso = $("#origen-aviso");
  if (!navigator.geolocation) { aviso.textContent = "Tu navegador no permite ubicación. Buscá un lugar o tocá el mapa."; return; }
  aviso.textContent = "Buscando tu ubicación…";
  navigator.geolocation.getCurrentPosition(pos => {
    const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    elegirPunto(p, "Tu ubicación actual");
    mapaUbi?.flyTo({ center: [p.lon, p.lat], zoom: 15 });
  }, err => {
    aviso.textContent = err.code === 1 ? "No diste permiso de ubicación. Buscá un lugar o tocá el mapa."
      : "No pudimos obtener tu ubicación. Buscá un lugar o tocá el mapa.";
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });   // maximumAge 0: nunca una posición vieja
});

$("#buscar-origen").addEventListener("input", () => {
  const q = sinTildes($("#buscar-origen").value.trim()), lista = $("#sugerencias");
  if (q.length < 2) { lista.hidden = true; return; }
  const estaciones = ESTACIONES.filter(e => sinTildes(e.nombre).includes(q))
    .map(e => ({ nombre: `Estación ${e.nombre}`, detalle: e.barrio, lat: e.lat, lon: e.lon }));
  const lugares = LUGARES.filter(l => sinTildes(l.nombre).includes(q))
    .map(l => ({ nombre: l.nombre, detalle: `${l.categoria} · ${l.barrio}`, lat: l.lat, lon: l.lon }));
  sugerencias = [...estaciones, ...lugares].slice(0, 6);
  lista.innerHTML = sugerencias.map((s, i) => `<li><button type="button" data-i="${i}">${esc(s.nombre)}<small>${esc(s.detalle)}</small></button></li>`).join("")
    || `<li><small style="padding:10px 14px">No encontramos ese lugar.</small></li>`;
  lista.hidden = false;
});
$("#sugerencias").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const s = sugerencias[Number(b.dataset.i)];
  $("#buscar-origen").value = s.nombre; $("#sugerencias").hidden = true;
  elegirPunto(s, s.nombre);
  mapaUbi?.flyTo({ center: [s.lon, s.lat], zoom: 15 });
});
$("#confirmar-origen").addEventListener("click", () => {
  if (!seleccion) return;
  fijarOrigen(seleccion);
  location.hash = "inicio";
});

// ---------- 03 · Home ----------
let mapaHome;
function pintarInicio() {
  const h = new Date().getHours();
  const saludo = h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
  $("#saludo").textContent = `¡${saludo}${estado.nombre ? " " + estado.nombre : ""}!`;
  $("#origen-nombre").textContent = ORIGEN.nombre;
  pintarMapaHome(); pintarFechas(); pintarTendencias(); pintarParaVos();
}

// ---------- Panel blanco deslizable (Home y Explorar) ----------
// Dos posiciones: abierto y cerrado (se ve más mapa). Se cambia deslizando hacia abajo/arriba con el dedo, con la
// rueda del mouse, o tocando la barrita de arriba. data-abierta / data-cerrada = % de la pantalla que ocupa el panel.
function hacerDeslizable(hoja, alCambiar) {
  const scroll = hoja.querySelector(".hoja-scroll"), agarre = hoja.querySelector(".agarre");
  const abierta = Number(hoja.dataset.abierta), cerrada = Number(hoja.dataset.cerrada);
  hoja.style.setProperty("--abierta", abierta); hoja.style.setProperty("--cerrada", cerrada);
  const estaCerrada = () => hoja.classList.contains("cerrada");
  const pxCierre = () => (abierta - cerrada) / 100 * window.innerHeight;
  const poner = c => {
    hoja.classList.toggle("cerrada", c); hoja.style.transform = ""; hoja.style.transition = "";
    if (c) scroll.scrollTop = 0;
    alCambiar?.(c);
  };
  agarre.addEventListener("click", () => poner(!estaCerrada()));

  let y0 = null, dy = 0, arrastrando = false, empezoArriba = false;
  hoja.addEventListener("touchstart", e => { y0 = e.touches[0].clientY; dy = 0; arrastrando = false; empezoArriba = scroll.scrollTop <= 0; }, { passive: true });
  hoja.addEventListener("touchmove", e => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    const baja = !estaCerrada() && dy > 0 && (empezoArriba || agarre.contains(e.target));   // tirar hacia abajo desde el tope
    const sube = estaCerrada() && dy < 0;                                                    // tirar hacia arriba para abrir
    if (!arrastrando && !(baja || sube)) return;                                             // si no, es scroll normal del contenido
    arrastrando = true; e.preventDefault();
    const px = Math.min(Math.max((estaCerrada() ? pxCierre() : 0) + dy, 0), pxCierre());
    hoja.style.transition = "none"; hoja.style.transform = `translateY(${px}px)`;
  }, { passive: false });
  const soltar = () => {
    if (arrastrando) { const c = estaCerrada(); poner(!c && dy > 70 ? true : c && dy < -70 ? false : c); }
    y0 = null; arrastrando = false;
  };
  hoja.addEventListener("touchend", soltar); hoja.addEventListener("touchcancel", soltar);

  let ultimo = 0;                                                                            // rueda del mouse
  hoja.addEventListener("wheel", e => {
    const ahora = Date.now(); if (ahora - ultimo < 450) return;
    if (!estaCerrada() && e.deltaY < -20 && scroll.scrollTop <= 0) { ultimo = ahora; poner(true); }
    else if (estaCerrada() && e.deltaY > 20) { ultimo = ahora; poner(false); }
  }, { passive: true });

  return { poner, estaCerrada, visiblePx: () => (estaCerrada() ? cerrada : abierta) / 100 * window.innerHeight };
}
/** Corre el centro del mapa para que lo importante quede en la parte que no tapa el panel. */
function ajustarMapa(mapa, hoja, animar = true) {
  if (mapa && hoja) mapa.easeTo({ padding: { top: 0, left: 0, right: 0, bottom: Math.round(hoja.visiblePx()) }, duration: animar ? 300 : 0 });
}

// ---------- Aviso breve ----------
let temporizadorToast;
function aviso(texto) {
  const t = $("#toast"); t.textContent = texto; t.hidden = false;
  clearTimeout(temporizadorToast); temporizadorToast = setTimeout(() => { t.hidden = true; }, 2800);
}

// ---------- Botón "+" de las tarjetas: suma o quita el lugar de tu recorrido ----------
const MAX_DESTINOS = 5;
const botonMas = id => { const sumado = estado.destinos.includes(id);
  return `<button class="mas" type="button" data-id="${id}" aria-pressed="${sumado}" aria-label="${sumado ? "Quitar del recorrido" : "Sumar al recorrido"}">${sumado ? "✓" : "+"}</button>`; };
document.addEventListener("click", e => {
  const b = e.target.closest(".mas"); if (!b) return;
  const id = Number(b.dataset.id), i = estado.destinos.indexOf(id), l = porId(id);
  if (i >= 0) { estado.destinos.splice(i, 1); aviso(`${l.nombre} salió de tu recorrido.`); }
  else if (estado.destinos.length >= MAX_DESTINOS) { aviso(`Podés sumar hasta ${MAX_DESTINOS} lugares.`); return; }
  else { estado.destinos.push(id); plan.modo = "destino"; aviso(`${l.nombre} sumado (${estado.destinos.length}). Armá tu salida en Pedalear.`); }
  plan.tramos = null; guardarEstado();
  $$(`.mas[data-id="${id}"]`).forEach(x => { const s = estado.destinos.includes(id); x.setAttribute("aria-pressed", s); x.textContent = s ? "✓" : "+"; });
});

/** Tarjeta de los carruseles del Home. `lugar` puede faltar (actividad sin lugar en el dataset): entonces no hay link ni "+". */
function tarjetaLugarHTML({ lugar, etiqueta, titulo, metas, textoSinImagen }) {
  const contenido = `
    <div class="foto ${lugar?.img ? "" : "sin-imagen"}" ${lugar?.img ? `style="background-image:url('${fotoUrl(lugar)}')"` : ""}>
      <span class="tag">${esc(etiqueta)}</span>${lugar?.img ? "" : esc(textoSinImagen || "")}
    </div>
    <div class="info"><strong>${esc(titulo)}</strong>${metas.map(m => `<span class="meta">${esc(m)}</span>`).join("")}</div>`;
  return `<div class="tarjeta-lugar">${lugar ? `<a class="enlace" href="#lugar/${lugar.id}">${contenido}</a>${botonMas(lugar.id)}` : `<div class="enlace">${contenido}</div>`}</div>`;
}

// ---------- 03 · Mapa del Home ----------
// Mapa en vivo: se arrastra y se hace zoom. Muestra tu punto de salida y las estaciones EcoBici vigentes, coloreadas
// por la probabilidad estimada de que haya bicis ahora (ver js/prediccion.js):
// 0 a 25 % rojo · 26 a 69 % naranja · 70 a 100 % amarillo.
let marcaHome;
const COLOR_NIVEL = { alta: "#ffd400", media: "#f76c09", baja: "#e5202e" };
function estacionesGeoJSON() {
  const ahora = new Date();
  return { type: "FeatureCollection", features: ESTACIONES.map(e => {
    const p = PRED.predecirEstacion(e.numero, ahora, 0);
    return { type: "Feature", geometry: { type: "Point", coordinates: [e.lon, e.lat] },
      properties: { nombre: e.nombre, nivel: p.nivelBicis, pct: pct(p.bicis) } };
  }) };
}
function pintarMapaHome() {
  if (!window.maplibregl) return;
  if (mapaHome) {                                   // volvió a Home: recentrar en el punto de salida y refrescar estaciones
    mapaHome.resize(); mapaHome.jumpTo({ center: [ORIGEN.lon, ORIGEN.lat], zoom: 14.5, padding: { top: 0, left: 0, right: 0, bottom: Math.round(hojaInicio.visiblePx()) } });
    marcaHome.setLngLat([ORIGEN.lon, ORIGEN.lat]);
    mapaHome.getSource("estaciones")?.setData(estacionesGeoJSON());
    return;
  }
  mapaHome = new maplibregl.Map({ container: "mapa-home", style: ENV.OPENFREEMAP_STYLE_URL, center: [ORIGEN.lon, ORIGEN.lat],
    zoom: 14.5, attributionControl: false });
  mapaHome.jumpTo({ padding: { top: 0, left: 0, right: 0, bottom: Math.round(hojaInicio.visiblePx()) } });
  mapaHome.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  mapaHome.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
  const punto = document.createElement("div");
  punto.style.cssText = "width:18px;height:18px;border-radius:50%;background:#203ae9;border:3px solid #fff;box-shadow:0 0 0 10px rgba(32,58,233,.25)";
  marcaHome = new maplibregl.Marker({ element: punto }).setLngLat([ORIGEN.lon, ORIGEN.lat]).addTo(mapaHome);
  mapaHome.once("style.load", () => {
    mapaHome.addSource("estaciones", { type: "geojson", data: estacionesGeoJSON() });
    mapaHome.addLayer({ id: "estaciones", type: "circle", source: "estaciones", paint: {
      "circle-radius": 8, "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff",
      "circle-color": ["match", ["get", "nivel"], "alta", COLOR_NIVEL.alta, "media", COLOR_NIVEL.media, COLOR_NIVEL.baja] } });
  });
  mapaHome.on("click", "estaciones", e => {
    const f = e.features[0].properties;
    new maplibregl.Popup({ offset: 12 }).setLngLat(e.lngLat)
      .setHTML(`<strong>${esc(f.nombre)}</strong><br>Bicis: ${esc(f.nivel)} (${esc(f.pct)}) · estimado`).addTo(mapaHome);
  });
  mapaHome.on("mouseenter", "estaciones", () => { mapaHome.getCanvas().style.cursor = "pointer"; });
  mapaHome.on("mouseleave", "estaciones", () => { mapaHome.getCanvas().style.cursor = ""; });
}
const hojaInicio = hacerDeslizable($("#hoja-inicio"), () => ajustarMapa(mapaHome, hojaInicio));

// Clima actual (OpenWeather)
let clima = null;
async function cargarClima() {
  const el = $("#clima");
  if (!ENV.OPENWEATHER_API_KEY) { el.textContent = "Clima no disponible"; return; }
  try {
    const r = await fetch(`${ENV.OPENWEATHER_URL}?lat=${ORIGEN.lat}&lon=${ORIGEN.lon}&units=metric&lang=es&appid=${ENV.OPENWEATHER_API_KEY}`);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    clima = { temp: d.main.temp, descripcion: d.weather[0].description, lluvia: d.rain?.["1h"] || 0, viento: d.wind.speed * 3.6 };
    el.textContent = `${Math.round(clima.temp)} °C · ${clima.descripcion}${clima.lluvia ? ` · lluvia ${clima.lluvia} mm` : ""}`;
  } catch { el.textContent = "Clima no disponible"; }
}
const climaTexto = () => clima ? `${Math.round(clima.temp)} °C, ${clima.descripcion}, lluvia ${clima.lluvia} mm, viento ${Math.round(clima.viento)} km/h` : "sin dato";
cargarClima();

// "Últimas fechas disponibles": actividades de noviembre que todavía no terminaron
function pintarFechas() {
  const hoy = new Date().toISOString().slice(0, 10);
  const lista = ACTIVIDADES.filter(a => !a.hasta || a.hasta >= hoy)
    .sort((a, b) => (a.hasta || "9999") < (b.hasta || "9999") ? -1 : 1).slice(0, 8);
  $("#fechas").innerHTML = lista.map(a => {
    const lugar = porId(a.lugar_id);
    const etiqueta = a.hasta ? `HASTA ${a.hasta.slice(8, 10)}/${a.hasta.slice(5, 7)}` : a.tipo.toUpperCase();
    const cuando = a.abre ? HOR.resumenActividad(a.dias, a.abre, a.cierra) : "";
    const dato = cuando ? `${a.lugar} · ${cuando}` : a.lugar;
    return tarjetaLugarHTML({ lugar, etiqueta, titulo: a.nombre, metas: [dato], textoSinImagen: a.tipo });
  }).join("") || `<p class="nota">No hay fechas cargadas.</p>`;
}

// "Para vos": la IA ordena los lugares que coinciden con tus intereses; sin IA se ordenan por cercanía
async function pintarParaVos() {
  const cont = $("#para-vos"), origen = $("#para-vos-origen");
  const candidatos = LUGARES.filter(l => estado.intereses.includes(l.categoria) && desdeOrigen(l) <= 5)
    .sort((a, b) => desdeOrigen(a) - desdeOrigen(b)).slice(0, 10);
  const dibujar = (lista, nota) => {
    cont.innerHTML = lista.map(l => tarjetaLugarHTML({ lugar: l, etiqueta: "CERCA TUYO", titulo: l.nombre,
      metas: [`${fmtKm(desdeOrigen(l))} · ${l.barrio}`], textoSinImagen: l.categoria })).join("")
      || `<p class="nota">No hay lugares de tus intereses a menos de 5 km.</p>`;
    origen.textContent = nota;
  };
  if (!candidatos.length) { dibujar([], ""); return; }
  dibujar(candidatos.slice(0, 6), "Ordenados por cercanía.");

  const guardado = sessionStorage.getItem("pedalito_paravos");
  let ids = guardado ? JSON.parse(guardado) : null;
  if (!ids) {
    try {
      const pregunta = `Elegí y ordená los 6 lugares que más le convienen a una persona con estos intereses: ${estado.intereses.join(", ")}.
Hora: ${new Date().getHours()} h. Clima: ${climaTexto()}. Si llueve, priorizá lugares cubiertos.
Elegí SOLO entre estos (id · nombre · categoría · km): ${candidatos.map(l => `${l.id} · ${l.nombre} · ${l.categoria} · ${fmtKm(desdeOrigen(l))}`).join("; ")}.
Respondé en JSON: {"ids":[números en orden de recomendación]}`;
      const r = await fetch(ENV.IA_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pregunta, formato: "json" }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      ids = JSON.parse(d.texto).ids.map(Number).filter(id => candidatos.some(l => l.id === id)).slice(0, 6);
      if (!ids.length) throw new Error("sin ids válidos");
      sessionStorage.setItem("pedalito_paravos", JSON.stringify(ids));
    } catch { return; } // sin IA (por ejemplo, abriendo el archivo en la compu) queda el orden por cercanía
  }
  dibujar(ids.map(porId), "Sugerido por IA según tus intereses, la hora y el clima.");
}

// "Tendencias": los lugares más visitados en los últimos 7 días, sin importar a qué distancia queden (js/tendencias.js)
async function pintarTendencias() {
  const cont = $("#tendencias"), nota = $("#tendencias-nota");
  const { items, origen } = await TEND.ranking(10);
  const lista = items.filter(t => porId(t.id));
  cont.innerHTML = lista.map((t, i) => {
    const l = porId(t.id);
    return tarjetaLugarHTML({ lugar: l, etiqueta: `PUESTO ${i + 1}`, titulo: l.nombre, textoSinImagen: l.categoria,
      metas: [`${t.personas} persona${t.personas === 1 ? "" : "s"} · últimos 7 días`, `a ${fmtKm(desdeOrigen(l))}`] });
  }).join("") || `<p class="nota">Todavía no hay visitas esta semana. Cuando alguien inicie un recorrido, sus lugares aparecen acá.</p>`;
  nota.textContent = !lista.length ? "" : origen === "servidor"
    ? "Personas distintas que iniciaron un recorrido con ese lugar, de hoy a 7 días atrás. Se actualiza todos los días."
    : "Sin conexión con el servidor: se muestran solo tus visitas de los últimos 7 días.";
}

// ---------- 04 · Explorar ----------
const COLOR_TARJETA = { naranja: "#f76c09", celeste: "#00baf1", verde: "#38ea59", rosa: "#f90083" };
const ZONA_FOCO = 90;             // px de scroll en los que una tarjeta pasa de tamaño normal a agrandada (= lo que se asoma de cada tarjeta apilada)
let mapaExp, marcaExp, geoPendiente;
// Los tres filtros son interruptores independientes: se pueden combinar o apagar todos (entonces se ve todo, del más cerca al más lejos)
const filtros = { cerca: true, intereses: false, verificado: false };
let limite = MAX_LISTA;           // cuántos lugares se muestran; "Ver más" suma otra tanda

function pintarExplorar({ masLugares = false } = {}) {
  const q = $("#buscador").value.trim().toLowerCase();
  let lista = LUGARES.filter(l => !q || (l.nombre + " " + l.categoria + " " + l.barrio).toLowerCase().includes(q));
  if (filtros.intereses) lista = lista.filter(l => estado.intereses.includes(l.categoria));
  if (filtros.verificado) lista = lista.filter(l => l.verificado);
  if (filtros.cerca) lista = lista.filter(l => desdeOrigen(l) <= 5);
  lista.sort((a, b) => desdeOrigen(a) - desdeOrigen(b));
  const mostrados = lista.slice(0, limite);
  $("#cantidad").textContent = lista.length > mostrados.length ? `Mostrando ${mostrados.length} de ${lista.length} lugares` : `${lista.length} lugares`;
  $("#lista-lugares").innerHTML = mostrados.map((l, i) => `
    <a class="tarjeta-apilada ${COLORES[i % COLORES.length]}" href="#lugar/${l.id}">
      <strong>${esc(l.nombre)}</strong>
      <span>${esc(l.categoria)} · ${fmtKm(desdeOrigen(l))} · ${esc(l.barrio)}</span>
      <span class="ver">Ver lugar →</span>
    </a>`).join("");
  $("#ver-mas").hidden = lista.length <= mostrados.length;
  $("#ver-mas").textContent = `Ver más lugares (${Math.min(MAX_LISTA, lista.length - mostrados.length)} más)`;
  $$("#filtros .chip").forEach(c => { c.classList.toggle("activo", filtros[c.dataset.filtro]); c.setAttribute("aria-pressed", filtros[c.dataset.filtro]); });
  medirFoco();
  pintarMapaExplorar(mostrados, !masLugares);   // con "Ver más" el mapa no se vuelve a encuadrar
}
const reiniciarLista = () => { limite = MAX_LISTA; $("#hoja-explorar .hoja-scroll").scrollTop = 0; pintarExplorar(); };
$("#buscador").addEventListener("input", reiniciarLista);
$("#filtros").addEventListener("click", e => {
  const f = e.target.dataset.filtro; if (!f) return;
  filtros[f] = !filtros[f];                       // tocar de nuevo apaga el filtro
  reiniciarLista();
});
$("#ver-mas").addEventListener("click", () => { limite += MAX_LISTA; pintarExplorar({ masLugares: true }); });

// Las tarjetas de colores crecen (y su texto también) al pasar por la altura de la primera; antes y después vuelven a su tamaño.
let focoBase = 0;
function medirFoco() { const primera = $("#lista-lugares").firstElementChild; focoBase = primera ? primera.offsetTop : 0; actualizarFoco(); }
function actualizarFoco() {
  const scroll = $("#hoja-explorar .hoja-scroll");
  [...$("#lista-lugares").children].forEach(c => {
    const d = (c.offsetTop - scroll.scrollTop) - focoBase;                  // + = todavía no llegó a la altura de la primera
    const f = Math.max(0, 1 - Math.abs(d) / ZONA_FOCO);
    c.style.setProperty("--f", f.toFixed(3));
    c.style.setProperty("--o", (d > 0 ? 1 - 0.55 * Math.min(1, d / ZONA_FOCO) : 1).toFixed(3));   // las de abajo, que aún no estás viendo, se apagan
    c.style.zIndex = f > 0.05 ? String(10 + Math.round(f * 10)) : "";       // la que crece queda por encima de las vecinas
  });
}
let focoPendiente = false;
$("#hoja-explorar .hoja-scroll").addEventListener("scroll", () => {
  if (focoPendiente) return; focoPendiente = true;
  requestAnimationFrame(() => { focoPendiente = false; actualizarFoco(); });
}, { passive: true });

// Mapa de fondo de Explorar: tu punto de salida y los lugares de la lista, con el color de su tarjeta
function pintarMapaExplorar(lista, reencuadrar = true) {
  if (!window.maplibregl) return;
  const geo = { type: "FeatureCollection", features: lista.map((l, i) => ({ type: "Feature",
    geometry: { type: "Point", coordinates: [l.lon, l.lat] },
    properties: { id: l.id, nombre: l.nombre, color: COLOR_TARJETA[COLORES[i % COLORES.length]] } })) };
  if (!mapaExp) {
    geoPendiente = geo;
    mapaExp = new maplibregl.Map({ container: "mapa-explorar", style: ENV.OPENFREEMAP_STYLE_URL, center: [ORIGEN.lon, ORIGEN.lat], zoom: 14, attributionControl: false });
    mapaExp.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapaExp.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
    const punto = document.createElement("div");
    punto.style.cssText = "width:18px;height:18px;border-radius:50%;background:#203ae9;border:3px solid #fff;box-shadow:0 0 0 10px rgba(32,58,233,.25)";
    marcaExp = new maplibregl.Marker({ element: punto }).setLngLat([ORIGEN.lon, ORIGEN.lat]).addTo(mapaExp);
    mapaExp.once("style.load", () => {
      mapaExp.addSource("lugares", { type: "geojson", data: geoPendiente });
      mapaExp.addLayer({ id: "lugares", type: "circle", source: "lugares", paint: {
        "circle-radius": 9, "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff", "circle-color": ["get", "color"] } });
    });
    mapaExp.on("click", "lugares", e => {
      const f = e.features[0].properties;
      new maplibregl.Popup({ offset: 12 }).setLngLat(e.lngLat).setHTML(`<strong>${esc(f.nombre)}</strong><br><a href="#lugar/${f.id}">Ver lugar →</a>`).addTo(mapaExp);
    });
  } else {
    geoPendiente = geo; mapaExp.resize();
    marcaExp.setLngLat([ORIGEN.lon, ORIGEN.lat]);
    mapaExp.getSource("lugares")?.setData(geo);
  }
  // Encuadre: tu punto y los lugares, en la parte del mapa que no tapa el panel
  if (!reencuadrar) return;
  const puntos = [ORIGEN, ...lista], lons = puntos.map(p => p.lon), lats = puntos.map(p => p.lat);
  mapaExp.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    { padding: { top: 70, left: 30, right: 30, bottom: Math.round(hojaExplorar.visiblePx()) + 20 }, maxZoom: 15.5, duration: 400 });
}
const hojaExplorar = hacerDeslizable($("#hoja-explorar"), () => {
  if (mapaExp) mapaExp.easeTo({ padding: { top: 0, left: 0, right: 0, bottom: Math.round(hojaExplorar.visiblePx()) }, duration: 300 });
});

// ---------- 11 · Detalle lugar ----------
// Horarios: se reinterpreta el texto del dataset (js/horarios.js) y se muestra como una semana de un vistazo.
// Si no se puede entender con certeza, se muestra el texto original, sin inventar nada.
function pintarHorarios(l) {
  const cont = $("#detalle-horarios"), h = HOR.interpretar(l.horario);
  const fuente = [l.cerrado ? `Cerrado: ${esc(l.cerrado)}.` : "", l.fuente_horario ? `Fuente: ${esc(l.fuente_horario)}.` : ""].filter(Boolean).join(" ");
  const pie = `<p class="horarios-nota">${fuente} Verificá horarios antes de salir.</p>`;
  if (!l.horario) { cont.innerHTML = `<p class="etiqueta">Horarios</p><p class="horarios-texto">Este lugar no tiene horario cargado.</p>${pie}`; return; }
  if (!h.ok || h.dudoso) {
    cont.innerHTML = `<p class="etiqueta">Horarios</p><p class="horarios-texto">${esc(l.horario)}</p>
      <p class="horarios-nota">No pudimos ordenar este horario con certeza, así que lo mostramos tal como figura en los datos.</p>${pie}`;
    return;
  }
  const hoy = (new Date().getDay() + 6) % 7, estadoHoy = HOR.estadoAhora(h);
  const dias = h.semana.map((d, i) => {
    const horas = d.cerrado ? `<span class="cerrado">Cerrado</span>`
      : d.texto ? `<span>${esc(d.texto)}</span>` : d.tramos.map(t => `<span>${esc(HOR.tramoCorto(t))}</span>`).join("");
    return `<li class="dia ${d.cerrado ? "cerrado" : "abierto"} ${i === hoy ? "hoy" : ""}" ${i === hoy ? 'aria-current="date"' : ""}><b>${HOR.INICIAL[i]}</b>${horas}</li>`;
  }).join("");
  cont.innerHTML = `
    <div class="horarios-cab"><p class="etiqueta">Horarios</p>
      ${estadoHoy ? `<span class="estado ${estadoHoy.abierto ? "abierto" : "cerrado"}">${esc(estadoHoy.texto)}</span>` : ""}</div>
    <ul class="semana">${dias}</ul>
    ${h.notas.length ? `<p class="horarios-notas">${h.notas.map(esc).join(" · ")}</p>` : ""}${pie}`;
}

function pintarLugar(id) {
  const l = porId(id);
  if (!l) { location.hash = "explorar"; return; }
  const hero = $("#detalle-hero");
  hero.style.backgroundImage = l.img ? `url("${fotoUrl(l)}")` : "";
  $("#detalle-categoria").textContent = l.categoria;
  $("#detalle-nombre").textContent = l.nombre;
  $("#detalle-meta").textContent = `${fmtKm(desdeOrigen(l))} · ${l.barrio}`;
  $("#detalle-desc").textContent = `${l.direccion}. Estación EcoBici más cercana a ${l.dist_m} m.`;
  pintarHorarios(l);
  const credito = $("#detalle-credito");
  credito.hidden = !l.foto;
  if (l.foto) credito.innerHTML = `Foto: ${esc(l.foto.autor)} · <a href="${esc(l.foto.pagina)}" target="_blank" rel="noopener">${esc(l.foto.licencia)}</a> · Wikimedia Commons`;
  const guardado = estado.guardados.includes(l.id);
  $("#guardar-lugar").textContent = guardado ? "♥" : "♡";
  $("#guardar-lugar").onclick = () => {
    const i = estado.guardados.indexOf(l.id);
    if (i >= 0) estado.guardados.splice(i, 1); else estado.guardados.push(l.id);
    guardarEstado(); pintarLugar(id);
  };
  $("#detalle-sumar").onclick = () => {
    if (!estado.destinos.includes(l.id) && estado.destinos.length < MAX_DESTINOS) estado.destinos.push(l.id);
    plan.modo = "destino"; plan.tramos = null; guardarEstado(); location.hash = "planificar";
  };
}

// ---------- 05 · Planificar ----------
// "Desde" lo elegiste al entrar. "Hasta" es opcional: si lo completás, el recorrido termina ahí.
// En modo "con destino" podés sumar uno o más espacios para visitar (hasta 5).
function buscarPuntos(q, { estaciones = true, excluir = [] } = {}) {
  const t = sinTildes(q.trim()); if (t.length < 2) return [];
  const est = estaciones ? ESTACIONES.filter(e => sinTildes(e.nombre).includes(t))
    .map(e => ({ nombre: `Estación ${e.nombre}`, detalle: e.barrio, lat: e.lat, lon: e.lon })) : [];
  const lug = LUGARES.filter(l => !excluir.includes(l.id) && sinTildes(l.nombre).includes(t))
    .sort((a, b) => desdeOrigen(a) - desdeOrigen(b))
    .map(l => ({ nombre: l.nombre, detalle: `${l.categoria} · ${l.barrio} · ${fmtKm(desdeOrigen(l))}`, lat: l.lat, lon: l.lon, id: l.id }));
  return [...est, ...lug].slice(0, 6);
}
function listaSugerencias(ul, items) {
  ul.innerHTML = items.map((s, i) => `<li><button type="button" data-i="${i}">${esc(s.nombre)}<small>${esc(s.detalle)}</small></button></li>`).join("")
    || `<li><small style="padding:10px 14px">No encontramos ese lugar.</small></li>`;
  ul.hidden = false;
}

let sugHasta = [], sugDestino = [], agregando = false;
function pintarPlanificar() {
  $("#origen").value = `⌖ ${ORIGEN.nombre}`;
  $("#hasta").value = plan.hasta ? plan.hasta.nombre : "";
  $$("[data-modo]").forEach(m => m.classList.toggle("activo", m.dataset.modo === plan.modo));
  const n = estado.destinos.length, conDestino = plan.modo === "destino";
  $("#destino-elegido").textContent = n ? `⌖ ${n} espacio${n > 1 ? "s" : ""} para visitar` : "⌖ Buscar museo, café, teatro…";
  const ul = $("#destinos-elegidos");
  ul.hidden = !conDestino || !n;
  ul.innerHTML = estado.destinos.map(porId).filter(Boolean).map((l, i) =>
    `<li><span><strong>${i + 1} · ${esc(l.nombre)}</strong><small>${esc(l.categoria)} · ${fmtKm(desdeOrigen(l))}</small></span>
     <button type="button" data-quitar="${l.id}" aria-label="Quitar ${esc(l.nombre)}">✕</button></li>`).join("");
  const buscando = conDestino && (agregando || n === 0);
  $("#buscar-destino").hidden = !buscando;
  $("#agregar-espacio").hidden = !conDestino || !n || buscando || n >= MAX_DESTINOS;
}
$$("[data-modo]").forEach(m => m.addEventListener("click", () => {
  plan.modo = m.dataset.modo; plan.tramos = null;
  agregando = m.dataset.modo === "destino" && estado.destinos.length === 0;
  pintarPlanificar();
  if (agregando) $("#destino-q").focus();
}));
$("#agregar-espacio").addEventListener("click", () => { agregando = true; pintarPlanificar(); $("#destino-q").focus(); });
$("#destinos-elegidos").addEventListener("click", e => {
  const b = e.target.closest("[data-quitar]"); if (!b) return;
  estado.destinos = estado.destinos.filter(id => id !== Number(b.dataset.quitar));
  plan.tramos = null; guardarEstado(); pintarPlanificar();
});
$("#destino-q").addEventListener("input", () => {
  const items = buscarPuntos($("#destino-q").value, { estaciones: false, excluir: estado.destinos });
  sugDestino = items;
  if ($("#destino-q").value.trim().length < 2) $("#sugerencias-destino").hidden = true; else listaSugerencias($("#sugerencias-destino"), items);
});
$("#sugerencias-destino").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const s = sugDestino[Number(b.dataset.i)];
  if (estado.destinos.length >= MAX_DESTINOS) { aviso(`Podés sumar hasta ${MAX_DESTINOS} lugares.`); return; }
  estado.destinos.push(s.id); plan.tramos = null; guardarEstado();
  $("#destino-q").value = ""; $("#sugerencias-destino").hidden = true; agregando = false;
  pintarPlanificar();
});
$("#hasta").addEventListener("input", () => {
  const q = $("#hasta").value;
  if (!q.trim()) { plan.hasta = null; plan.tramos = null; $("#sugerencias-hasta").hidden = true; return; }
  sugHasta = buscarPuntos(q);
  if (q.trim().length < 2) $("#sugerencias-hasta").hidden = true; else listaSugerencias($("#sugerencias-hasta"), sugHasta);
});
$("#sugerencias-hasta").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const s = sugHasta[Number(b.dataset.i)];
  plan.hasta = { nombre: s.nombre, lat: s.lat, lon: s.lon }; plan.tramos = null;
  $("#hasta").value = s.nombre; $("#sugerencias-hasta").hidden = true;
});
$("#tiempos").addEventListener("click", e => {
  if (!e.target.dataset.min) return;
  plan.minutos = Number(e.target.dataset.min);
  $$("#tiempos .chip").forEach(c => c.classList.toggle("activo", c === e.target));
});
$("#distancias").addEventListener("click", e => {
  if (!e.target.dataset.km) return;
  plan.maxKm = Number(e.target.dataset.km);
  $$("#distancias .chip").forEach(c => c.classList.toggle("activo", c === e.target));
});
$("#buscar-recorrido").addEventListener("click", () => {
  if (plan.modo === "destino" && !estado.destinos.length) { aviso("Sumá al menos un espacio o elegí «Sorprendeme»."); return; }
  plan.tramos = null; location.hash = "recorrido";                // un recorrido nuevo cada vez
});

// ---------- 06 · Recorrido ----------
// La IA decide QUÉ lugares visitar, en qué orden, en qué estación retirar y devolver la bici y qué trazado tomar.
// El trazado en sí (por calles) lo calcula el ruteo de OpenStreetMap (js/ruteo.js): una IA de texto no puede
// dibujar un camino correcto sobre el mapa. Solo se usan estaciones vigentes (data/estaciones_modelo.js).
const RUTEO = window.PedalitoRuteo;
const CAMINATA_MAX_M = 450;       // si el próximo lugar queda a menos, se va a pie
const TRAMO_MIN_M = 40;           // tramos más cortos no se dibujan
const RADIO_ESTACION_KM = 0.7;
const metros = (a, b) => PRED.distKm(a, b) * 1000;
const fmtM = m => m >= 1000 ? fmtKm(m / 1000) : `${Math.round(m / 10) * 10} m`;
const minutosDe = seg => Math.max(1, Math.round(seg / 60));

const MIN_BICI_KM = 0.8;          // por debajo de esto conviene caminar: no tiene sentido sacar una bici

/** Hasta `n` elementos repartidos parejo a lo largo de una lista ordenada (no solo los primeros). */
function repartidos(lista, n) {
  if (n <= 0) return [];
  if (lista.length <= n) return lista;
  if (n === 1) return [lista[0]];
  const paso = (lista.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => lista[Math.round(i * paso)]);
}

/** Lugares que la persona eligió sumar (modo "con destino"): todos son obligatorios en el recorrido. */
const obligatorios = () => plan.modo === "destino" ? estado.destinos.map(porId).filter(Boolean) : [];
/** Ordena una lista de lugares yendo siempre al más cercano al anterior (para no zigzaguear si la IA no responde). */
function ordenarPorCercania(lugares) {
  const resto = [...lugares], orden = []; let actual = ORIGEN;
  while (resto.length) {
    const i = resto.reduce((m, l, j) => metros(actual, l) < metros(actual, resto[m]) ? j : m, 0);
    actual = resto.splice(i, 1)[0]; orden.push(actual);
  }
  return orden;
}

function candidatos() {
  const rango = LUGARES.filter(l => desdeOrigen(l) <= plan.maxKm);
  const elegidos = obligatorios();
  const propios = l => estado.intereses.includes(l.categoria);
  const porDistancia = (a, b) => desdeOrigen(a) - desdeOrigen(b);
  if (elegidos.length) {                              // los elegidos van siempre, aunque queden más lejos que la distancia máxima
    const ids = new Set(elegidos.map(l => l.id));
    return [...elegidos, ...repartidos(rango.filter(l => !ids.has(l.id) && propios(l) && desdeOrigen(l) >= MIN_BICI_KM).sort(porDistancia), 8 - elegidos.length)];
  }
  // Lugares de tus intereses a distancia de bici (no los pegados a la salida), repartidos hasta la distancia máxima
  const lejos = rango.filter(l => desdeOrigen(l) >= MIN_BICI_KM).sort(porDistancia);
  const propiosLejos = lejos.filter(propios);
  return repartidos(propiosLejos.length >= 3 ? propiosLejos : lejos, 8);
}

async function preguntarIA(pregunta) {
  const r = await fetch(ENV.IA_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pregunta, formato: "json" }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error);
  return JSON.parse(d.texto);
}
const lineaEstacion = e => `${e.numero} · ${e.nombre} · a ${e.distM} m`;

let armando = 0;
async function armarRecorrido() {
  if (plan.tramos) { $("#leyenda").hidden = false; pintarRecorrido(); return; }   // volvió con la flecha: no se rearma (la guía sigue en el mismo paso)
  const sesion = ++armando, ahora = new Date();
  hojaRecorrido.poner(false);                      // recorrido nuevo: el panel arranca abierto
  $("#recorrido-resumen").textContent = "Armando tu recorrido…";
  $("#paso-texto").textContent = "Armando tu recorrido…"; $("#paso-meta").textContent = ""; $("#paso-icono").textContent = "…"; $("#iniciar").disabled = true;
  $("#propuesta-texto").textContent = ""; $("#paradas").innerHTML = ""; $("#leyenda").hidden = true;
  const lista = candidatos(), elegidos = obligatorios().map(l => l.id);
  const cuantos = Math.max(LUGARES_POR_TIEMPO[plan.minutos], elegidos.length);   // los elegidos no se recortan por el tiempo
  if (!lista.length) { $("#recorrido-resumen").textContent = "No hay lugares con esos filtros. Probá con más distancia."; return; }

  // 1) Opciones reales para que la IA elija: estaciones vigentes para retirar y para devolver cerca de cada lugar
  const retiros = PRED.estacionesCerca(ORIGEN, "bicis", ahora, 0, RADIO_ESTACION_KM, 3);
  const devoluciones = {};
  lista.forEach(l => { devoluciones[l.id] = PRED.estacionesCerca(l, "anclajes", ahora, Math.round(desdeOrigen(l) / VELOCIDAD_KMH * 60), RADIO_ESTACION_KM, 3); });
  if (!retiros.length) { $("#recorrido-resumen").textContent = "No hay estaciones EcoBici a 700 m de tu salida."; return; }
  const numeros = [...retiros, ...lista.flatMap(l => devoluciones[l.id])].map(e => e.numero);
  const corredores = PRED.corredoresEntre(numeros).slice(0, 6);
  const nom = n => (retiros.concat(...Object.values(devoluciones)).find(e => e.numero === n) || {}).nombre || n;

  // 2) La IA elige lugares, orden y estaciones
  let ids, retiro, devol = {}, texto, porIA = true;
  try {
    const json = await preguntarIA(`Armá un recorrido cultural en EcoBici saliendo de ${ORIGEN.nombre} (${ahora.getHours()} h).
Tiempo: ${plan.minutos} minutos (elegí ${cuantos} lugar/es). Intereses: ${estado.intereses.join(", ")}. Clima: ${climaTexto()}.
${elegidos.length ? `LUGARES OBLIGATORIOS (la persona los eligió, tienen que estar todos en el recorrido): ${elegidos.join(", ")}. Podés sumar otros solo si sobra tiempo.` : ""}
${plan.hasta ? `La persona quiere TERMINAR en "${plan.hasta.nombre}": ordená los lugares para que el último quede de camino hacia ahí.` : ""}
LUGARES (id · nombre · categoría · km desde la salida · horario):
${lista.map(l => `${l.id} · ${l.nombre} · ${l.categoria} · ${fmtKm(desdeOrigen(l))} · ${l.horario ? HOR.resumen(l.horario) : "sin dato"}`).join("\n")}
ESTACIONES PARA RETIRAR (número · nombre · distancia · probabilidad de bicis): ${retiros.map(e => `${lineaEstacion(e)} · ${e.nivelBicis}`).join(" | ")}
ESTACIONES PARA DEVOLVER, por lugar (número · nombre · distancia al lugar · probabilidad de anclajes libres):
${lista.map(l => `lugar ${l.id}: ${devoluciones[l.id].map(e => `${lineaEstacion(e)} · ${e.nivelAnclajes}`).join(" | ") || "ninguna"}`).join("\n")}
CORREDORES MÁS USADOS en 2024 entre estas estaciones: ${corredores.map(c => `${nom(c.desde)} → ${nom(c.hasta)} (${c.viajes} viajes)`).join("; ") || "sin datos"}.
Reglas: elegí SOLO números de las listas, no inventes lugares ni estaciones; preferí estaciones con probabilidad alta pero cercanas (caminar hasta la estación también cuenta) y los corredores usados; que el orden evite volver sobre tus pasos.
Respondé en JSON: {"ids":[ids en orden de visita],"retiro":número,"devolucion":{"idLugar":númeroEstación},"texto":"2 a 3 oraciones cercanas que justifiquen el recorrido"}`);
    ids = [...new Set((json.ids || []).map(Number).filter(id => lista.some(l => l.id === id)))];
    if (!ids.length) throw new Error("sin lugares válidos");
    elegidos.forEach(id => { if (!ids.includes(id)) ids.push(id); });            // la IA no puede dejar afuera un lugar elegido
    while (ids.length > cuantos) { const i = ids.findLastIndex(id => !elegidos.includes(id)); if (i < 0) break; ids.splice(i, 1); }
    retiro = retiros.find(e => e.numero === Number(json.retiro)) || retiros[0];
    ids.forEach(id => { devol[id] = devoluciones[id].find(e => e.numero === Number((json.devolucion || {})[id])) || devoluciones[id][0]; });
    texto = json.texto;
  } catch {
    porIA = false;                                 // sin IA (por ejemplo, abriendo el archivo local): reglas simples
    const base = [...elegidos.map(porId), ...lista.filter(l => !elegidos.includes(l.id))].slice(0, cuantos);
    ids = ordenarPorCercania(base).map(l => l.id); retiro = retiros[0];
    ids.forEach(id => { devol[id] = devoluciones[id][0]; });
    texto = `Te proponemos ${ids.map(id => porId(id).nombre).join(", ")}${elegidos.length ? ", los lugares que elegiste" : ", los más cercanos a tus intereses"}.`;
  }
  if (sesion !== armando) return;
  ids = ids.filter(id => devol[id]);               // un lugar sin estación de devolución cerca no se puede hacer en bici
  if (!ids.length) { $("#recorrido-resumen").textContent = "Esos lugares no tienen estación EcoBici cerca."; return; }

  // 3) Tramos: a pie hasta la estación, en bici entre estaciones, a pie hasta el lugar
  const tramos = armarTramos(ids.map(porId), retiro, devol, ahora, plan.hasta);

  // 4) Trazado real por calles de cada tramo (en bici se piden alternativas)
  await Promise.all(tramos.filter(t => t.modo !== "llegada").map(async t => { t.rutas = await RUTEO.ruta(t.modo, t.desde, t.hasta, t.modo === "bici"); }));
  if (sesion !== armando) return;

  // 5) La IA elige entre los trazados alternativos de cada tramo en bici
  let eleccionIA = false;
  const conAlternativas = tramos.filter(t => t.modo === "bici" && t.rutas?.length > 1);
  tramos.forEach(t => { t.elegida = 0; });
  if (conAlternativas.length) {
    conAlternativas.forEach(t => { t.elegida = mejorPorReglas(t.rutas); });
    try {
      const json = await preguntarIA(`Elegí el mejor trazado en bici para cada tramo. Priorizá ir por ciclovía y seguro; aceptá hasta un 25 % más de tiempo si gana en ciclovía. Clima: ${climaTexto()}.
${conAlternativas.map((t, i) => `Tramo ${i}: ${t.desde.nombre} → ${t.hasta.nombre}\n` +
  t.rutas.map((r, j) => `  opción ${j}: ${fmtM(r.metros)}, ${minutosDe(r.segundos)} min, ${r.pctCiclovia} % por ciclovía`).join("\n")).join("\n")}
Respondé en JSON: {"opciones":[número de opción elegida para el tramo 0, tramo 1, …]}`);
      conAlternativas.forEach((t, i) => { const o = Number((json.opciones || [])[i]); if (t.rutas[o]) t.elegida = o; });
      eleccionIA = true;
    } catch { /* queda la elección por reglas */ }
  }
  if (sesion !== armando) return;

  const ultimaBici = [...tramos].reverse().find(t => t.devolucion);
  plan.ids = ids; plan.tramos = tramos; plan.estaciones = { retiro, devolucion: ultimaBici?.devolucion || devol[ids[ids.length - 1]] };
  plan.textoBase = `${texto} ${porIA ? "(Recorrido armado por IA" + (eleccionIA ? ", incluido el trazado)" : ")") : "(Armado por reglas simples: la IA no respondió)"}`;
  pintarRecorrido();
}

/** Alternativa que más conviene sin IA: menor tiempo, con un descuento por ir por ciclovía. */
function mejorPorReglas(rutas) {
  const puntaje = r => r.segundos * (1 - 0.4 * r.pctCiclovia / 100);
  return rutas.reduce((m, r, i) => puntaje(r) < puntaje(rutas[m]) ? i : m, 0);
}

function armarTramos(paradas, retiro, devol, ahora, hasta) {
  const tramos = [];
  const punto = (p, nombre) => ({ lat: p.lat, lon: p.lon, nombre: nombre || p.nombre });
  // Un tramo a pie de menos de 40 m no se dibuja; si era la llegada a un lugar, queda un tramo "llegada" para festejarla igual
  const pie = (a, b, tipo) => {
    if (metros(a, b) >= TRAMO_MIN_M) tramos.push({ modo: "pie", tipo, desde: a, hasta: b });
    else if (tipo === "lugar" || tipo === "final") tramos.push({ modo: "llegada", tipo, hasta: b });
  };
  let actual = punto(ORIGEN), estacionActual = null;   // estacionActual: estación donde dejé la última bici

  paradas.forEach((lugar, k) => {
    const meta = punto(lugar), dev = devol[lugar.id];
    if (metros(actual, meta) <= CAMINATA_MAX_M) {      // queda cerca: se va caminando
      pie(actual, meta, "lugar"); actual = meta; estacionActual = null; return;
    }
    // Salida: el retiro elegido (primer tramo), la estación donde dejé la bici si me queda a mano (≤ 250 m),
    // y si no, la mejor estación cerca de donde estoy (no tiene sentido volver sobre mis pasos).
    const salida = k === 0 ? retiro
      : (estacionActual && metros(actual, estacionActual) <= 250 ? estacionActual
        : PRED.estacionesCerca(actual, "bicis", ahora, 0, RADIO_ESTACION_KM, 1)[0]);
    if (!salida || salida.numero === dev.numero) { pie(actual, meta, "lugar"); actual = meta; estacionActual = null; return; }
    const sP = punto(salida, `estación ${salida.nombre}`), dP = punto(dev, `estación ${dev.nombre}`);
    pie(actual, sP, "estacion");                       // hasta la estación de retiro
    tramos.push({ modo: "bici", tipo: "bici", desde: sP, hasta: dP, retiro: salida, devolucion: dev });
    pie(dP, meta, "lugar");                            // de la estación al lugar
    actual = meta; estacionActual = dev;
  });

  // "Hasta" (opcional): el recorrido termina ahí, caminando si queda cerca o con otro tramo en bici
  if (hasta) {
    const meta = punto(hasta);
    const salida = estacionActual && metros(actual, estacionActual) <= 250 ? estacionActual
      : PRED.estacionesCerca(actual, "bicis", ahora, 0, RADIO_ESTACION_KM, 1)[0];
    const llegada = PRED.estacionesCerca(meta, "anclajes", ahora, Math.round(metros(actual, meta) / 1000 / VELOCIDAD_KMH * 60), RADIO_ESTACION_KM, 1)[0];
    if (metros(actual, meta) <= CAMINATA_MAX_M || !salida || !llegada || salida.numero === llegada.numero) {
      pie(actual, meta, "final");
    } else {
      const sP = punto(salida, `estación ${salida.nombre}`), dP = punto(llegada, `estación ${llegada.nombre}`);
      pie(actual, sP, "estacion");
      tramos.push({ modo: "bici", tipo: "bici", desde: sP, hasta: dP, retiro: salida, devolucion: llegada });
      pie(dP, meta, "final");
    }
  }
  return tramos;
}

let mapa, marcaYo, marcaPaso;
const GUIA = window.PedalitoGuia;
// Estado de la guía paso a paso. `pasos` sale de GUIA.construir; `i` es el paso que toca ahora.
const guia = { pasos: [], i: 0, activa: false, watch: null, tramos: null, ia: false, restante: null, sinGPS: false, hayFix: false,
  voz: estado.voz !== false, ultimoArrastre: 0 };
const hojaRecorrido = hacerDeslizable($("#hoja-recorrido"), () => ajustarMapa(mapa, hojaRecorrido));

function pintarRecorrido() {
  const tramos = plan.tramos.filter(t => t.modo !== "llegada");   // "llegada" = un lugar a menos de 40 m: no tiene trazado
  const validos = tramos.filter(t => t.rutas?.length), fallidos = tramos.length - validos.length;
  const elegida = t => t.rutas[t.elegida];
  const sum = modo => validos.filter(t => t.modo === modo).reduce((s, t) => s + elegida(t).metros, 0);
  const seg = validos.reduce((s, t) => s + elegida(t).segundos, 0);
  plan.mBici = sum("bici"); plan.mPie = sum("pie"); plan.km = plan.mBici / 1000; plan.minutosTotal = minutosDe(seg);

  $("#recorrido-resumen").textContent = `${fmtM(plan.mBici)} en bici · ${fmtM(plan.mPie)} a pie · ${plan.minutosTotal} min`;
  $("#leyenda").hidden = false;
  $("#propuesta-texto").textContent = plan.textoBase + (fallidos ? ` No pudimos calcular el trazado por calles de ${fallidos} tramo${fallidos > 1 ? "s" : ""}: no se dibujan para no mostrarte un camino que atraviese edificios.` : "");

  // Resumen por tramo, en tarjetas apiladas
  const resumen = tramos.map((t, i) => {
    const ok = t.rutas?.length, x = ok ? elegida(t) : null;
    if (t.modo === "pie") {
      const destino = t.tipo === "estacion" ? t.hasta.nombre : `a ${t.hasta.nombre}`;
      return `<div class="tarjeta-apilada noche"><strong>${i + 1} · Caminá ${t.tipo === "estacion" ? "hasta la " : ""}${esc(destino)}</strong>
        <span>${ok ? `${fmtM(x.metros)} a pie · ${minutosDe(x.segundos)} min` : "Trazado no disponible"}</span></div>`;
    }
    return `<div class="tarjeta-apilada celeste"><strong>${i + 1} · Pedaleá hasta la ${esc(t.hasta.nombre)}</strong>
      <span>${ok ? `${fmtM(x.metros)} en bici · ${minutosDe(x.segundos)} min · ${x.pctCiclovia} % por ciclovía` : "Trazado no disponible"}</span>
      <span>Retiro: ${esc(t.retiro.nombre)} (bicis: ${t.retiro.nivelBicis}) · Devolución: ${esc(t.devolucion.nombre)} (anclajes libres: ${t.devolucion.nivelAnclajes})</span></div>`;
  });
  $("#paradas").innerHTML = resumen.join("") || `<div class="tarjeta-apilada noche"><strong>Todo a pie</strong><span>Los lugares quedan a menos de ${CAMINATA_MAX_M} m.</span></div>`;

  if (guia.tramos !== plan.tramos) prepararGuia();   // recorrido nuevo: se arma la guía (y la IA redacta las instrucciones)
  pintarPaso();
  $("#iniciar").disabled = false;
  pintarMapaRecorrido(validos, elegida);
}

function pintarMapaRecorrido(validos, elegida) {
  if (!window.maplibregl) return;
  if (mapa) mapa.remove();
  marcaYo = null;
  const coords = validos.flatMap(t => elegida(t).coords);
  const extra = [ORIGEN, ...plan.ids.map(porId)];                       // por si todo el recorrido es a pie y sin trazado
  const puntos = [...coords.map(c => ({ lon: c[0], lat: c[1] })), ...extra];
  const lons = puntos.map(p => p.lon), lats = puntos.map(p => p.lat);
  mapa = new maplibregl.Map({ container: "mapa", style: ENV.OPENFREEMAP_STYLE_URL, attributionControl: false,
    bounds: [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    fitBoundsOptions: { padding: { top: 80, left: 30, right: 30, bottom: Math.round(hojaRecorrido.visiblePx()) + 30 }, maxZoom: 17 } });
  mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  mapa.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
  mapa.on("dragstart", () => { guia.ultimoArrastre = Date.now(); });   // si movés el mapa, la guía no te lo pelea por unos segundos
  const linea = modo => ({ type: "FeatureCollection", features: validos.filter(t => t.modo === modo).map(t =>
    ({ type: "Feature", geometry: { type: "LineString", coordinates: elegida(t).coords }, properties: {} })) });
  mapa.once("style.load", () => {              // no hace falta esperar a los tiles para dibujar las líneas
    if (window.PEDALITO_CICLOVIAS) {
      mapa.addSource("ciclovias", { type: "geojson", data: window.PEDALITO_CICLOVIAS });
      mapa.addLayer({ id: "ciclovias", type: "line", source: "ciclovias", paint: { "line-color": "#00baf1", "line-width": 2, "line-opacity": .45 } });
    }
    mapa.addSource("pie", { type: "geojson", data: linea("pie") });
    mapa.addLayer({ id: "pie", type: "line", source: "pie", layout: { "line-cap": "butt", "line-join": "round" },
      paint: { "line-color": "#092957", "line-width": 4, "line-dasharray": [1.2, 1.6] } });      // caminata: punteada
    mapa.addSource("bici", { type: "geojson", data: linea("bici") });
    mapa.addLayer({ id: "bici", type: "line", source: "bici", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#203ae9", "line-width": 5 } });                                      // bici: línea continua
  });
  const marca = (p, texto, fondo) => {
    const pin = document.createElement("div");
    pin.className = "pin"; pin.textContent = texto; pin.style.background = fondo;
    new maplibregl.Marker({ element: pin }).setLngLat([p.lon, p.lat]).setPopup(new maplibregl.Popup({ offset: 14 }).setText(p.nombre)).addTo(mapa);
  };
  const origenPin = document.createElement("div");
  origenPin.className = "pin"; origenPin.style.cssText += ";width:16px;height:16px;background:#092957";
  new maplibregl.Marker({ element: origenPin }).setLngLat([ORIGEN.lon, ORIGEN.lat]).addTo(mapa);
  validos.filter(t => t.modo === "bici").forEach(t => { marca(t.desde, "E", "#203ae9"); marca(t.hasta, "E", "#00baf1"); });
  plan.ids.map(porId).forEach((l, i) => marca(l, i + 1, "#f90083"));
  if (plan.hasta) marca({ lat: plan.hasta.lat, lon: plan.hasta.lon, nombre: `Final: ${plan.hasta.nombre}` }, "★", "#092957");
  // Anillo que marca el paso actual
  const anillo = document.createElement("div");
  anillo.className = "anillo-paso";
  marcaPaso = new maplibregl.Marker({ element: anillo }).setLngLat([ORIGEN.lon, ORIGEN.lat]).addTo(mapa);
  centrarPaso(false);
}

// ---------- Guía paso a paso ----------
let guiaSesion = 0;
function prepararGuia() {
  pausarGuia();
  guia.tramos = plan.tramos; guia.pasos = GUIA.construir(plan.tramos); guia.i = 0; guia.ia = false; guia.restante = null; guia.hayFix = false;
  const mia = ++guiaSesion;
  // La IA redacta las instrucciones en segundo plano; mientras tanto rige el texto automático
  GUIA.mejorarConIA(guia.pasos, preguntarIA, climaTexto(), () => { if (mia === guiaSesion) pintarPaso(); })
    .then(ok => { if (mia === guiaSesion) { guia.ia = ok; pintarPaso(); } });
}

function etiquetaBoton() {
  if (!guia.activa) return guia.i > 0 ? "Continuar guía" : "Ir a retirar la bici";
  const p = guia.pasos[guia.i];
  if (guia.i === guia.pasos.length - 1) return "Terminar recorrido";
  if (p.tipo === "retiro") return "Ya retiré la bici";
  if (p.tipo === "lugar" || p.tipo === "devolucion") return "Seguir";
  return "Siguiente paso";
}

function pintarPaso() {
  const p = guia.pasos[guia.i]; if (!p) return;
  const llegada = p.tipo === "lugar" || p.tipo === "final";
  $("#paso-icono").textContent = GUIA.icono(p);
  $("#paso-icono").classList.toggle("llegada", llegada);
  $("#paso-etiqueta").textContent = guia.activa ? `Paso ${guia.i + 1} de ${guia.pasos.length}` : "Siguiente paso";
  $("#paso-texto").textContent = p.texto;
  const distancia = guia.activa && guia.restante != null ? `faltan ${fmtM(guia.restante)}` : (p.metros ? fmtM(p.metros) : "");
  $("#paso-meta").textContent = [p.modo === "bici" ? "En bici" : "A pie", distancia, p.tipo === "retiro" || p.tipo === "devolucion" ? p.extra : "",
    guia.ia ? "Guía por IA" : "Guía automática", guia.activa && guia.sinGPS ? "Sin GPS: avanzá con el botón" : ""].filter(Boolean).join(" · ");
  $("#iniciar").firstChild.textContent = `${etiquetaBoton()} `;
  $("#voz").setAttribute("aria-pressed", guia.voz);
}
/** Lleva el anillo (y, si ya arrancó la guía sin GPS, la cámara) al punto del paso actual. */
function centrarPaso(mover = true) {
  const p = guia.pasos[guia.i];
  if (!mapa || !p || !marcaPaso) return;
  marcaPaso.setLngLat(p.punto);
  if (mover && guia.activa && !guia.hayFix) mapa.easeTo({ center: p.punto, zoom: 16.8, duration: 700 });
}
const hablarPaso = () => { if (guia.voz && guia.activa && guia.pasos[guia.i]) GUIA.hablar(guia.pasos[guia.i].texto); };

function celebrarLlegada(p) {
  if (p.celebrado) return;
  p.celebrado = true;
  GUIA.celebrar(`¡Llegaste a ${p.tipo === "devolucion" ? `la ${p.nombre}` : p.nombre}!`);
}

/** Pasa al paso siguiente. `manual`: se tocó el botón (se da por hecho que llegaste, así que si es una llegada se festeja). */
function avanzar(manual) {
  if (guia.i >= guia.pasos.length - 1) return;
  guia.i++; guia.restante = null;
  const p = guia.pasos[guia.i];
  pintarPaso(); centrarPaso(); hablarPaso();
  if (manual && p.celebra) celebrarLlegada(p);
}

// Con GPS: la guía avanza sola al llegar a cada punto. Sin GPS (permiso negado o escritorio): se avanza con el botón.
function seguirGPS() {
  if (!navigator.geolocation) { guia.sinGPS = true; return; }
  if (guia.watch !== null) return;
  guia.watch = navigator.geolocation.watchPosition(pos => {
    guia.sinGPS = false; guia.hayFix = true;
    const yo = { lat: pos.coords.latitude, lon: pos.coords.longitude }, precision = pos.coords.accuracy || 0;
    if (mapa && !marcaYo) {
      const punto = document.createElement("div");
      punto.style.cssText = "width:18px;height:18px;border-radius:50%;background:#203ae9;border:3px solid #fff;box-shadow:0 0 0 10px rgba(32,58,233,.25)";
      marcaYo = new maplibregl.Marker({ element: punto }).setLngLat([yo.lon, yo.lat]).addTo(mapa);
    }
    marcaYo?.setLngLat([yo.lon, yo.lat]);
    if (mapa && Date.now() - guia.ultimoArrastre > 8000) mapa.easeTo({ center: [yo.lon, yo.lat], zoom: Math.max(mapa.getZoom(), 16.5), duration: 900 });
    const p = guia.pasos[guia.i]; if (!p) return;
    guia.restante = Math.round(GUIA.aMetros([yo.lon, yo.lat], p.punto));
    const umbral = (p.modo === "bici" ? 30 : 20) + Math.min(precision, 30) / 2;
    if (guia.restante <= umbral) {
      if (p.tipo === "maniobra" || p.tipo === "sinruta") { avanzar(false); return; }
      if (p.celebra) celebrarLlegada(p);              // llegaste a una estación o a un lugar: la guía espera tu "Seguir"
    }
    pintarPaso();
  }, () => { guia.sinGPS = true; pintarPaso(); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}

/** Detiene el GPS y la voz (al salir de la pantalla o al terminar). La guía queda en el paso donde estaba. */
function pausarGuia() {
  if (guia.watch !== null) { navigator.geolocation.clearWatch(guia.watch); guia.watch = null; }
  GUIA.callar(); guia.activa = false;
}

function iniciarGuia() {
  if (guia.i === 0) {                                      // primera vez: cuenta como visita a esos lugares y se guarda el resumen para el cierre
    TEND.registrarInicio(plan.ids);
    estado.ultimo = { km: plan.km, mPie: plan.mPie, ids: [...plan.ids], estaciones: plan.estaciones, minutos: plan.minutosTotal, hasta: plan.hasta?.nombre || null };
    guardarEstado();
  }
  guia.activa = true; guia.sinGPS = false;
  hojaRecorrido.poner(true);                               // el panel baja y queda solo el siguiente paso
  seguirGPS();
  pintarPaso(); centrarPaso(); hablarPaso();
}

$("#iniciar").addEventListener("click", () => {
  if (!plan.tramos || !guia.pasos.length) return;
  if (!guia.activa) { iniciarGuia(); return; }
  if (guia.i >= guia.pasos.length - 1) { pausarGuia(); location.hash = "cierre"; return; }   // fin: va directo a calificar
  avanzar(true);
});
$("#voz").addEventListener("click", () => {
  guia.voz = !guia.voz; estado.voz = guia.voz; guardarEstado();
  if (guia.voz) hablarPaso(); else GUIA.callar();
  pintarPaso();
});

// ---------- 08 · Cierre ----------
function pintarCierre() {
  const u = estado.ultimo; if (!u) { location.hash = "planificar"; return; }
  $("#cierre-km").textContent = fmtKm(u.km);
  $("#cierre-lugares").textContent = `${u.ids.length} lugar${u.ids.length > 1 ? "es" : ""} visitado${u.ids.length > 1 ? "s" : ""}`;
  $("#calificar").innerHTML = u.ids.map(porId).map(l => {
    const n = estado.calificaciones[l.id] || 0;
    return `<div class="calificacion"><span>${esc(l.nombre)}</span><span class="estrellas" role="group" aria-label="Calificar ${esc(l.nombre)}">
      ${[1, 2, 3, 4, 5].map(i => `<button data-lugar="${l.id}" data-n="${i}" aria-label="${i} de 5">${i <= n ? "★" : "☆"}</button>`).join("")}</span></div>`;
  }).join("");
}
$("#calificar").addEventListener("click", e => {
  const b = e.target.closest("button[data-n]"); if (!b) return;
  estado.calificaciones[b.dataset.lugar] = Number(b.dataset.n);
  guardarEstado(); pintarCierre();
});
$("#guardar-volver").addEventListener("click", () => {
  const u = estado.ultimo; if (!u) return;
  estado.km += u.km; estado.salidas += 1;
  estado.historial.push({ fecha: new Date().toISOString(), km: u.km });
  u.ids.forEach(id => { if (!estado.visitados.includes(id)) estado.visitados.push(id); });
  estado.destinos = []; plan.hasta = null; plan.modo = "sorpresa";
  guardarEstado();
  location.hash = "compartir";                  // el cierre del viaje termina en la rueda GIRA
});

// ---------- 09 · Perfil ----------
function kmDesde(dias) {
  const desde = Date.now() - dias * 86400000;
  return estado.historial.filter(h => new Date(h.fecha).getTime() >= desde).reduce((s, h) => s + h.km, 0);
}
function pintarPerfil() {
  $("#km-total").textContent = fmtKm(estado.km);
  $("#actividad").innerHTML = [
    ["naranja", fmtKm(kmDesde(7)), "Esta semana"],
    ["verde", fmtKm(kmDesde(30)), "Últimos 30 días"],
    ["celeste", `${estado.salidas} salidas`, "Desde que empezaste"]
  ].map(([c, t, d]) => `<div class="tarjeta-apilada ${c}"><strong>${t}</strong><span>${d}</span></div>`).join("");
  $("#mis-intereses").innerHTML = estado.intereses.map(i => `<span class="chip activo">${esc(i)}</span>`).join("");
}

// ---------- 10 · Compartir + rueda GIRA ----------
const rayos = $("#rueda .rayos");
for (let i = 0; i < 24; i++) {
  const a = i * 15 * Math.PI / 180, linea = document.createElementNS("http://www.w3.org/2000/svg", "line");
  linea.setAttribute("x1", 100 + 14 * Math.cos(a)); linea.setAttribute("y1", 100 + 14 * Math.sin(a));
  linea.setAttribute("x2", 100 + 82 * Math.cos(a)); linea.setAttribute("y2", 100 + 82 * Math.sin(a));
  rayos.appendChild(linea);
}
const rueda = window.PedalitoRueda.iniciar({
  rueda: $("#rueda"), boton: $("#gira"), salida: $("#salida-mensaje"), mensaje: $("#mensaje-dia")
});

function pintarCompartir() {
  const u = estado.ultimo;
  $("#compartir-km").textContent = u ? fmtKm(u.km).toUpperCase() : fmtKm(estado.km).toUpperCase();
  $("#compartir-ruta").textContent = u ? `por Buenos Aires · ${ORIGEN.nombre} → ${u.ids.map(id => porId(id).nombre).join(" → ")}` : "por Buenos Aires";
  rueda.reiniciar();
}
// Cada opción comparte directamente; el botón de abajo cierra el recorrido y vuelve al inicio.
const textoCompartir = () => `${$("#compartir-km").textContent} por Buenos Aires con Pedalito. ${$("#compartir-ruta").textContent}`;
$$("#compartir [data-red]").forEach(b => b.addEventListener("click", async () => {
  const texto = textoCompartir(), red = b.dataset.red;
  if (red === "whatsapp") { window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener"); return; }
  if (red === "comunidad") { aviso("La comunidad de Pedalito todavía no está disponible."); return; }
  try {                                              // Instagram Stories no se puede abrir con un link: se usa el menú de compartir del celular
    if (navigator.share) await navigator.share({ title: "Pedalito", text: texto });
    else { await navigator.clipboard.writeText(texto); aviso("Texto copiado: pegalo en tu historia de Instagram."); }
  } catch (e) { if (e?.name !== "AbortError") aviso("No pudimos compartir desde acá. Probá desde el celular."); }   // AbortError = la persona canceló
}));
$("#compartir-ya").addEventListener("click", () => { location.hash = "inicio"; });

mostrar();
