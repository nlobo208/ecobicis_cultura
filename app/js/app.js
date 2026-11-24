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
// Los hotspots sin foto propia muestran la imagen de su categoría (carpeta img/imagenes categorias/). La foto propia siempre
// tiene prioridad. Anfiteatro todavía no tiene imagen propia: usa la de teatro hasta que se sume una.
const CARPETA_CATEGORIAS = "imagenes categorias";
const IMAGEN_CATEGORIA = {
  "Restaurante": "restaurante", "Biblioteca": "bibliotecas", "Bar": "bar", "Monumentos y lugares históricos": "monumentos y lugares historicos",
  "Librería": "libreria", "Café": "cafe", "Centro cultural": "centro cultural", "Sala de teatro": "sala de teatro", "Galería de arte": "galerias",
  "Museo": "museo", "Espacio de formación": "espacio de formacion", "Disquería": "disqueria", "Club de música en vivo": "club de musica en vivo",
  "Espacio ferial": "espacio ferial", "Sala de cine": "sala de cine", "Anfiteatro": "sala de teatro"
};
LUGARES.forEach(l => { if (!l.img && IMAGEN_CATEGORIA[l.categoria]) { l.img = `${CARPETA_CATEGORIAS}/${IMAGEN_CATEGORIA[l.categoria]}.jpg`; l.imgCategoria = true; } });
// Nombres de barrio como se escriben (el dataset los trae sin tildes y "Boca" en vez de "La Boca")
const NOMBRE_BARRIO = { "San Nicolas": "San Nicolás", "Constitucion": "Constitución", "Boca": "La Boca" };
[...LUGARES, ...(window.PEDALITO_ESTACIONES || [])].forEach(x => { if (NOMBRE_BARRIO[x.barrio]) x.barrio = NOMBRE_BARRIO[x.barrio]; });
const ACTIVIDADES = (window.PEDALITO_ACTIVIDADES || []).filter(a => a.estado !== "borrador");   // los borradores de la IA no se muestran hasta que una persona los revise
const FICHAS = window.PEDALITO_FICHAS || {};                    // fichas de los 30 hotspots (data/fichas.js)
const SELLOS_ARTE = new Set((window.PEDALITO_SELLOS || []).map(String));   // sellos del pasaporte que ya tienen dibujo
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
  vistaMapa = null; plan.retiroElegido = null;                                // los mapas vuelven a centrarse en el nuevo punto de partida
  try { sessionStorage.setItem(CLAVE_ORIGEN, JSON.stringify({ hora: Date.now(), punto: ORIGEN })); } catch { /* nada */ }
  sessionStorage.removeItem("pedalito_paravos");   // las recomendaciones dependen de dónde estás
  plan.tramos = null;                              // un recorrido armado desde otro lado ya no sirve
  cargarClima();
}

// Mismas 16 categorías que los chips del Figma
const INTERESES = ["Anfiteatro", "Bar", "Biblioteca", "Café", "Centro cultural", "Club de música en vivo",
  "Disquería", "Espacio de formación", "Espacio ferial", "Galería de arte", "Librería",
  "Monumentos y lugares históricos", "Museo", "Restaurante", "Sala de cine", "Sala de teatro"];
// Cada categoría pertenece a un grupo con su color de la paleta (arte, gastronomía, música y escena, aire libre); ver [data-grupo] en style.css
const GRUPO_CATEGORIA = { "Museo": "arte", "Galería de arte": "arte", "Centro cultural": "arte", "Biblioteca": "arte", "Librería": "arte", "Espacio de formación": "arte",
  "Restaurante": "gastro", "Bar": "gastro", "Café": "gastro", "Club de música en vivo": "escena", "Sala de teatro": "escena", "Sala de cine": "escena", "Anfiteatro": "escena",
  "Disquería": "escena", "Monumentos y lugares históricos": "aire", "Espacio ferial": "aire" };
const grupoDe = categoria => GRUPO_CATEGORIA[categoria] || "arte";
const COLORES = ["naranja", "celeste", "verde", "rosa"];       // orden de las tarjetas apiladas de Explorar
const VELOCIDAD_KMH = 14;                                       // para estimar minutos de viaje
const lugaresPorTiempo = min => (min <= 45 ? 1 : min <= 90 ? 2 : min <= 150 ? 3 : 4);   // 30 min → 1, 1 h → 2, 2 h → 3; los tiempos propios siguen la misma escala
const MAX_LISTA = 24;

// ---------- Estado guardado en el navegador ----------
const CLAVE_ESTADO = "pedalito_final";
const estado = Object.assign({
  email: "", nombre: "", intereses: [], km: 0, salidas: 0, visitados: [], destinos: [],
  calificaciones: {}, guardados: [], sellos: {}, historial: [], ultimo: null, frecuentes: []
}, leerEstado());
const plan = { modo: "destino", minutos: 60, maxKm: 5, hasta: null, ids: [], km: 0, estaciones: null };

/** Un recorrido guardado de hace más de 6 horas ya no sirve (las estaciones y la hora cambiaron). */
const VIGENCIA_EN_CURSO_MS = 6 * 60 * 60 * 1000;
if (estado.enCurso && Date.now() - estado.enCurso.fecha > VIGENCIA_EN_CURSO_MS) estado.enCurso = null;

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
const fotoUrl = l => l.img ? `img/${encodeURI(l.img)}` : "";   // encodeURI: la carpeta de categorías tiene espacios en el nombre

// ---------- Navegación (#inicio, #lugar/123, …) ----------
const TABS = ["inicio", "explorar", "planificar", "perfil"];
const PUBLICAS = ["bienvenida", "cuenta"];
const MIN_INTERESES = 2;                       // mínimo de intereses para seguir (el máximo es 5)
let pantallaActual = "", entrandoExplorar = false;
let finalizado = false;                        // terminó el recorrido ("Finalizar"): en Inicio ya no se puede volver a Compartir

function mostrar() {
  let [pantalla, param] = location.hash.slice(1).split("/");
  if (!pantalla || !document.getElementById(pantalla)) pantalla = estado.email ? "inicio" : "bienvenida";
  if (!estado.email && !PUBLICAS.includes(pantalla)) pantalla = "bienvenida";
  if (estado.email && estado.intereses.length < MIN_INTERESES && pantalla !== "intereses" && !PUBLICAS.includes(pantalla)) pantalla = "intereses";
  // Con intereses ya elegidos, antes de ofrecer nada se pregunta desde dónde salís (en cada sesión)
  // (el punto de partida ya no se pide antes del Inicio: se elige desde el Inicio con "Elegir")
  if (pantalla === "explorar" && pantallaActual !== "explorar") entrandoExplorar = true;     // el mapa de Explorar toma la vista del Inicio
  if (pantalla === "explorar" && pantallaActual !== "explorar" && pantallaActual !== "lugar") reiniciarFiltros();
  pantallaActual = pantalla;
  if (pantalla !== "inicio") finalizado = false;
  // Si un desvío cambió la pantalla (por ejemplo, pedir la ubicación), la URL pasa a decir lo mismo que se ve:
  // si no, tocar "continuar" hacia #inicio no dispararía hashchange porque la URL ya diría #inicio.
  const destino = (pantalla === "lugar" || pantalla === "actividad") && param ? `${pantalla}/${param}` : pantalla;
  if (location.hash.slice(1) !== destino) history.replaceState(null, "", `#${destino}`);

  $$(".pantalla").forEach(s => s.classList.toggle("visible", s.id === pantalla));
  const conNav = TABS.includes(pantalla) || pantalla === "ubicacion";           // la barra de abajo ya está desde "Elegí tu punto de partida"
  $("#nav").classList.toggle("visible", conNav);
  document.querySelector(".app").classList.toggle("con-nav", conNav);
  $("#atras").hidden = ["bienvenida", "intereses", "ubicacion", "inicio", "explorar", "lugar", "actividad", "cierre", "compartir"].includes(pantalla) || (finalizado && pantalla === "inicio");   // en el detalle la flecha va sobre la foto
  $$("#nav a").forEach(a => a.classList.toggle("activo", a.dataset.tab === pantalla));
  window.scrollTo(0, 0); $(".app-scroll").scrollTop = 0; pintarCaja();
  const filtro = $("#filtro-mapa");                                    // capas del mapa: solo en las pantallas con mapa de puntos
  filtro.hidden = !["ubicacion", "inicio", "explorar", "planificar"].includes(pantalla); filtro.classList.toggle("sin-flecha", pantalla === "ubicacion");
  if (pantalla !== "recorrido") pausarGuia();                          // al salir de la guía se apaga el GPS

  ({ intereses: pintarIntereses, ubicacion: pintarUbicacion, inicio: pintarInicio, explorar: pintarExplorar,
     lugar: () => pintarLugar(param), actividad: () => pintarActividad(param), pasaporte: pintarPasaporte, accesos: pintarAccesos, planificar: pintarMiRuta, recorrido: armarRecorrido,
     cierre: pintarCierre, perfil: pintarPerfil, compartir: pintarCompartir }[pantalla] || (() => {}))();
}

// ---------- Flecha para volver ----------
// Si la persona ya navegó dentro de la app se usa el historial del navegador; si entró directo, va a la pantalla anterior del flujo.
const PADRE = { cuenta: "bienvenida", intereses: "bienvenida", ubicacion: "inicio", inicio: "intereses", explorar: "inicio", lugar: "explorar",
  planificar: "inicio", recorrido: "planificar", cierre: "recorrido", perfil: "inicio", compartir: "perfil", actividad: "inicio", pasaporte: "perfil", accesos: "ubicacion" };
let navegaciones = 0, volviendo = false;
window.addEventListener("hashchange", () => { if (volviendo) volviendo = false; else navegaciones++; mostrar(); });
function volver() {
  if (navegaciones > 0) { navegaciones--; volviendo = true; history.back(); }
  else location.hash = PADRE[pantallaActual] || "inicio";
}
$("#atras").addEventListener("click", volver);
$("#atras-lugar").addEventListener("click", volver);
$("#atras-actividad").addEventListener("click", volver);

// ---------- 00 · Bienvenida ----------
// Sin cuenta por ahora (prototipo): "Comenzar a pedalear" entra como invitado y sigue con "¿Qué te mueve?".
$("#comenzar").addEventListener("click", e => {
  e.preventDefault();
  if (!estado.email) { estado.email = "invitado"; estado.nombre = ""; guardarEstado(); }
  UBI.iniciar();   // Chrome pide el permiso de ubicación acá, tras un toque de la persona; desde ahí se sigue en vivo
  location.hash = "intereses";
});

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
    `<button class="chip ${estado.intereses.includes(i) ? "activo" : ""}" data-grupo="${grupoDe(i)}" data-interes="${esc(i)}" aria-pressed="${estado.intereses.includes(i)}">${esc(i)}</button>`).join("");
  const n = estado.intereses.length;
  $("#guardar-intereses").disabled = n < MIN_INTERESES || n > 5;
}
$("#chips-intereses").addEventListener("click", e => {
  const i = e.target.dataset.interes; if (!i) return;
  const sel = estado.intereses;
  if (sel.includes(i)) sel.splice(sel.indexOf(i), 1); else if (sel.length < 5) sel.push(i);
  pintarIntereses();
});
$("#guardar-intereses").addEventListener("click", () => { guardarEstado(); sessionStorage.removeItem("pedalito_paravos"); location.hash = "inicio"; });

// ---------- 02b · Desde dónde salís ----------
let mapaUbi, marcaUbi, seleccion = null, sugerencias = [];
const sinTildes = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function estacionMasCercana(p) {
  return ESTACIONES.reduce((mejor, e) => { const m = PRED.distKm(p, e) * 1000; return m < mejor.m ? { e, m } : mejor; }, { e: null, m: Infinity });
}

/** Cartel de error rojo bajo el buscador: se usa cuando el lugar elegido o escrito queda fuera de la zona cubierta. "" lo oculta. */
function errorZona(texto) { const el = $("#origen-error"); el.textContent = texto; el.hidden = !texto; }
// Otros barrios de la Ciudad: si alguien escribe uno, se le explica que todavía no lo cubrimos
const BARRIOS_FUERA = ["Agronomía", "Almagro", "Balvanera", "Belgrano", "Boedo", "Caballito", "Chacarita", "Coghlan", "Colegiales", "Flores", "Floresta",
  "Liniers", "Mataderos", "Monte Castro", "Núñez", "Paternal", "Parque Avellaneda", "Parque Chacabuco", "Parque Chas", "Saavedra", "San Cristóbal",
  "Vélez Sarsfield", "Versalles", "Villa Crespo", "Villa del Parque", "Villa Devoto", "Villa General Mitre", "Villa Lugano", "Villa Luro", "Villa Ortúzar",
  "Villa Pueyrredón", "Villa Real", "Villa Riachuelo", "Villa Santa Rita", "Villa Soldati", "Once"];

/** Marca el punto de salida elegido y avisa si queda fuera de la zona cubierta (12 barrios: ver js/zona.js). */
const ZONA = window.PedalitoZona;
function elegirPunto(p, nombre, redibujar = true) {
  const { e, m } = estacionMasCercana(p);
  const barrio = ZONA.barrioDe(p);
  const dentro = ZONA.hay ? !!barrio : m <= 2000;           // sin el límite cargado, se usa la regla de 2 km a una estación
  seleccion = { lat: p.lat, lon: p.lon, nombre: nombre || `Cerca de ${e.nombre}` };
  marcaUbi?.setLngLat([p.lon, p.lat]);
  $("#origen-aviso").textContent = dentro
    ? `${barrio ? barrio + " · " : ""}Estación EcoBici más cercana: ${e.nombre}, a ${Math.round(m)} m.`
    : "Tocá el mapa o arrastrá el punto para ajustar.";
  errorZona(dentro ? "" : `Ese punto queda fuera de los barrios que cubrimos (${ZONA.texto}). Elegí otro${ZONA.hay ? " dentro del borde punteado" : ""}.`);
  $("#confirmar-origen").disabled = !dentro;
  if (redibujar) pintarEstacionesCercanas(p);
}

function pintarUbicacion() {
  $("#buscar-origen").value = ""; $("#sugerencias").hidden = true; $("#borrar-origen").hidden = true; errorZona("");
  $("#confirmar-origen").disabled = true;
  seleccion = null;
  pintarEstacionesCercanas(ORIGEN); pintarFrecuentes();
  $("#origen-aviso").textContent = "Tocá el mapa o arrastrá el punto para ajustar.";
  if (!window.maplibregl) return;
  if (!mapaUbi) {
    mapaUbi = new maplibregl.Map({ container: "mapa-ubicacion", style: ENV.OPENFREEMAP_STYLE_URL, center: [ORIGEN.lon, ORIGEN.lat],
      zoom: 14.5, attributionControl: false });
    ZONA.dibujar(mapaUbi);
    UBI.dibujar(mapaUbi); dibujarCiclovias(mapaUbi);
    mapaUbi.jumpTo({ padding: { top: 0, left: 0, right: 0, bottom: Math.round(hojaUbicacion.visiblePx()) } });
    mapaUbi.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapaUbi.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
    marcaUbi = new maplibregl.Marker({ color: "#000", draggable: true }).setLngLat([ORIGEN.lon, ORIGEN.lat]).addTo(mapaUbi);
    marcaUbi.on("dragend", () => { const p = marcaUbi.getLngLat(); elegirPunto({ lat: p.lat, lon: p.lng }); });
    mapaUbi.on("click", e => elegirPunto({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
  } else {
    mapaUbi.resize(); ajustarMapa(mapaUbi, hojaUbicacion, false);
  }
  pintarEstacionesEn(mapaUbi); pintarLugaresEn(mapaUbi, true); aplicarCapas();   // estaciones y hotspots también acá, con el filtro de capas
  // Si ya había uno elegido en esta sesión, queda preseleccionado para poder cambiarlo
  if (origenElegido) { mapaUbi.jumpTo({ center: [ORIGEN.lon, ORIGEN.lat] }); elegirPunto(ORIGEN, ORIGEN.nombre); }
  else marcaUbi.setLngLat([ORIGEN.lon, ORIGEN.lat]);
}

$("#usar-ubicacion").addEventListener("click", () => {
  const aviso = $("#origen-aviso");
  if (!navigator.geolocation) { aviso.textContent = "Tu navegador no permite ubicación. Buscá un hotspot o tocá el mapa."; return; }
  const viva = UBI.posicion();
  if (viva && Date.now() - viva.t < 15000) {   // la ubicación en vivo ya la tiene: se usa directo
    const p = { lat: viva.lat, lon: viva.lon };
    elegirPunto(p, "Tu ubicación actual"); mapaUbi?.flyTo({ center: [p.lon, p.lat], zoom: 15 }); return;
  }
  aviso.textContent = "Buscando tu ubicación…";
  navigator.geolocation.getCurrentPosition(pos => {
    const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    elegirPunto(p, "Tu ubicación actual");
    mapaUbi?.flyTo({ center: [p.lon, p.lat], zoom: 15 });
  }, err => {
    aviso.textContent = err.code === 1 ? "No diste permiso de ubicación. Buscá un hotspot o tocá el mapa."
      : "No pudimos obtener tu ubicación. Buscá un hotspot o tocá el mapa.";
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });   // maximumAge 0: nunca una posición vieja
});

$("#buscar-origen").addEventListener("input", () => {
  $("#borrar-origen").hidden = !$("#buscar-origen").value;
  const q = sinTildes($("#buscar-origen").value.trim()), lista = $("#sugerencias");
  errorZona("");
  if (q.length < 2) { lista.hidden = true; return; }
  const estaciones = ESTACIONES.filter(e => sinTildes(e.nombre).includes(q))
    .map(e => ({ nombre: `Estación ${e.nombre}`, detalle: e.barrio, lat: e.lat, lon: e.lon }));
  const lugares = LUGARES.filter(l => sinTildes(l.nombre).includes(q))
    .map(l => ({ nombre: l.nombre, detalle: `${l.categoria} · ${l.barrio}`, lat: l.lat, lon: l.lon }));
  sugerencias = [...estaciones, ...lugares].slice(0, 6);
  // Un barrio que no cubrimos (aunque no coincida con ningún hotspot): cartel de error en vez de una lista vacía
  const fuera = q.length >= 3 && BARRIOS_FUERA.find(b => sinTildes(b).startsWith(q) || q.includes(sinTildes(b)));
  const hayBarrioDentro = ZONA.barrios.some(b => sinTildes(b).startsWith(q));
  if (fuera && !hayBarrioDentro) errorZona(`${fuera} queda fuera de los barrios que cubrimos (${ZONA.texto}). Probá con un lugar de esa zona.`);
  else if (!sugerencias.length) errorZona("No encontramos ese lugar en la zona que cubrimos. Probá con otro hotspot o estación.");
  lista.innerHTML = sugerencias.map((s, i) => `<li><button type="button" data-i="${i}">${esc(s.nombre)}<small>${esc(s.detalle)}</small></button></li>`).join("");
  lista.hidden = !sugerencias.length;
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

// Referencias del mapa del recorrido: el "−" las oculta para ver más pasos; el "+" las vuelve a mostrar
$("#referencias-boton").addEventListener("click", () => {
  const cuerpo = $("#referencias-cuerpo"), boton = $("#referencias-boton"), ocultar = !cuerpo.hidden;
  cuerpo.hidden = ocultar;
  boton.textContent = ocultar ? "+" : "−";
  boton.setAttribute("aria-expanded", String(!ocultar));
  boton.setAttribute("aria-label", ocultar ? "Mostrar las referencias del mapa" : "Ocultar las referencias del mapa");
});

// Referencias del mapa del Inicio: cerradas al entrar (es mucha información); el "+" las muestra y el "−" las oculta
$("#ref-inicio-boton").addEventListener("click", () => {
  const cuerpo = $("#ref-inicio-cuerpo"), boton = $("#ref-inicio-boton"), abrir = cuerpo.hidden;
  cuerpo.hidden = !abrir;
  boton.textContent = abrir ? "−" : "+";
  boton.setAttribute("aria-expanded", String(abrir));
  boton.setAttribute("aria-label", abrir ? "Ocultar las referencias del mapa" : "Mostrar las referencias del mapa");
});
// ---------- Estaciones cercanas al punto de partida (con la disponibilidad de ahora, o estimada) ----------
const ICONOS = {
  casa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/></svg>',
  trabajo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/></svg>',
  otro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.6 0-1.4-1-1.3-1-2.4 0-.9.7-1.5 1.7-1.5H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/></svg>',
  bici: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5 9.5 8h5l4 8.5M9.5 8l3 8.5M14.5 8l1-2.5H18"/></svg>',
  lapiz: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
  tacho: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/></svg>'
};
const iconoDe = nombre => /casa|hogar|depto|departamento/i.test(nombre) ? "casa" : /trabajo|oficina|laburo/i.test(nombre) ? "trabajo" : "otro";

function pintarEstacionesCercanas(p) {
  const cerca = ESTACIONES.map(e => ({ e, m: PRED.distKm(p, e) * 1000 })).sort((a, b) => a.m - b.m).slice(0, 3);
  $("#estaciones-tag").textContent = DISP.estado.enVivo ? "Tiempo real" : "Estimado";
  $("#estaciones-cercanas").innerHTML = cerca.map(({ e, m }) => {
    const v = DISP.de(e.numero);
    const detalle = v
      ? `<span class="${v.bicis ? "ok" : "sin"}">● ${plural(v.bicis, "bici", "bicis")}</span> · ${plural(v.anclajes, "anclaje libre", "anclajes libres")}`
      : `<span>Bicis: ${esc(PRED.predecirEstacion(e.numero, new Date(), 0).nivelBicis)} (estimado)</span>`;
    return `<li><label class="estacion-op"><span class="icono-circulo">${ICONOS.bici}</span>
      <span class="cuerpo"><strong>${esc(e.nombre)}</strong><small>${detalle} · a ${Math.round(m)} m</small></span>
      <input type="radio" name="est-origen" value="${e.numero}"><i class="radio" aria-hidden="true"></i></label></li>`;
  }).join("");
}
$("#estaciones-cercanas").addEventListener("change", e => {
  const est = ESTACIONES.find(x => String(x.numero) === e.target.value); if (!est) return;
  elegirPunto({ lat: est.lat, lon: est.lon }, `Estación ${est.nombre}`, false);      // sin redibujar la lista: queda marcada la que tocaste
  mapaUbi?.flyTo({ center: [est.lon, est.lat], zoom: 15.5 });
});
$("#borrar-origen").addEventListener("click", () => {
  $("#buscar-origen").value = ""; $("#sugerencias").hidden = true; $("#borrar-origen").hidden = true; errorZona(""); $("#buscar-origen").focus();
});

// ---------- Lugares frecuentes (Casa, Trabajo…): se guardan en este navegador y se eligen con un toque ----------
const MAX_FRECUENTES = 6;
function pintarFrecuentes() {
  const caja = $("#frecuentes");
  if (!estado.frecuentes.length) { caja.innerHTML = `<p class="nota">Todavía no guardaste lugares. Tocá «Editar» para sumar tu casa o tu trabajo.</p>`; return; }
  caja.innerHTML = estado.frecuentes.map((f, i) => `<button type="button" class="frecuente" data-i="${i}">
    <span class="icono-circulo ${iconoDe(f.nombre)}">${ICONOS[iconoDe(f.nombre)]}</span><small class="dist">${fmtKm(PRED.distKm(ORIGEN, f))}</small>
    <strong>${esc(f.nombre)}</strong><small>${esc(f.detalle || "")}</small></button>`).join("");
}
$("#frecuentes").addEventListener("click", e => {
  const b = e.target.closest(".frecuente"); if (!b) return;
  const f = estado.frecuentes[Number(b.dataset.i)];
  elegirPunto({ lat: f.lat, lon: f.lon }, f.nombre);
  mapaUbi?.flyTo({ center: [f.lon, f.lat], zoom: 15.5 });
});

// ---------- 02c · Gestioná tus accesos rápidos ----------
let accesos = [], accEditando = null, accLugar = null, accSug = [];
function pintarAccesos() {
  accesos = estado.frecuentes.map(f => ({ ...f })); accEditando = null; cerrarFormAcceso();
  pintarListaAccesos();
}
function pintarListaAccesos() {
  $("#lista-accesos").innerHTML = accesos.length ? accesos.map((f, i) => `<li class="acceso">
    <span class="icono-circulo ${iconoDe(f.nombre)}">${ICONOS[iconoDe(f.nombre)]}</span>
    <div class="cuerpo"><strong>${esc(f.nombre)}</strong><small>${esc(f.detalle || "")}</small></div>
    <button type="button" class="redondito" data-editar="${i}" aria-label="Editar ${esc(f.nombre)}">${ICONOS.lapiz}</button>
    <button type="button" class="redondito" data-borrar="${i}" aria-label="Borrar ${esc(f.nombre)}">${ICONOS.tacho}</button></li>`).join("")
    : `<li class="nota">Todavía no hay lugares guardados.</li>`;
  $("#agregar-acceso").hidden = accesos.length >= MAX_FRECUENTES || !$("#form-acceso").hidden;
}
function cerrarFormAcceso() { $("#form-acceso").hidden = true; $("#acc-error").hidden = true; accEditando = null; accLugar = null; }
function abrirFormAcceso(i) {
  accEditando = i; accLugar = i != null ? { lat: accesos[i].lat, lon: accesos[i].lon, detalle: accesos[i].detalle } : null;
  $("#acc-nombre").value = i != null ? accesos[i].nombre : ""; $("#acc-buscar").value = ""; $("#acc-sug").hidden = true; $("#acc-error").hidden = true;
  $("#acc-detalle").textContent = accLugar ? (accLugar.detalle || "Lugar elegido") : "Sin lugar elegido todavía";
  $("#form-acceso").hidden = false; $("#agregar-acceso").hidden = true; $("#acc-nombre").focus();
}
$("#agregar-acceso").addEventListener("click", () => abrirFormAcceso(null));
$("#lista-accesos").addEventListener("click", e => {
  const ed = e.target.closest("[data-editar]"), bo = e.target.closest("[data-borrar]");
  if (ed) abrirFormAcceso(Number(ed.dataset.editar));
  if (bo) { accesos.splice(Number(bo.dataset.borrar), 1); cerrarFormAcceso(); pintarListaAccesos(); }
});
$("#acc-buscar").addEventListener("input", () => {
  accSug = buscarPuntos($("#acc-buscar").value, { estaciones: true });
  if ($("#acc-buscar").value.trim().length < 2) $("#acc-sug").hidden = true; else listaSugerencias($("#acc-sug"), accSug);
});
$("#acc-sug").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const s = accSug[Number(b.dataset.i)];
  accLugar = { lat: s.lat, lon: s.lon, detalle: s.nombre }; $("#acc-sug").hidden = true; $("#acc-buscar").value = s.nombre;
  $("#acc-detalle").textContent = s.nombre;
  if (!$("#acc-nombre").value.trim()) $("#acc-nombre").value = s.nombre.slice(0, 24);
});
$("#acc-ubicacion").addEventListener("click", () => {
  const usar = p => { accLugar = { lat: p.lat, lon: p.lon, detalle: "Tu ubicación actual" }; $("#acc-detalle").textContent = "Tu ubicación actual"; };
  const viva = UBI.posicion();
  if (viva) { usar(viva); return; }
  if (!navigator.geolocation) { $("#acc-detalle").textContent = "Tu navegador no permite ubicación"; return; }
  $("#acc-detalle").textContent = "Buscando tu ubicación…";
  navigator.geolocation.getCurrentPosition(pos => usar({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => { $("#acc-detalle").textContent = "No pudimos obtener tu ubicación"; }, { enableHighAccuracy: true, timeout: 12000 });
});
$("#acc-listo").addEventListener("click", () => {
  const nombre = $("#acc-nombre").value.trim(), err = $("#acc-error");
  if (!nombre) { err.textContent = "Ponele un nombre al lugar."; err.hidden = false; return; }
  if (!accLugar) { err.textContent = "Elegí dónde queda: buscalo o usá tu ubicación."; err.hidden = false; return; }
  const item = { id: accEditando != null ? accesos[accEditando].id : Date.now(), nombre, detalle: accLugar.detalle || "", lat: accLugar.lat, lon: accLugar.lon };
  if (accEditando != null) accesos[accEditando] = item; else accesos.push(item);
  cerrarFormAcceso(); pintarListaAccesos();
});
$("#acc-cancelar-form").addEventListener("click", () => { cerrarFormAcceso(); pintarListaAccesos(); });
$("#acc-guardar").addEventListener("click", () => { estado.frecuentes = accesos.map(f => ({ ...f })); guardarEstado(); location.hash = "ubicacion"; });

// ---------- 03 · Home ----------
let mapaHome;
// (hacerDeslizable y ajustarMapa son function declarations: se pueden usar desde acá)
const hojaUbicacion = hacerDeslizable($("#hoja-ubicacion"), () => ajustarMapa(mapaUbi, hojaUbicacion));
function pintarInicio() {
  const h = new Date().getHours();
  const saludo = h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
  $("#saludo").textContent = `¡${saludo}${estado.nombre ? " " + estado.nombre : ""}!`;
  $("#origen-nombre").textContent = origenElegido ? ORIGEN.nombre : "Elegí desde dónde salís";
  $(".origen-cambiar").firstChild.textContent = origenElegido ? "Cambiar " : "Elegir ";
  pintarMapaHome(); pintarFechas(); pintarTendencias(); pintarParaVos();
}

// ---------- Panel blanco deslizable (Home y Explorar) ----------
// Dos posiciones: abierto y cerrado (se ve más mapa). Se cambia deslizando hacia abajo/arriba con el dedo, con la
// rueda del mouse, o tocando la barrita de arriba. data-abierta / data-cerrada = % de la pantalla que ocupa el panel.
/** Alto de la pantalla de la app: en computadora es el del marco de celular, no el de la ventana. */
const altoPantalla = () => document.querySelector(".app").clientHeight || window.innerHeight;
function hacerDeslizable(hoja, alCambiar) {
  const scroll = hoja.querySelector(".hoja-scroll"), agarre = hoja.querySelector(".agarre");
  const abierta = Number(hoja.dataset.abierta), cerrada = Number(hoja.dataset.cerrada);
  hoja.style.setProperty("--abierta", abierta); hoja.style.setProperty("--cerrada", cerrada);
  const maxima = Number(hoja.dataset.maxima) || 0;                                          // tercer estado: expandida hasta 3/4 de la pantalla
  hoja.style.setProperty("--maxima", maxima);
  const estaExpandida = () => hoja.classList.contains("expandida");
  const expandir = e => { if (!maxima) return; hoja.classList.toggle("expandida", e); alCambiar?.(estaCerrada()); };
  const estaCerrada = () => hoja.classList.contains("cerrada");
  const pxCierre = () => (abierta - cerrada) / 100 * altoPantalla();
  const poner = c => {
    hoja.classList.toggle("cerrada", c); hoja.classList.remove("expandida"); hoja.style.transform = ""; hoja.style.transition = "";
    if (c) scroll.scrollTop = 0;
    alCambiar?.(c);
  };
  agarre.addEventListener("click", () => poner(!estaCerrada()));

  let y0 = null, dy = 0, arrastrando = false, empezoArriba = false, modo = null;
  hoja.addEventListener("touchstart", e => { y0 = e.touches[0].clientY; dy = 0; arrastrando = false; empezoArriba = scroll.scrollTop <= 0; }, { passive: true });
  hoja.addEventListener("touchmove", e => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (maxima && !estaCerrada() && !(arrastrando && !modo)) {                              // panel abierto: tirar hacia arriba lo expande hasta 3/4; hacia abajo desde el tope lo vuelve a la mitad
      if (!estaExpandida() && dy < -25) { modo = "subir"; arrastrando = true; e.preventDefault(); return; }
      if (estaExpandida() && dy > 0 && (empezoArriba || agarre.contains(e.target))) { modo = "bajar"; arrastrando = true; e.preventDefault(); return; }
    }
    const baja = !estaCerrada() && dy > 0 && (empezoArriba || agarre.contains(e.target));   // tirar hacia abajo desde el tope
    const sube = estaCerrada() && dy < 0;                                                    // tirar hacia arriba para abrir
    if (!arrastrando && !(baja || sube)) return;                                             // si no, es scroll normal del contenido
    arrastrando = true; e.preventDefault();
    const px = Math.min(Math.max((estaCerrada() ? pxCierre() : 0) + dy, 0), pxCierre());
    hoja.style.transition = "none"; hoja.style.transform = `translateY(${px}px)`;
  }, { passive: false });
  const soltar = () => {
    if (modo) { if (modo === "subir" && dy < -40) expandir(true); else if (modo === "bajar" && dy > 40) expandir(false); }
    else if (arrastrando) { const c = estaCerrada(); poner(!c && dy > 70 ? true : c && dy < -70 ? false : c); }
    y0 = null; arrastrando = false; modo = null;
  };
  hoja.addEventListener("touchend", soltar); hoja.addEventListener("touchcancel", soltar);

  let ultimo = 0;                                                                            // rueda del mouse
  hoja.addEventListener("wheel", e => {
    const ahora = Date.now(); if (ahora - ultimo < 450) return;
    if (maxima && !estaCerrada() && !estaExpandida() && e.deltaY > 20) { ultimo = ahora; expandir(true); }
    else if (maxima && estaExpandida() && e.deltaY < -20 && scroll.scrollTop <= 0) { ultimo = ahora; expandir(false); }
    else if (!estaCerrada() && !estaExpandida() && e.deltaY < -20 && scroll.scrollTop <= 0) { ultimo = ahora; poner(true); }
    else if (estaCerrada() && e.deltaY > 20) { ultimo = ahora; poner(false); }
  }, { passive: true });

  return { poner, estaCerrada, expandir, estaExpandida, visiblePx: () => (estaExpandida() ? maxima : estaCerrada() ? cerrada : abierta) / 100 * altoPantalla() };
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
// (Ya no hay botón "+" / "−" en las tarjetas: un lugar sumado se marca con el borde azul de su tarjeta; se suma desde su ficha o desde Explorar.)
const botonMas = () => "";
const claseSumado = id => estado.destinos.includes(id) ? " sumado" : "";
/** Botón de texto para sumar el hotspot al recorrido (tarjetas de Explorar). Hace lo mismo que el "+": suma o quita. */
const botonAgregar = id => { const sumado = estado.destinos.includes(id);
  return `<button class="agregar-rec" type="button" data-id="${id}" aria-pressed="${sumado}">${sumado ? "En tu recorrido" : "Agregar al recorrido"}</button>`; };
document.addEventListener("click", e => {
  const b = e.target.closest(".mas, .agregar-rec"); if (!b) return;
  const id = Number(b.dataset.id), i = estado.destinos.indexOf(id), l = porId(id);
  if (i >= 0) { estado.destinos.splice(i, 1); aviso(`${l.nombre} salió de tu recorrido.`); }
  else if (estado.destinos.length >= MAX_DESTINOS) { aviso(`Podés sumar hasta ${MAX_DESTINOS} hotspots.`); return; }
  else { estado.destinos.push(id); plan.modo = "destino"; aviso(`${l.nombre} sumado (${estado.destinos.length}). Mirá tu ruta en Pedalear.`); }
  plan.tramos = null; guardarEstado(); pintarCaja();
  $$(`[data-lugar="${id}"]`).forEach(c => c.classList.toggle("sumado", estado.destinos.includes(id)));
  $$(`.agregar-rec[data-id="${id}"]`).forEach(x => { const s = estado.destinos.includes(id); x.setAttribute("aria-pressed", s); x.textContent = s ? "En tu recorrido" : "Agregar al recorrido"; });
});

/** Tarjeta de los carruseles del Home. `lugar` puede faltar (actividad sin lugar en el dataset): entonces no hay link ni "+". */
function tarjetaLugarHTML({ lugar, etiqueta, titulo, metas, textoSinImagen, enlace }) {
  const contenido = `
    <div class="foto ${lugar?.img ? "" : "sin-imagen"}" ${lugar?.img ? `style="background-image:url('${fotoUrl(lugar)}')"` : ""}>
      <span class="tag">${esc(etiqueta)}</span>${lugar?.img ? "" : esc(textoSinImagen || "")}
    </div>
    <div class="info"><strong>${esc(titulo)}</strong>${metas.map(m => `<span class="meta">${esc(m)}</span>`).join("")}</div>`;
  return `<div class="tarjeta-lugar${lugar ? claseSumado(lugar.id) : ""}"${lugar ? ` data-lugar="${lugar.id}" data-grupo="${grupoDe(lugar.categoria)}"` : ""}>${lugar ? `<a class="enlace" href="${enlace || `#lugar/${lugar.id}`}">${contenido}</a>${botonMas(lugar.id)}` : `<div class="enlace">${contenido}</div>`}</div>`;
}

// ---------- Ficha: qué vas a ver, quiénes, desde cuándo, dato curioso y enlace (actividades y lugares) ----------
// Los textos los arma la IA con fuentes (codigo/recolectar_actividades.ps1) y una persona los revisa; mientras no estén
// verificados se avisa. Si falta un dato, ese bloque no se muestra (nunca se inventa).
function bloquesFicha({ sinopsis, quienes, tituloQuienes, desde, tituloDesde, curioso, url, aConfirmar }) {
  const b = [];
  if (sinopsis) b.push(`<h2>Qué vas a ver</h2><p class="texto">${esc(sinopsis)}</p>`);
  if (quienes?.length) b.push(`<h2>${esc(tituloQuienes)}</h2><div class="chips-ficha">${quienes.map(q => `<span>${esc(q)}</span>`).join("")}</div>`);
  if (desde) b.push(`<h2>${esc(tituloDesde)}</h2><p class="texto">${esc(desde)}</p>`);
  if (curioso) b.push(`<div class="dato-curioso"><strong>Dato curioso</strong><p>${esc(curioso)}</p></div>`);
  if (url && /^https?:\/\//.test(url)) b.push(`<a class="boton contorno enlace-info" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Más información <span aria-hidden="true">↗</span></a>`);
  if (b.length && aConfirmar) b.push(`<p class="nota">Información armada con ayuda de IA y a confirmar: revisá el sitio oficial antes de ir.</p>`);
  return b.join("");
}
const fichaDeLugar = l => { const f = FICHAS[l.id]; return f ? bloquesFicha({ sinopsis: f.sinopsis, quienes: f.referentes, tituloQuienes: "Quiénes están detrás", desde: f.desde,
  tituloDesde: "Desde cuándo", curioso: f.dato_curioso, url: f.url_oficial, aConfirmar: !f.verificado }) : ""; };

// ---------- 12 · Detalle de actividad ----------
const porActividad = id => ACTIVIDADES.find(a => a.id === id);
function pintarActividad(id) {
  const a = porActividad(id);
  if (!a) { location.hash = "inicio"; return; }
  const l = porId(a.lugar_id);
  $("#act-hero").style.backgroundImage = l?.img ? `url("${fotoUrl(l)}")` : "";
  $("#act-tipo").textContent = a.tipo;
  $("#act-nombre").textContent = a.nombre;
  const dm = f => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
  const fechas = a.desde && a.hasta ? `Del ${dm(a.desde)} al ${dm(a.hasta)}` : a.hasta ? `Hasta el ${dm(a.hasta)}` : a.desde ? `Desde el ${dm(a.desde)}` : "";
  const cuando = a.abre ? HOR.resumenActividad(a.dias, a.abre, a.cierra) : (a.dias || "");
  // Cuándo y cuánto, separado para entenderlo de un vistazo: fechas y entradas en etiquetas, y los días en la grilla de la semana
  const semana = HOR.semanaActividad(a.dias, a.abre, a.cierra);
  const mayus = t => t.charAt(0).toUpperCase() + t.slice(1);
  const etiquetas = [fechas ? `<span class="pill-dato fecha">${esc(fechas)}</span>` : "",
    ...String(a.precio || "").split(/\s*;\s*/).filter(Boolean).map(p => `<span class="pill-dato precio">${esc(mayus(p))}</span>`)].filter(Boolean);
  const estadoHoy = semana ? HOR.estadoAhora(semana) : null;
  $("#act-meta").innerHTML = (etiquetas.length ? `<div class="pills-datos">${etiquetas.join("")}</div>` : "") + (semana
    ? `<div class="horarios"><div class="horarios-cab"><p class="etiqueta">Días y horarios</p>
        ${estadoHoy ? `<span class="estado ${estadoHoy.abierto ? "abierto" : "cerrado"}">${esc(estadoHoy.texto)}</span>` : ""}</div>
        <ul class="semana">${semanaHTML(semana)}</ul>${semana.notas.length ? `<p class="horarios-notas">${semana.notas.map(esc).join(" · ")}</p>` : ""}</div>`
    : cuando ? `<p class="sub">${esc(cuando)}</p>` : "");
  const donde = $("#act-donde");
  donde.textContent = `⌖ ${a.lugar}${l ? ` · ${l.barrio}` : ""}`;
  const ver = $("#act-ver");
  ver.hidden = !l;
  if (l) ver.href = `#lugar/${l.id}`;
  $("#act-ficha").innerHTML = bloquesFicha({ sinopsis: a.sinopsis, quienes: a.artistas, tituloQuienes: "Quiénes participan", desde: a.trayectoria,
    tituloDesde: "Desde cuándo", curioso: a.dato_curioso, url: a.url_oficial, aConfirmar: !a.ficha_verificada || a.estado !== "verificada" })
    || `<p class="nota">Estamos sumando más información de esta actividad. Mientras tanto, mirá el hotspot o consultá con ellos antes de ir.</p>`;
  const sumar = $("#act-sumar");
  sumar.hidden = !l;
  if (l) {
    sumar.textContent = "Sumar el hotspot al recorrido";
    sumar.onclick = () => {
      if (!estado.destinos.includes(l.id) && estado.destinos.length < MAX_DESTINOS) estado.destinos.push(l.id);
      plan.modo = "destino"; plan.tramos = null; guardarEstado(); aviso(`${l.nombre} se sumó a tu recorrido.`); volver();   // vuelve a donde estabas
    };
  }
}

// ---------- 13 · Pasaporte cultural ----------
// Un sello por cada lugar visitado, en la página de su barrio. Los hotspots que faltan aparecen como huecos para descubrir.
// El dibujo de cada sello se carga en img/sellos/<id>.png y se avisa en data/sellos.js; mientras tanto se usa la forma base.
const TINTAS = ["#000", "#000", "#000", "#000", "#000"];   // las de la paleta, una por categoría
const iniciales = nombre => nombre.replace(/\([^)]*\)/g, "").split(/\s+/).filter(w => w && !/^(de|del|la|el|los|las|y|en)$/i.test(w)).slice(0, 2).map(w => w[0]).join("").toUpperCase();
function selloHTML(l, visitado, extra = "") {
  const f = visitado && estado.sellos?.[l.id] ? new Date(estado.sellos[l.id]).toLocaleDateString("es-AR", { day: "numeric", month: "short" }) : "";
  const interior = visitado && SELLOS_ARTE.has(String(l.id)) ? `<img src="img/sellos/${l.id}.png" alt="">` : `<b>${esc(iniciales(l.nombre))}</b>`;
  return `<div class="sello ${visitado ? "" : "vacio"} ${extra}" ${visitado ? "" : 'aria-label="Sello por descubrir"'}>
    <div class="sello-marca">${visitado ? interior : "?"}</div><span>${esc(l.nombre)}</span>${f ? `<small>${esc(f)}</small>` : ""}</div>`;
}
function pintarPasaporte() {
  const visitados = estado.visitados.map(porId).filter(Boolean), vistos = new Set(visitados.map(l => l.id));
  const hotspots = LUGARES.filter(l => l.verificado);
  const paginas = new Map(ZONA.barrios.map(b => [sinTildes(b), { nombre: b, sellos: [], faltan: [] }]));
  const pagina = l => { const k = sinTildes(l.barrio); if (!paginas.has(k)) paginas.set(k, { nombre: l.barrio, sellos: [], faltan: [] }); return paginas.get(k); };
  visitados.forEach(l => pagina(l).sellos.push(l));
  hotspots.filter(l => !vistos.has(l.id)).forEach(l => pagina(l).faltan.push(l));
  const deLosHotspots = hotspots.filter(l => vistos.has(l.id)).length;
  $("#pasaporte-cuenta").textContent = `${visitados.length} ${visitados.length === 1 ? "sello" : "sellos"} · ${deLosHotspots} de ${hotspots.length} hotspots`;
  $("#pasaporte-paginas").innerHTML = [...paginas.values()].filter(p => p.sellos.length + p.faltan.length).map((p, i) => `
    <section class="pagina-pasaporte" style="--tinta:${TINTAS[i % TINTAS.length]}">
      <header><h2>${esc(p.nombre)}</h2><span>${p.sellos.length} ${p.sellos.length === 1 ? "sello" : "sellos"}</span></header>
      <div class="sellos">${p.sellos.map(l => selloHTML(l, true)).join("")}${p.faltan.map(l => selloHTML(l, false)).join("")}</div>
    </section>`).join("") || `<p class="nota">Todavía no hay sellos. Hacé tu primer recorrido.</p>`;
}

// ---------- 03 · Mapa del Home ----------
// Mapa en vivo: se arrastra y se hace zoom. Muestra tu punto de salida y las estaciones EcoBici vigentes.
// Cada estación es un círculo con la cantidad de bicis disponibles AHORA (js/disponibilidad.js, API de EcoBici):
//   negro = ninguna · rojo 1 a 35 % · naranja 36 a 70 % · amarillo 71 a 100 % (del total de lugares de la estación).
// Sin datos en vivo (sin claves o sin conexión) se muestra un círculo sin número, con el color de la estimación
// de js/prediccion.js, y el panel lo aclara.
let marcaHome;
const DISP = window.PedalitoDisponibilidad;
const COLOR_NIVEL = { alta: "var(--n-alta)", media: "var(--n-media)", baja: "var(--n-baja)" };    // colores de la ESTIMACIÓN (sin datos en vivo)
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Texto corto de disponibilidad de una estación: real ("7 bicis ahora") o estimado ("bicis: media (estimado)"). */
function dispTexto(est, clave) {
  const v = DISP.de(est.numero);
  if (v) {
    const n = clave === "bicis" ? v.bicis : v.anclajes;
    return n === 0 ? (clave === "bicis" ? "sin bicis ahora" : "sin anclajes libres ahora")
      : clave === "bicis" ? `${plural(n, "bici", "bicis")} ahora` : `${plural(n, "anclaje libre", "anclajes libres")} ahora`;
  }
  return `${clave === "bicis" ? "bicis" : "anclajes libres"}: ${clave === "bicis" ? est.nivelBicis : est.nivelAnclajes} (estimado)`;
}

/** Aplica número y color a un círculo de estación. `clave`: "bicis" (retirar) o "anclajes" (dejar la bici). */
function pintarPin(el, numero, clave, sinDatos = "") {
  const v = DISP.de(numero);
  el.classList.add("est-pin"); el.classList.remove("claro", "estimado");   // sin pisar "maplibregl-marker": si no, el círculo pierde su posición en el mapa
  if (v) {
    const n = clave === "bicis" ? v.bicis : v.anclajes, nv = DISP.nivelDe(n, v.capacidad);
    el.textContent = n; el.style.background = nv.color; el.classList.toggle("claro", nv.claro);
    el.setAttribute("aria-label", `${dispTexto({ numero }, clave)}`);
    return true;
  }
  el.textContent = sinDatos; el.style.background = ""; el.classList.add("estimado");
  return false;
}

/** Sin datos en vivo: pinta el círculo con el color de la estimación (rojo bajo, naranja medio, amarillo alto). */
function pintarEstimado(el, est, clave) {
  const p = PRED.predecirEstacion(est.numero, new Date(), 0), nv = clave === "bicis" ? p.nivelBicis : p.nivelAnclajes;
  el.style.background = COLOR_NIVEL[nv]; el.classList.add("claro");
}

function popupEstacion(e) {
  const v = DISP.de(e.numero);
  if (v) {
    return `<strong>${esc(e.nombre)}</strong><br>Bicis ahora: ${v.bicis} de ${v.capacidad}<br>Anclajes libres: ${v.anclajes}` +
      `${v.deshabilitadas ? `<br>Bicis fuera de servicio: ${v.deshabilitadas}` : ""}<br><small>Actualizado ${esc(DISP.hora(DISP.estado.actualizado))}</small>`;
  }
  const p = PRED.predecirEstacion(e.numero, new Date(), 0);
  return `<strong>${esc(e.nombre)}</strong><br>Bicis: ${esc(p.nivelBicis)} · estimado<br><small>Sin datos en vivo</small>`;
}

/** Crea o actualiza los círculos de las 110 estaciones sobre un mapa (Ubicación, Inicio o Explorar). Cada mapa lleva sus propios pines. */
const pinesPorMapa = new Map();                                       // mapa → (número de estación → { marker, el })
function pintarEstacionesEn(mapa) {
  if (!mapa || !window.maplibregl) return;
  if (!pinesPorMapa.has(mapa)) pinesPorMapa.set(mapa, new Map());
  const pines = pinesPorMapa.get(mapa);
  ESTACIONES.forEach(e => {
    let pin = pines.get(e.numero);
    if (!pin) {
      const el = document.createElement("button"); el.type = "button";
      const marker = new maplibregl.Marker({ element: el }).setLngLat([e.lon, e.lat]).addTo(mapa);
      el.addEventListener("click", ev => {
        ev.stopPropagation();
        new maplibregl.Popup({ offset: 18 }).setLngLat([e.lon, e.lat]).setHTML(popupEstacion(e)).addTo(mapa);
      });
      pin = { marker, el }; pines.set(e.numero, pin);
    }
    if (!pintarPin(pin.el, e.numero, "bicis")) {                      // estimación: color según la probabilidad de bicis
      const p = PRED.predecirEstacion(e.numero, new Date(), 0);
      pin.el.style.background = COLOR_NIVEL[p.nivelBicis];
      pin.el.setAttribute("aria-label", `${e.nombre}: bicis ${p.nivelBicis} (estimado)`);
    }
  });
}
/** Estaciones en todos los mapas que ya existen + la nota de abajo del saludo del Home. */
function pintarEstacionesHome() {
  [mapaUbi, mapaHome, mapaExp].forEach(pintarEstacionesEn);
  const nota = $("#nota-bicis");
  nota.textContent = DISP.estado.enVivo
    ? `El número es la cantidad de bicis disponibles ahora (actualizado ${DISP.hora(DISP.estado.actualizado)}). El color, cuánto de la estación está ocupado. Tocá una estación para ver el detalle.`
    : "Sin datos en vivo por ahora: los colores son una estimación según el día y la hora. Tocá una estación para ver el detalle.";
}

/** Lugares (hotspots) de tus intereses a 5 km o menos, como círculos rosas sobre el mapa. En "Elegí tu punto de partida" el popup ofrece salir desde ahí. */
const marcasLugares = new Map();                                      // mapa → marcadores
function pintarLugaresEn(mapa, paraSalir = false) {
  if (!mapa || !window.maplibregl) return;
  (marcasLugares.get(mapa) || []).forEach(m => m.remove());
  const marcas = [];
  LUGARES.filter(l => estado.intereses.includes(l.categoria) && desdeOrigen(l) <= 5).sort((a, b) => desdeOrigen(a) - desdeOrigen(b)).slice(0, 120).forEach(l => {
    const el = document.createElement("button"); el.type = "button"; el.className = "lugar-pin"; el.dataset.grupo = grupoDe(l.categoria); el.setAttribute("aria-label", l.nombre);
    el.addEventListener("click", ev => {
      ev.stopPropagation();
      const accion = paraSalir ? `<button type="button" class="popup-salir">Salir desde acá</button>` : `<a href="#lugar/${l.id}">Ver hotspot</a>`;
      const popup = new maplibregl.Popup({ offset: 14 }).setLngLat([l.lon, l.lat]).setHTML(`<strong>${esc(l.nombre)}</strong><br>${esc(l.categoria)}<br>${accion}`).addTo(mapa);
      popup.getElement().querySelector(".popup-salir")?.addEventListener("click", () => { popup.remove(); elegirPunto({ lat: l.lat, lon: l.lon }, l.nombre); });
    });
    marcas.push(new maplibregl.Marker({ element: el }).setLngLat([l.lon, l.lat]).addTo(mapa));
  });
  marcasLugares.set(mapa, marcas);
}
const pintarLugaresHome = () => pintarLugaresEn(mapaHome);

/** Ciclovías de la Ciudad en azul, siempre visibles en todos los mapas. */
function dibujarCiclovias(mapa) {
  if (!mapa || !window.PEDALITO_CICLOVIAS) return;
  const agregar = () => {
    if (mapa.getSource("ciclovias")) return;
    mapa.addSource("ciclovias", { type: "geojson", data: window.PEDALITO_CICLOVIAS });
    mapa.addLayer({ id: "ciclovias", type: "line", source: "ciclovias", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#000", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 14, 3.5, 17, 6], "line-opacity": 1 } });
  };
  if (mapa.isStyleLoaded()) agregar(); else mapa.on("style.load", agregar);
}

// ---------- Vista compartida: Inicio y Explorar muestran el mismo mapa (misma zona y zoom), así que al pasar de uno al otro no cambia ----------
let vistaMapa = null;                                                 // { de: "home" | "exp", center, zoom }
function recordarVista(mapa, de) { mapa.on("moveend", () => { const c = mapa.getCenter(); vistaMapa = { de, center: [c.lng, c.lat], zoom: mapa.getZoom() }; }); }
/** Pone en `mapa` la vista del otro mapa (o el punto de partida si nadie la movió todavía). */
function aplicarVista(mapa, de, hoja) {
  if (vistaMapa?.de === de) return;                                   // este mapa ya tiene la última vista
  const v = vistaMapa || { center: [ORIGEN.lon, ORIGEN.lat], zoom: 14.5 };
  mapa.jumpTo({ center: v.center, zoom: v.zoom, padding: paddingMapaCompartido() });
}
/** Inicio y Explorar son el MISMO mapa: usan siempre el mismo margen inferior (la mitad de la pantalla), sin importar cuánto suba o baje la caja de encima. */
const paddingMapaCompartido = () => ({ top: 0, left: 0, right: 0, bottom: Math.round(altoPantalla() * 0.5) });

// ---------- Capas del mapa: Estaciones EcoBici y Hotspots (arrancan activas; sin ninguna el mapa queda limpio) ----------
const capas = { estaciones: true, hotspots: true };
function aplicarCapas() {
  const app = $(".app");
  app.classList.toggle("sin-estaciones", !capas.estaciones);          // los pines son marcadores HTML: el CSS los oculta en estos tres mapas
  app.classList.toggle("sin-hotspots", !capas.hotspots);
  $$("#filtro-mapa .capa").forEach(b => b.setAttribute("aria-pressed", String(capas[b.dataset.capa])));
}
$("#filtro-mapa").addEventListener("click", e => {
  const b = e.target.closest(".capa"); if (!b) return;
  capas[b.dataset.capa] = !capas[b.dataset.capa]; aplicarCapas();
});

function pintarMapaHome() {
  if (!window.maplibregl) return;
  if (mapaHome) {                                   // volvió a Home: recentrar en el punto de salida y refrescar estaciones
    mapaHome.resize(); aplicarVista(mapaHome, "home", hojaInicio);
    marcaHome.setLngLat([ORIGEN.lon, ORIGEN.lat]);
    pintarEstacionesHome(); pintarLugaresHome();
    return;
  }
  mapaHome = new maplibregl.Map({ container: "mapa-home", style: ENV.OPENFREEMAP_STYLE_URL, center: [ORIGEN.lon, ORIGEN.lat],
    zoom: 14.5, attributionControl: false });
  ZONA.dibujar(mapaHome);
  UBI.dibujar(mapaHome); dibujarCiclovias(mapaHome);
  mapaHome.jumpTo({ padding: paddingMapaCompartido() });
  recordarVista(mapaHome, "home");
  mapaHome.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  mapaHome.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
  const punto = document.createElement("div");
  punto.style.cssText = "width:18px;height:18px;border-radius:50%;background:#000;border:3px solid #F4EFE6;box-shadow:0 0 0 2px #000";
  marcaHome = new maplibregl.Marker({ element: punto }).setLngLat([ORIGEN.lon, ORIGEN.lat]).addTo(mapaHome);
  pintarEstacionesHome(); pintarLugaresHome();
}
const hojaInicio = hacerDeslizable($("#hoja-inicio"));                    // la caja sube y baja sin mover el mapa

// Clima actual (OpenWeather)
let clima = null;
/** Caja del clima, arriba a la derecha del saludo del Home: ícono, temperatura y descripción corta. */
function pintarClima(datos) {
  const icono = $("#clima-icono");
  $("#clima-temp").textContent = datos ? `${Math.round(datos.temp)} °C` : "– °C";
  $("#clima-desc").textContent = datos ? `${datos.descripcion.charAt(0).toUpperCase()}${datos.descripcion.slice(1)}${datos.lluvia ? ` · ${datos.lluvia} mm` : ""}` : "Sin datos";
  icono.hidden = !datos?.icono;
  if (datos?.icono) icono.src = `https://openweathermap.org/img/wn/${datos.icono}@2x.png`;
}
async function cargarClima() {
  if (!ENV.OPENWEATHER_API_KEY) { clima = null; pintarClima(null); return; }
  try {
    const r = await fetch(`${ENV.OPENWEATHER_URL}?lat=${ORIGEN.lat}&lon=${ORIGEN.lon}&units=metric&lang=es&appid=${ENV.OPENWEATHER_API_KEY}`);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    clima = { temp: d.main.temp, descripcion: d.weather[0].description, icono: d.weather[0].icon, lluvia: d.rain?.["1h"] || 0, viento: d.wind.speed * 3.6 };
    pintarClima(clima);
  } catch { pintarClima(null); }
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
    return tarjetaLugarHTML({ lugar, etiqueta, titulo: a.nombre, metas: [dato], textoSinImagen: a.tipo, enlace: `#actividad/${a.id}` });   // abre la ficha de la actividad
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
      || `<p class="nota">No hay hotspots de tus intereses a menos de 5 km.</p>`;
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
  }).join("") || `<p class="nota">Todavía no hay visitas esta semana. Cuando alguien inicie un recorrido, sus hotspots aparecen acá.</p>`;
  nota.textContent = !lista.length ? "" : origen === "servidor"
    ? "Personas distintas que iniciaron un recorrido con ese hotspot, de hoy a 7 días atrás. Se actualiza todos los días."
    : "Sin conexión con el servidor: se muestran solo tus visitas de los últimos 7 días.";
}

// ---------- 04 · Explorar ----------
const COLOR_TARJETA = { naranja: "#000", celeste: "#000", verde: "#000", rosa: "#000" };
const ZONA_FOCO = 90;             // px de scroll en los que una tarjeta pasa de tamaño normal a agrandada (= lo que se asoma de cada tarjeta apilada)
let mapaExp, marcaExp;
// Los tres filtros son interruptores independientes: se pueden combinar o apagar todos (entonces se ve todo, del más cerca al más lejos)
const filtros = { cerca: false, intereses: false, verificado: false, gastro: false, cultura: false };
/** Cada vez que se entra a Explorar (salvo al volver del detalle de un lugar) los tres filtros y el buscador arrancan apagados. */
function reiniciarFiltros() { Object.assign(filtros, { cerca: false, intereses: false, verificado: false, gastro: false, cultura: false }); $("#buscador").value = ""; limite = MAX_LISTA; }
let limite = MAX_LISTA;           // cuántos lugares se muestran; "Ver más" suma otra tanda

function pintarExplorar({ masLugares = false } = {}) {
  const q = $("#buscador").value.trim().toLowerCase();
  let lista = LUGARES.filter(l => !q || (l.nombre + " " + l.categoria + " " + l.barrio).toLowerCase().includes(q));
  if (filtros.intereses) lista = lista.filter(l => estado.intereses.includes(l.categoria));
  if (filtros.verificado) lista = lista.filter(l => l.verificado);
  if (filtros.gastro !== filtros.cultura) lista = lista.filter(l => (grupoDe(l.categoria) === "gastro") === filtros.gastro);   // Gastronomía o Espacios culturales (con los dos activos se ve todo)
  if (filtros.cerca) lista = lista.filter(l => desdeOrigen(l) <= 5);
  lista.sort((a, b) => desdeOrigen(a) - desdeOrigen(b));
  const mostrados = lista.slice(0, limite);
  $("#cantidad").textContent = lista.length > mostrados.length ? `Mostrando ${mostrados.length} de ${lista.length} hotspots` : `${lista.length} hotspots`;
  $("#lista-lugares").innerHTML = mostrados.map((l, i) => `
    <div class="tarjeta-apilada con-acciones ${COLORES[i % COLORES.length]}${claseSumado(l.id)}" data-lugar="${l.id}" data-grupo="${grupoDe(l.categoria)}"${l.img ? ` style="--img:url('${fotoUrl(l)}')"` : ""}>
      <a class="enlace-card" href="#lugar/${l.id}">
        <strong>${esc(l.nombre)}</strong>
        <span>${esc(l.categoria)} · ${fmtKm(desdeOrigen(l))} · ${esc(l.barrio)}</span>
      </a>
      <div class="acciones-card">
        <a class="ver" href="#lugar/${l.id}">Ver hotspot</a>
        ${botonAgregar(l.id)}
      </div>
    </div>`).join("");
  $("#ver-mas").hidden = lista.length <= mostrados.length;
  $("#ver-mas").textContent = `Ver más hotspots (${Math.min(MAX_LISTA, lista.length - mostrados.length)} más)`;
  $$("#filtros .chip").forEach(c => { c.classList.toggle("activo", filtros[c.dataset.filtro]); c.setAttribute("aria-pressed", filtros[c.dataset.filtro]); });
  medirFoco();
  pintarMapaExplorar();                         // mismo mapa que el Inicio: no depende de la lista
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
function pintarMapaExplorar() {
  if (!window.maplibregl) return;
  if (!mapaExp) {
    const v = vistaMapa || { center: [ORIGEN.lon, ORIGEN.lat], zoom: 14.5 };
    mapaExp = new maplibregl.Map({ container: "mapa-explorar", style: ENV.OPENFREEMAP_STYLE_URL, center: v.center, zoom: v.zoom, attributionControl: false });
    entrandoExplorar = false;
    ZONA.dibujar(mapaExp);
    UBI.dibujar(mapaExp); dibujarCiclovias(mapaExp);
    mapaExp.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapaExp.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
    const punto = document.createElement("div");
    punto.style.cssText = "width:18px;height:18px;border-radius:50%;background:#000;border:3px solid #F4EFE6;box-shadow:0 0 0 2px #000";
    marcaExp = new maplibregl.Marker({ element: punto }).setLngLat([ORIGEN.lon, ORIGEN.lat]).addTo(mapaExp);
    mapaExp.jumpTo({ padding: paddingMapaCompartido() });
    recordarVista(mapaExp, "exp");
    pintarLugaresEn(mapaExp); pintarEstacionesEn(mapaExp);           // los mismos pines que el Inicio
  } else if (entrandoExplorar) {                                       // recién entra a Explorar: misma vista que tenía el Inicio
    entrandoExplorar = false;
    mapaExp.resize();
    marcaExp.setLngLat([ORIGEN.lon, ORIGEN.lat]);
    aplicarVista(mapaExp, "exp", hojaExplorar);
    pintarLugaresEn(mapaExp); pintarEstacionesEn(mapaExp);
  }
  aplicarCapas();
}
const hojaExplorar = hacerDeslizable($("#hoja-explorar"));                // la caja sube y baja sin mover el mapa

// ---------- 11 · Detalle lugar ----------
// Horarios: se reinterpreta el texto del dataset (js/horarios.js) y se muestra como una semana de un vistazo.
// Si no se puede entender con certeza, se muestra el texto original, sin inventar nada.
/** Los 7 días de una semana ya interpretada (HOR.interpretar o HOR.semanaActividad), con el día de hoy marcado. */
function semanaHTML(h) {
  const hoy = (new Date().getDay() + 6) % 7;
  return h.semana.map((d, i) => {
    const horas = d.cerrado ? `<span class="cerrado">Cerrado</span>`
      : d.texto ? `<span>${esc(d.texto)}</span>` : d.tramos.map(t => `<span>${esc(HOR.tramoCorto(t))}</span>`).join("");
    return `<li class="dia ${d.cerrado ? "cerrado" : "abierto"} ${i === hoy ? "hoy" : ""}" ${i === hoy ? 'aria-current="date"' : ""}><b>${HOR.INICIAL[i]}</b>${horas}</li>`;
  }).join("");
}
function pintarHorarios(l) {
  const cont = $("#detalle-horarios"), h = HOR.interpretar(l.horario);
  const fuente = [l.cerrado ? `Cerrado: ${esc(l.cerrado)}.` : "", l.fuente_horario ? `Fuente: ${esc(l.fuente_horario)}.` : ""].filter(Boolean).join(" ");
  const pie = `<p class="horarios-nota">${fuente} Verificá horarios antes de salir.</p>`;
  if (!l.horario) { cont.innerHTML = `<p class="etiqueta">Horarios</p><p class="horarios-texto">Este hotspot no tiene horario cargado.</p>${pie}`; return; }
  if (!h.ok || h.dudoso) {
    cont.innerHTML = `<p class="etiqueta">Horarios</p><p class="horarios-texto">${esc(l.horario)}</p>
      <p class="horarios-nota">No pudimos ordenar este horario con certeza, así que lo mostramos tal como figura en los datos.</p>${pie}`;
    return;
  }
  const estadoHoy = HOR.estadoAhora(h), dias = semanaHTML(h);
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
  $("#detalle-categoria").textContent = l.categoria; $("#detalle-categoria").dataset.grupo = grupoDe(l.categoria);
  $("#detalle-bloque").dataset.grupo = grupoDe(l.categoria); $("#lugar").dataset.grupo = grupoDe(l.categoria); $("#detalle-lateral-texto").textContent = l.categoria;
  $("#detalle-nombre").textContent = l.nombre;
  $("#detalle-meta").textContent = `${fmtKm(desdeOrigen(l))} · ${l.barrio}`;
  $("#detalle-desc").textContent = `${l.direccion}. Estación EcoBici más cercana a ${l.dist_m} m.`;
  pintarHorarios(l);
  $("#detalle-ficha").innerHTML = fichaDeLugar(l);
  const credito = $("#detalle-credito");
  credito.hidden = !l.foto && !l.imgCategoria;
  if (l.imgCategoria) credito.textContent = "Imagen ilustrativa de la categoría: no es una foto de este lugar.";
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
    plan.modo = "destino"; plan.tramos = null; guardarEstado(); aviso(`${l.nombre} se sumó a tu recorrido.`); volver();   // vuelve a donde estabas (Inicio, Explorar…)
  };
}

// ---------- Búsqueda de puntos (la usan Accesos rápidos y el buscador de origen) ----------
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
    || `<li><small style="padding:10px 14px">No encontramos ese hotspot.</small></li>`;
  ul.hidden = false;
}

// ---------- 05 · Mi ruta en bici (la pestaña Pedalear) ----------
// Los hotspots que sumás con «Agregar al recorrido» (Explorar, Inicio, fichas) se ven acá como una ruta: tiempo, distancia,
// mapa, itinerario e impacto. La ruta la arma el mismo motor de siempre (armarRecorrido: IA para elegir estaciones y trazados,
// ruteo por calles). «Iniciar pedaleo con GPS» arranca la guía paso a paso (pantalla "recorrido").
let mapaMiRuta = null, calculando = 0, editandoParadas = false;
const KG_CO2_POR_KM_AUTO = 0.12;     // estimación: un auto promedio emite unos 120 g de CO₂ por km; la bici, ninguno

function pintarMiRuta() {
  const hay = estado.destinos.length > 0;
  $("#miruta-vacia").hidden = hay; $("#miruta-contenido").hidden = !hay; $("#botones-ruta").hidden = !hay;
  if (!hay) { $("#chip-ciclo").hidden = true; $("#chip-bicis").hidden = true; }
  if (!hay) { editandoParadas = false; return; }
  plan.modo = "destino";
  if (!plan.retiroElegido && plan.tramos) plan.retiroElegido = plan.estaciones?.retiro?.numero;   // un recorrido que ya estaba armado conserva su estación
  if (!plan.retiroElegido) { mostrarEstacionesRetiro(); return; }                                 // primero se elige la estación; después se arma el recorrido
  $("#miruta-estaciones").hidden = true;
  if (plan.tramos) dibujarMiRuta(); else calcularMiRuta();
}

/** Antes de armar el recorrido: las tres mejores estaciones EcoBici para retirar cerca de la salida (con bicis ahora o estimadas). */
function mostrarEstacionesRetiro() {
  const cerca = PRED.estacionesCerca(ORIGEN, "bicis", new Date(), 0, RADIO_ESTACION_KM, 3), caja = $("#miruta-estaciones");
  $("#miruta-resultado").hidden = true; $("#miruta-iniciar").disabled = true; $("#chip-ciclo").hidden = true; $("#chip-bicis").hidden = true;
  $("#botones-ruta").hidden = true;                                     // los botones de iniciar aparecen cuando ya está elegida la estación
  pintarMapaEstaciones(cerca);                                         // el mapa de fondo muestra tu salida, las tres estaciones y tus hotspots
  if (!cerca.length) { caja.hidden = true; $("#miruta-estado").textContent = "No hay estaciones EcoBici a 700 m de tu salida."; $("#miruta-estado").hidden = false; return; }
  $("#miruta-estado").hidden = true; caja.hidden = false;
  $("#miruta-estaciones-lista").innerHTML = cerca.map(e => `<li><label class="estacion-op"><span class="icono-circulo">${ICONOS.bici}</span>
    <span class="cuerpo"><strong>${esc(e.nombre)}</strong><small>${esc(dispTexto(e, "bicis"))} · a ${e.distM} m</small></span>
    <input type="radio" name="est-retiro" value="${e.numero}"><i class="radio" aria-hidden="true"></i></label></li>`).join("");
}
$("#miruta-estaciones-lista").addEventListener("change", e => { plan.retiroElegido = Number(e.target.value); plan.tramos = null; pintarMiRuta(); });
$("#itinerario").addEventListener("click", e => { if (!e.target.closest("[data-cambiar]")) return; plan.retiroElegido = null; plan.tramos = null; pintarMiRuta(); });

async function calcularMiRuta() {
  const mia = ++calculando;
  $("#miruta-estado").textContent = "Armando tu ruta…"; $("#miruta-estado").hidden = false;
  $("#miruta-resultado").hidden = true; $("#miruta-iniciar").disabled = true;
  await armarRecorrido({ vista: "miruta" });
  if (mia !== calculando || pantallaActual !== "planificar") return;
  if (plan.tramos) dibujarMiRuta();
  else $("#miruta-estado").textContent = $("#recorrido-resumen").textContent || "No pudimos armar la ruta. Probá de nuevo.";
}

/** Números de la ruta armada (en bici y a pie) a partir de los tramos que dejó el motor. */
function datosRuta() {
  const tramos = plan.tramos.filter(t => t.modo !== "llegada");
  const validos = tramos.filter(t => t.rutas?.length), elegida = t => t.rutas[t.elegida];
  const sumar = (modo, campo) => validos.filter(t => t.modo === modo).reduce((s, t) => s + elegida(t)[campo], 0);
  const mBici = sumar("bici", "metros"), mPie = sumar("pie", "metros");
  const seg = validos.reduce((s, t) => s + elegida(t).segundos, 0);
  const metrosCiclo = validos.filter(t => t.modo === "bici").reduce((s, t) => s + elegida(t).metros * elegida(t).pctCiclovia / 100, 0);
  return { validos, elegida, mBici, mPie, minutos: minutosDe(seg), pctCiclo: mBici ? Math.round(100 * metrosCiclo / mBici) : null };
}
/** Minutos que lleva llegar a cada parada desde la anterior (a pie + en bici). */
function minutosPorParada(elegida) {
  const res = []; let seg = 0;
  plan.tramos.forEach(t => {
    if (t.rutas?.length) seg += elegida(t).segundos;
    if (t.tipo === "lugar" || t.tipo === "final") { res.push(minutosDe(seg)); seg = 0; }
  });
  return res;
}
const dispChips = est => {
  const v = DISP.de(est.numero);
  return v ? `<span class="chip-disp ${v.bicis ? "ok" : "sin"}">${plural(v.bicis, "bici lista", "bicis listas")}</span><span class="chip-disp">${plural(v.anclajes, "anclaje libre", "anclajes libres")}</span>`
           : `<span class="chip-disp">Bicis: ${esc(PRED.predecirEstacion(est.numero, new Date(), 0).nivelBicis)} (estimado)</span>`;
};

function dibujarMiRuta() {
  const d = datosRuta();
  $("#miruta-estado").hidden = true; $("#miruta-resultado").hidden = false; $("#miruta-iniciar").disabled = false;
  $("#stat-minutos").textContent = d.minutos;
  $("#stat-km").textContent = fmtKm((d.mBici + d.mPie) / 1000).replace(" km", "").replace(".", ",");
  $("#stat-ciclo").textContent = d.pctCiclo == null ? "–" : `${d.pctCiclo}%`;
  $("#impacto-co2").textContent = `${(d.mBici / 1000 * KG_CO2_POR_KM_AUTO).toFixed(1).replace(".", ",")} kg`;
  $("#impacto-ciclo").textContent = d.pctCiclo == null ? "–" : `${d.pctCiclo}%`;
  $("#chip-ciclo").hidden = d.pctCiclo == null; $("#chip-ciclo").textContent = `${d.pctCiclo}% por ciclovía`;
  $("#chip-bicis").hidden = false; $("#chip-bicis").textContent = DISP.estado.enVivo ? "EcoBici en vivo" : "EcoBici estimada";

  // Itinerario: punto de partida (con la estación donde retirás la bici) y cada parada
  const retiro = plan.tramos.find(t => t.modo === "bici")?.retiro;
  const minutos = minutosPorParada(d.elegida);
  const inicio = `<li class="parada inicio"><span class="num"><i></i></span><div class="cuerpo">
      <span class="etiqueta">Punto de partida</span><strong>${esc(ORIGEN.nombre)}</strong>
      ${retiro ? `<small>Estación EcoBici #${esc(retiro.numero)} · ${esc(retiro.nombre)}</small><div class="chips-disp">${dispChips(retiro)}</div><button type="button" class="cambiar-estacion" data-cambiar>Cambiar estación</button>` : `<small>Vas a pie hasta tu primera parada</small>`}</div></li>`;
  const paradas = plan.ids.map(porId).map((l, i) => {
    const h = l.horario ? HOR.interpretar(l.horario) : null, e = h && h.ok && !h.dudoso ? HOR.estadoAhora(h) : null;
    return `<li class="parada"><span class="num">${i + 1}</span><div class="cuerpo">
      <span class="etiqueta">Parada ${i + 1}${minutos[i] != null ? ` · ${minutos[i]} min` : ""}</span><strong>${esc(l.nombre)}</strong><small>${esc(l.direccion || l.barrio)}</small></div>
      ${e ? `<span class="estado-pill ${e.abierto ? "abierto" : "cerrado"}">${e.abierto ? "Abierto" : "Cerrado"}</span>` : `<span class="estado-pill">${esc(l.categoria)}</span>`}
      <button type="button" class="quitar" data-quitar="${l.id}" aria-label="Quitar ${esc(l.nombre)} de la ruta">✕</button></li>`;
  });
  $("#itinerario").innerHTML = inicio + paradas.join("");
  pintarEdicionParadas();
  pintarMapaMiRuta(d);
}

function pintarEdicionParadas() {
  $("#itinerario").classList.toggle("editando", editandoParadas);
  $("#miruta-modificar").textContent = editandoParadas ? "Listo" : "Modificar paradas";
  $("#miruta-sumar-mas").hidden = !editandoParadas || estado.destinos.length >= MAX_DESTINOS;
}

// ---------- Mapa de Pedalear: el mismo mapa que Inicio y Explorar (misma vista, mismos puntos, mismas capas) ----------
// Solo cambia la caja de encima; a este mapa se le suma la ruta (líneas) y las paradas/estaciones de la ruta.
let marcasRuta = [], marcaMiRuta = null;
const hojaPlanificar = hacerDeslizable($("#hoja-planificar"));                // la caja sube y baja sin mover el mapa

function prepararMapaMiRuta() {
  if (!window.maplibregl) return;
  if (!mapaMiRuta) {
    const v = vistaMapa || { center: [ORIGEN.lon, ORIGEN.lat], zoom: 14.5 };
    mapaMiRuta = new maplibregl.Map({ container: "mapa-miruta", style: ENV.OPENFREEMAP_STYLE_URL, center: v.center, zoom: v.zoom, attributionControl: false });
    ZONA.dibujar(mapaMiRuta); UBI.dibujar(mapaMiRuta); dibujarCiclovias(mapaMiRuta);
    mapaMiRuta.jumpTo({ padding: paddingMapaCompartido() });
    mapaMiRuta.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapaMiRuta.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
    const punto = document.createElement("div");
    punto.style.cssText = "width:18px;height:18px;border-radius:50%;background:#000;border:3px solid #fff;box-shadow:0 0 0 2px #000";
    marcaMiRuta = new maplibregl.Marker({ element: punto }).setLngLat([ORIGEN.lon, ORIGEN.lat]).addTo(mapaMiRuta);
    recordarVista(mapaMiRuta, "ruta");
  } else {
    mapaMiRuta.resize(); marcaMiRuta.setLngLat([ORIGEN.lon, ORIGEN.lat]);
    aplicarVista(mapaMiRuta, "ruta", hojaPlanificar);                          // la vista que dejaste en Inicio o Explorar
  }
  pintarLugaresEn(mapaMiRuta); pintarEstacionesEn(mapaMiRuta); aplicarCapas();
}

/** Líneas de la ruta (a pie punteada, en bici continua) sobre el mapa compartido. `d` = datos de la ruta, o null para limpiarlas. */
function ponerLineasRuta(d) {
  const m = mapaMiRuta; if (!m) return;
  const linea = modo => ({ type: "FeatureCollection", features: d ? d.validos.filter(t => t.modo === modo).map(t =>
    ({ type: "Feature", geometry: { type: "LineString", coordinates: d.elegida(t).coords }, properties: {} })) : [] });
  const poner = () => {
    if (m.getSource("pie")) { m.getSource("pie").setData(linea("pie")); m.getSource("bici").setData(linea("bici")); return; }
    m.addSource("pie", { type: "geojson", data: linea("pie") });
    m.addLayer({ id: "pie", type: "line", source: "pie", layout: { "line-cap": "butt", "line-join": "round" }, paint: { "line-color": "#000", "line-width": 4, "line-dasharray": [1.2, 1.6] } });
    m.addSource("bici", { type: "geojson", data: linea("bici") });
    m.addLayer({ id: "bici", type: "line", source: "bici", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#000", "line-width": 7 } });
  };
  if (m.isStyleLoaded()) poner(); else m.once("style.load", poner);
}
function limpiarMarcasRuta() { marcasRuta.forEach(x => x.remove()); marcasRuta = []; }

/** Mientras se elige la estación: el mapa muestra las tres opciones y los hotspots sumados (numerados). */
function pintarMapaEstaciones(cerca) {
  prepararMapaMiRuta(); if (!mapaMiRuta) return;
  limpiarMarcasRuta(); ponerLineasRuta(null);
  cerca.forEach(est => {
    const el = document.createElement("div");
    if (!pintarPin(el, est.numero, "bicis", "E")) pintarEstimado(el, est, "bicis");
    el.classList.remove("estimado");
    marcasRuta.push(new maplibregl.Marker({ element: el }).setLngLat([est.lon, est.lat]).addTo(mapaMiRuta));
  });
  estado.destinos.map(porId).filter(Boolean).forEach((l, i) => {
    const pin = document.createElement("div"); pin.className = "pin"; pin.textContent = i + 1; pin.style.background = "#000";
    marcasRuta.push(new maplibregl.Marker({ element: pin }).setLngLat([l.lon, l.lat]).addTo(mapaMiRuta));
  });
}

/** Con la ruta armada: líneas, estaciones de retiro y devolución, y las paradas numeradas, sobre el mismo mapa. */
function pintarMapaMiRuta(d) {
  prepararMapaMiRuta(); if (!mapaMiRuta) return;
  limpiarMarcasRuta(); ponerLineasRuta(d);
  d.validos.filter(t => t.modo === "bici").forEach(t => [[t.retiro, t.desde, "bicis"], [t.devolucion, t.hasta, "anclajes"]].forEach(([est, p, clave]) => {   // estaciones: cuadrados
    const el = document.createElement("div");
    if (!pintarPin(el, est.numero, clave, "E")) pintarEstimado(el, est, clave);
    el.classList.remove("estimado");
    marcasRuta.push(new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(mapaMiRuta));
  }));
  plan.ids.map(porId).forEach((l, i) => {                                           // hotspots: círculos numerados
    const pin = document.createElement("div"); pin.className = "pin"; pin.textContent = i + 1; pin.style.background = "#000";
    marcasRuta.push(new maplibregl.Marker({ element: pin }).setLngLat([l.lon, l.lat]).addTo(mapaMiRuta));
  });
}

$("#miruta-iniciar").addEventListener("click", () => {
  if (!plan.tramos) return;
  plan.autoIniciar = true; location.hash = "recorrido";               // en la guía arranca solo, sin otro toque
});
$("#miruta-modificar").addEventListener("click", () => { editandoParadas = !editandoParadas; pintarEdicionParadas(); });
$("#miruta-sumar-mas").addEventListener("click", () => { location.hash = "explorar"; });
$("#itinerario").addEventListener("click", e => {
  const b = e.target.closest("[data-quitar]"); if (!b) return;
  const id = Number(b.dataset.quitar), l = porId(id);
  estado.destinos = estado.destinos.filter(x => x !== id); plan.tramos = null; guardarEstado(); pintarCaja();
  aviso(`${l.nombre} salió de tu ruta.`);
  if (!estado.destinos.length) editandoParadas = false;
  pintarMiRuta();
});

// ---------- Caja "Comenzar recorrido" (arriba de la barra de inicio) ----------
// Aparece en Inicio, Explorar y Perfil apenas hay un lugar sumado con "+": un toque y arranca el recorrido, sin pasar por Pedalear.
// Si hay un recorrido a medio hacer (se guarda en el celular), dice "Seguir tu recorrido".
const mismoConjunto = (a, b) => a.length === b.length && a.every(x => b.includes(x));
function modoCaja() {
  const c = estado.enCurso, seguir = c && mismoConjunto(estado.destinos, c.destinos);
  return estado.destinos.length && !seguir ? "nuevo" : c ? "seguir" : null;
}
function pintarCaja() {
  const caja = $("#caja-recorrido"), modo = modoCaja(), c = estado.enCurso;
  const ver = !!modo && ["inicio", "explorar", "perfil"].includes(pantallaActual);
  caja.hidden = false; caja.classList.toggle("visible", ver);
  $("#caja-texto").innerHTML = modo === "seguir" ? `Seguir tu recorrido <small>· paso ${c.paso + 1} de ${c.total}</small>` : "Comenzar recorrido";
}
$("#caja-recorrido").addEventListener("click", () => {
  const modo = modoCaja(), c = estado.enCurso;
  if (modo === "seguir") {                                       // retoma donde quedó, con el mismo trazado y sin volver a pedirlo a la IA
    if (c.origen) fijarOrigen(c.origen);                          // (fijarOrigen descarta el recorrido armado: se carga después)
    estado.destinos = [...c.destinos];
    Object.assign(plan, { modo: c.modo, hasta: c.hasta, ids: c.ids, estaciones: c.estaciones, textoBase: c.textoBase, tramos: c.tramos });
    guia.reanudar = c.paso; guia.tramos = null;
  } else if (modo === "nuevo") {
    plan.modo = "destino"; plan.tramos = null; location.hash = "planificar"; return;   // se ve la ruta y desde ahí se inicia
  } else return;
  location.hash = "recorrido";
});
/** Guarda el recorrido y el paso en que vas, así se retoma si se cierra el navegador o se pierde la señal. */
function guardarEnCurso(conTramos = false) {
  if (!plan.tramos || !guia.pasos.length) return;
  const previo = estado.enCurso;
  if (conTramos || !previo) {
    const tramos = plan.tramos.map(t => t.rutas?.length ? { ...t, rutas: [t.rutas[t.elegida || 0]], elegida: 0 } : t);   // solo el trazado elegido
    estado.enCurso = { fecha: Date.now(), paso: guia.i, total: guia.pasos.length, destinos: [...estado.destinos], ids: plan.ids, hasta: plan.hasta,
      modo: plan.modo, textoBase: plan.textoBase, estaciones: plan.estaciones, origen: { nombre: ORIGEN.nombre, lat: ORIGEN.lat, lon: ORIGEN.lon }, tramos };
  } else { previo.paso = guia.i; previo.fecha = Date.now(); }
  guardarEstado();
}
const vibrar = patron => { try { navigator.vibrate?.(patron); } catch { /* no todos los celulares vibran */ } };

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
  if (elegidos.length) return elegidos;                // la ruta es exactamente la que sumó la persona: no se agregan otros
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
async function armarRecorrido({ vista = "recorrido" } = {}) {
  if (plan.tramos) { if (vista === "miruta") return; $("#referencias").hidden = false; pintarRecorrido(); return; }   // volvió con la flecha: no se rearma (la guía sigue en el mismo paso)
  const sesion = ++armando, ahora = new Date();
  hojaRecorrido.poner(false);                      // recorrido nuevo: el panel arranca abierto
  $("#recorrido-resumen").textContent = "Armando tu recorrido…";
  $("#paso-texto").textContent = "Armando tu recorrido…"; $("#paso-meta").textContent = ""; $("#paso-icono").textContent = "…"; $("#iniciar").disabled = true;
  $("#propuesta-texto").textContent = ""; $("#paradas").innerHTML = ""; $("#referencias").hidden = true;
  const lista = candidatos(), elegidos = obligatorios().map(l => l.id);
  const cuantos = elegidos.length || lugaresPorTiempo(plan.minutos);
  if (!lista.length) { $("#recorrido-resumen").textContent = "No hay hotspots con esos filtros. Probá con más distancia."; return; }

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
${elegidos.length ? `LUGARES OBLIGATORIOS (la persona los eligió, tienen que estar todos en el recorrido): ${elegidos.join(", ")}. No sumes otros lugares.` : ""}
${plan.hasta ? `La persona quiere TERMINAR en "${plan.hasta.nombre}": ordená los lugares para que el último quede de camino hacia ahí.` : ""}
LUGARES (id · nombre · categoría · km desde la salida · horario):
${lista.map(l => `${l.id} · ${l.nombre} · ${l.categoria} · ${fmtKm(desdeOrigen(l))} · ${l.horario ? HOR.resumen(l.horario) : "sin dato"}`).join("\n")}
ESTACIONES PARA RETIRAR (número · nombre · distancia · bicis disponibles ${DISP.estado.enVivo ? "AHORA" : "(estimado)"}): ${retiros.map(e => `${lineaEstacion(e)} · ${dispTexto(e, "bicis")}`).join(" | ")}
ESTACIONES PARA DEVOLVER, por lugar (número · nombre · distancia al lugar · anclajes libres ${DISP.estado.enVivo ? "AHORA" : "(estimado)"}):
${lista.map(l => `lugar ${l.id}: ${devoluciones[l.id].map(e => `${lineaEstacion(e)} · ${dispTexto(e, "anclajes")}`).join(" | ") || "ninguna"}`).join("\n")}
CORREDORES MÁS USADOS en 2024 entre estas estaciones: ${corredores.map(c => `${nom(c.desde)} → ${nom(c.hasta)} (${c.viajes} viajes)`).join("; ") || "sin datos"}.
Reglas: elegí SOLO números de las listas, no inventes lugares ni estaciones; preferí estaciones con más bicis (o más anclajes libres para devolver) pero cercanas (caminar hasta la estación también cuenta) y los corredores usados; que el orden evite volver sobre tus pasos.
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
    texto = `Te proponemos ${ids.map(id => porId(id).nombre).join(", ")}${elegidos.length ? ", los hotspots que elegiste" : ", los más cercanos a tus intereses"}.`;
  }
  if (sesion !== armando) return;
  if (plan.retiroElegido) retiro = retiros.find(e => e.numero === plan.retiroElegido) || retiro;   // la estación que elegiste en Mi ruta
  ids = ids.filter(id => devol[id]);               // un lugar sin estación de devolución cerca no se puede hacer en bici
  if (!ids.length) { $("#recorrido-resumen").textContent = "Esos hotspots no tienen estación EcoBici cerca."; return; }

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
  if (vista !== "miruta") pintarRecorrido();           // desde Mi ruta solo se calcula: la pantalla de la guía se arma al iniciar
}

/** Alternativa que más conviene sin IA: menor tiempo, con un descuento por ir por ciclovía. */
function mejorPorReglas(rutas) {
  const puntaje = r => r.segundos * (1 - 0.4 * r.pctCiclovia / 100);
  return rutas.reduce((m, r, i) => puntaje(r) < puntaje(rutas[m]) ? i : m, 0);
}

/** Con datos en vivo, una estación sin bicis no sirve para retirar (sin datos en vivo no se puede saber: se asume que sí). */
const hayBicis = est => { const v = DISP.de(est.numero); return !v || v.bicis > 0; };

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
      : (estacionActual && metros(actual, estacionActual) <= 250 && hayBicis(estacionActual) ? estacionActual
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
    const salida = estacionActual && metros(actual, estacionActual) <= 250 && hayBicis(estacionActual) ? estacionActual
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
const pinesRecorrido = [];                 // círculos de estaciones del mapa del recorrido (se actualizan con los datos en vivo)
const GUIA = window.PedalitoGuia;
// Estado de la guía paso a paso. `pasos` sale de GUIA.construir; `i` es el paso que toca ahora.
const guia = { pasos: [], i: 0, activa: false, watch: null, tramos: null, ia: false, restante: null, sinGPS: false, hayFix: false,
  ultimoArrastre: 0 };
const hojaRecorrido = hacerDeslizable($("#hoja-recorrido"), () => ajustarMapa(mapa, hojaRecorrido));

function pintarRecorrido() {
  const tramos = plan.tramos.filter(t => t.modo !== "llegada");   // "llegada" = un lugar a menos de 40 m: no tiene trazado
  const validos = tramos.filter(t => t.rutas?.length), fallidos = tramos.length - validos.length;
  const elegida = t => t.rutas[t.elegida];
  const sum = modo => validos.filter(t => t.modo === modo).reduce((s, t) => s + elegida(t).metros, 0);
  const seg = validos.reduce((s, t) => s + elegida(t).segundos, 0);
  plan.mBici = sum("bici"); plan.mPie = sum("pie"); plan.km = plan.mBici / 1000; plan.minutosTotal = minutosDe(seg);

  $("#recorrido-resumen").textContent = `${fmtM(plan.mBici)} en bici · ${fmtM(plan.mPie)} a pie · ${plan.minutosTotal} min`;
  $("#referencias").hidden = false;
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
      <span data-disp="retiro" data-i="${i}">Retiro: ${esc(t.retiro.nombre)} · ${esc(dispTexto(t.retiro, "bicis"))}</span>
      <span data-disp="devolucion" data-i="${i}">Devolución: ${esc(t.devolucion.nombre)} · ${esc(dispTexto(t.devolucion, "anclajes"))}</span></div>`;
  });
  $("#paradas").innerHTML = resumen.join("") || `<div class="tarjeta-apilada noche"><strong>Todo a pie</strong><span>Los hotspots quedan a menos de ${CAMINATA_MAX_M} m.</span></div>`;

  if (guia.tramos !== plan.tramos) prepararGuia();   // recorrido nuevo: se arma la guía (y la IA redacta las instrucciones)
  pintarPaso();
  $("#iniciar").disabled = false;
  pintarMapaRecorrido(validos, elegida);
  if (plan.autoIniciar) { plan.autoIniciar = false; if (!guia.activa) iniciarGuia(); }   // venía de «Iniciar pedaleo con GPS»
}

function pintarMapaRecorrido(validos, elegida) {
  if (!window.maplibregl) return;
  if (mapa) mapa.remove();
  marcaYo = null; pinesRecorrido.length = 0;
  const coords = validos.flatMap(t => elegida(t).coords);
  const extra = [ORIGEN, ...plan.ids.map(porId)];                       // por si todo el recorrido es a pie y sin trazado
  const puntos = [...coords.map(c => ({ lon: c[0], lat: c[1] })), ...extra];
  const lons = puntos.map(p => p.lon), lats = puntos.map(p => p.lat);
  mapa = new maplibregl.Map({ container: "mapa", style: ENV.OPENFREEMAP_STYLE_URL, attributionControl: false,
    bounds: [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    fitBoundsOptions: { padding: { top: 80, left: 30, right: 30, bottom: Math.round(hojaRecorrido.visiblePx()) + 30 }, maxZoom: 17 } });
  ZONA.dibujar(mapa);
  mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  mapa.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
  mapa.on("dragstart", () => { guia.ultimoArrastre = Date.now(); });   // si movés el mapa, la guía no te lo pelea por unos segundos
  const linea = modo => ({ type: "FeatureCollection", features: validos.filter(t => t.modo === modo).map(t =>
    ({ type: "Feature", geometry: { type: "LineString", coordinates: elegida(t).coords }, properties: {} })) });
  mapa.once("style.load", () => {              // no hace falta esperar a los tiles para dibujar las líneas
    dibujarCiclovias(mapa);
    mapa.addSource("pie", { type: "geojson", data: linea("pie") });
    mapa.addLayer({ id: "pie", type: "line", source: "pie", layout: { "line-cap": "butt", "line-join": "round" },
      paint: { "line-color": "#000", "line-width": 4, "line-dasharray": [1.2, 1.6] } });      // caminata: punteada
    mapa.addSource("bici", { type: "geojson", data: linea("bici") });
    mapa.addLayer({ id: "bici", type: "line", source: "bici", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#000", "line-width": 6 } });                                      // bici: línea continua
  });
  const marca = (p, texto, fondo) => {
    const pin = document.createElement("div");
    pin.className = "pin"; pin.textContent = texto; pin.style.background = fondo;
    new maplibregl.Marker({ element: pin }).setLngLat([p.lon, p.lat]).setPopup(new maplibregl.Popup({ offset: 14 }).setText(p.nombre)).addTo(mapa);
  };
  const origenPin = document.createElement("div");
  origenPin.className = "pin"; origenPin.style.cssText += ";width:16px;height:16px;background:#000";
  new maplibregl.Marker({ element: origenPin }).setLngLat([ORIGEN.lon, ORIGEN.lat]).addTo(mapa);
  // Etapa 1 (retirar): círculo con las bicis disponibles ahora. Etapa 2 (dejar la bici): círculo con los anclajes libres ahora.
  const pinEstacion = (est, p, clave, rol) => {
    const el = document.createElement("button"); el.type = "button";
    if (!pintarPin(el, est.numero, clave, "E")) pintarEstimado(el, est, clave);   // sin datos en vivo: letra E con el color de la estimación
    el.classList.remove("estimado"); pinesRecorrido.push({ el, est, clave });
    new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat])
      .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(`<strong>${rol}: ${esc(est.nombre)}</strong><br>${esc(dispTexto(est, clave))}`)).addTo(mapa);
  };
  // Resto de las estaciones EcoBici (más chicas, debajo de las del recorrido): su estado de ahora, para elegir otra si hace falta
  const delRecorrido = new Set(validos.filter(t => t.modo === "bici").flatMap(t => [t.retiro.numero, t.devolucion.numero]));
  ESTACIONES.filter(e => !delRecorrido.has(e.numero)).forEach(e => {
    const el = document.createElement("button"); el.type = "button";
    pintarPin(el, e.numero, "bicis"); el.classList.add("fondo"); pinesRecorrido.push({ el, est: e, clave: "bicis", fondo: true });
    new maplibregl.Marker({ element: el }).setLngLat([e.lon, e.lat]).setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(popupEstacion(e))).addTo(mapa);
  });
  validos.filter(t => t.modo === "bici").forEach(t => { pinEstacion(t.retiro, t.desde, "bicis", "Retirar la bici"); pinEstacion(t.devolucion, t.hasta, "anclajes", "Dejar la bici"); });
  plan.ids.map(porId).forEach((l, i) => marca(l, i + 1, "#000"));
  if (plan.hasta) marca({ lat: plan.hasta.lat, lon: plan.hasta.lon, nombre: `Final: ${plan.hasta.nombre}` }, "★", "#000");
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
  guia.tramos = plan.tramos; guia.pasos = GUIA.construir(plan.tramos); const sigue = guia.reanudar != null || guia.recalculando; guia.i = Math.min(guia.reanudar ?? 0, guia.pasos.length - 1); guia.reanudar = null; guia.recalculando = false;
  guia.yaRegistrado = sigue; guia.puntosRuta = null; guia.fuera = 0; guia.mostrado = -1; guia.ia = false; guia.restante = null; guia.hayFix = false;
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
  return guia.hayFix ? "Saltear paso" : "Siguiente paso";   // con GPS la guía avanza sola; el botón queda por si falla
}

function pintarPaso() {
  const p = guia.pasos[guia.i]; if (!p) return;
  const llegada = p.tipo === "lugar" || p.tipo === "final";
  // Etapa 1 (retirar la bici): el círculo muestra cuántas bicis hay ahora. Etapa 2 (dejarla): cuántos anclajes libres hay.
  const esEstacion = p.tipo === "retiro" || p.tipo === "devolucion", clave = p.tipo === "retiro" ? "bicis" : "anclajes";
  const v = esEstacion && p.est ? DISP.de(p.est.numero) : null, icono = $("#paso-icono");
  icono.classList.toggle("llegada", llegada);
  if (v) {
    const n = clave === "bicis" ? v.bicis : v.anclajes, nv = DISP.nivelDe(n, v.capacidad);
    icono.textContent = n; icono.style.background = nv.color; icono.classList.add("cantidad"); icono.classList.toggle("claro", nv.claro);
  } else {
    icono.textContent = GUIA.icono(p); icono.style.background = ""; icono.classList.remove("cantidad", "claro");
  }
  if (guia.mostrado !== guia.i) {                              // cambió el paso: el texto entra deslizando
    guia.mostrado = guia.i;
    [icono, $("#paso-actual .paso-cuerpo")].forEach(el => { el.classList.remove("nuevo"); void el.offsetWidth; el.classList.add("nuevo"); });
  }
  $("#paso-etiqueta").textContent = guia.activa ? `Paso ${guia.i + 1} de ${guia.pasos.length}` : "Siguiente paso";
  $("#paso-texto").textContent = p.texto;
  const distancia = guia.activa && guia.restante != null ? `faltan ${fmtM(guia.restante)}` : (p.metros ? fmtM(p.metros) : "");
  $("#paso-meta").textContent = [p.modo === "bici" ? "En bici" : "A pie", distancia, esEstacion && p.est ? dispTexto(p.est, clave) : "",
    guia.ia ? "Guía por IA" : "Guía automática", guia.activa && guia.sinGPS ? "Sin GPS: avanzá con el botón" : ""].filter(Boolean).join(" · ");
  $("#iniciar").firstChild.textContent = etiquetaBoton();
}
/** Lleva el anillo (y, si ya arrancó la guía sin GPS, la cámara) al punto del paso actual. */
function centrarPaso(mover = true) {
  const p = guia.pasos[guia.i];
  if (!mapa || !p || !marcaPaso) return;
  marcaPaso.setLngLat(p.punto);
  if (mover && guia.activa && !guia.hayFix) mapa.easeTo({ center: p.punto, zoom: 16.8, duration: 700 });
}
function celebrarLlegada(p) {
  if (p.celebrado) return;
  p.celebrado = true;
  vibrar([200, 80, 200]);
  GUIA.celebrar(`¡Llegaste a ${p.tipo === "devolucion" ? `la ${p.nombre}` : p.nombre}!`);
}

/** Pasa al paso siguiente. `manual`: se tocó el botón (se da por hecho que llegaste, así que si es una llegada se festeja). */
function avanzar(manual) {
  if (guia.i >= guia.pasos.length - 1) return;
  guia.i++; guia.restante = null;
  const p = guia.pasos[guia.i];
  pintarPaso(); centrarPaso(); guardarEnCurso();
  if (!manual) vibrar(120);                                   // aviso al tacto: pasó al paso siguiente
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
      punto.style.cssText = "width:18px;height:18px;border-radius:50%;background:#000;border:3px solid #F4EFE6;box-shadow:0 0 0 2px #000";
      marcaYo = new maplibregl.Marker({ element: punto }).setLngLat([yo.lon, yo.lat]).addTo(mapa);
    }
    marcaYo?.setLngLat([yo.lon, yo.lat]);
    if (mapa && Date.now() - guia.ultimoArrastre > 8000) mapa.easeTo({ center: [yo.lon, yo.lat], zoom: Math.max(mapa.getZoom(), 16.5), duration: 900 });
    let p = guia.pasos[guia.i]; if (!p) return;
    const aqui = [yo.lon, yo.lat], umbralDe = s => (s.modo === "bici" ? 30 : 20) + Math.min(precision, 30) / 2;
    const esGiro = s => s && (s.tipo === "maniobra" || s.tipo === "sinruta");
    const esParada = s => s.tipo === "retiro" || s.tipo === "devolucion" || s.tipo === "lugar";
    // Como en Google Maps: si ya estás en un giro más adelante (te salteaste uno o el GPS tardó), la guía salta hasta ahí
    if (esGiro(p)) for (let k = 3; k >= 1; k--) {
      const s = guia.pasos[guia.i + k];
      if (esGiro(s) && guia.pasos.slice(guia.i, guia.i + k).every(esGiro) && GUIA.aMetros(aqui, s.punto) <= umbralDe(s)) { guia.i += k; p = s; break; }
    }
    guia.restante = Math.round(GUIA.aMetros(aqui, p.punto)); guia.ultimaPos = yo;
    // ¿Te saliste de la ruta? Hacen falta 3 avisos seguidos de GPS (y buena precisión) para no alarmar por un salto del GPS
    if (precision <= 50) {
      guia.fuera = distanciaARuta(aqui) > 70 + precision ? guia.fuera + 1 : 0;
      if (guia.fuera === 3) vibrar([150, 80, 150]);
      $("#desvio").hidden = guia.fuera < 3;
    }
    if (guia.restante <= umbralDe(p)) {
      if (esGiro(p)) { avanzar(false); return; }                  // giro cumplido: pasa solo al siguiente
      if (esParada(p)) { p.llegado = true; if (p.celebra) celebrarLlegada(p); }    // llegaste a una estación o a un lugar
    } else if (p.llegado && esParada(p) && guia.restante > 45 && guia.i < guia.pasos.length - 1) {
      avanzar(false); return;                                      // ya estuviste ahí y te alejaste (retiraste, dejaste la bici o seguiste): sigue solo
    }
    pintarPaso();
  }, () => { guia.sinGPS = true; pintarPaso(); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}

/** Detiene el GPS (al salir de la pantalla o al terminar). La guía queda en el paso donde estaba. */
function pausarGuia() {
  if (guia.watch !== null) { navigator.geolocation.clearWatch(guia.watch); guia.watch = null; }
  guia.activa = false; guia.fuera = 0; $("#desvio").hidden = true;
  soltarPantalla();
}

// La pantalla no se apaga mientras la guía está activa (si se apaga, el GPS deja de avisar)
let bloqueoPantalla = null;
async function mantenerPantalla() {
  try {
    if (!guia.activa || !("wakeLock" in navigator) || bloqueoPantalla) return;
    bloqueoPantalla = await navigator.wakeLock.request("screen");
    bloqueoPantalla.addEventListener("release", () => { bloqueoPantalla = null; });
  } catch { bloqueoPantalla = null; /* el navegador no lo permite: la pantalla se apaga como siempre */ }
}
function soltarPantalla() { try { bloqueoPantalla?.release(); } catch { /* nada */ } bloqueoPantalla = null; }
document.addEventListener("visibilitychange", () => { if (!document.hidden) mantenerPantalla(); });

function iniciarGuia() {
  if (guia.i === 0) {                                      // al arrancar se guarda el resumen para el cierre
    estado.ultimo = { km: plan.km, mPie: plan.mPie, ids: [...plan.ids], estaciones: plan.estaciones, minutos: plan.minutosTotal, hasta: plan.hasta?.nombre || null };
  }
  if (!guia.yaRegistrado) { TEND.registrarInicio(plan.ids); guia.yaRegistrado = true; }   // cuenta como visita a esos lugares, una sola vez por salida
  guardarEnCurso(true);                                    // también guarda el recorrido para poder retomarlo
  guia.activa = true; guia.sinGPS = false;
  hojaRecorrido.poner(true);                               // el panel baja y queda solo el siguiente paso
  seguirGPS(); mantenerPantalla();
  pintarPaso(); centrarPaso();
}

// Si te alejás de la ruta (varios avisos de GPS seguidos), aparece "Te desviaste" con un botón para recalcular desde donde estás
$("#recalcular").addEventListener("click", () => {
  if (!guia.ultimaPos) return;
  const hechos = plan.ids.slice(0, guia.pasos.slice(0, guia.i).filter(p => p.tipo === "lugar").length);   // lugares por los que ya pasaste
  const faltan = estado.destinos.filter(id => !hechos.includes(id));
  if (plan.modo === "destino" && !faltan.length) { aviso("Ya pasaste por todos tus hotspots: terminá el recorrido."); return; }
  estado.destinos = faltan; guardarEstado();
  fijarOrigen({ nombre: "Tu ubicación actual", ...guia.ultimaPos });
  pausarGuia(); guia.recalculando = true; plan.tramos = null;
  armarRecorrido();
});
function distanciaARuta(aqui) {
  if (!guia.puntosRuta) guia.puntosRuta = plan.tramos.filter(t => t.rutas?.length).flatMap(t => t.rutas[t.elegida || 0].coords);
  let min = Infinity;
  for (const c of guia.puntosRuta) { const d = GUIA.aMetros(aqui, c); if (d < min) min = d; }
  return min;
}

$("#iniciar").addEventListener("click", () => {
  if (!plan.tramos || !guia.pasos.length) return;
  if (!guia.activa) { iniciarGuia(); return; }
  if (guia.i >= guia.pasos.length - 1) { pausarGuia(); estado.enCurso = null; guardarEstado(); location.hash = "cierre"; return; }   // fin: va directo a calificar
  avanzar(true);
});

// ---------- 08 · Cierre ----------
function pintarCierre() {
  const u = estado.ultimo; if (!u) { location.hash = "planificar"; return; }
  $("#cierre-km").textContent = fmtKm(u.km);
  $("#cierre-lugares").textContent = `${u.ids.length} hotspot${u.ids.length > 1 ? "s" : ""} visitado${u.ids.length > 1 ? "s" : ""}`;
  // Pirueta: cada lugar nuevo se estampa en el pasaporte (solo la primera vez que se muestra este cierre)
  const nuevos = u.ids.filter(id => !estado.visitados.includes(id)).map(porId).filter(Boolean), caja = $("#sellos-nuevos");
  $("#sellos-titulo").hidden = caja.hidden = !nuevos.length;
  if (nuevos.length && !caja.dataset.listo) {
    caja.dataset.listo = "1";
    caja.innerHTML = nuevos.map((l, i) => `<div style="--d:${(0.35 + i * 0.5).toFixed(2)}s;--tinta:${TINTAS[i % TINTAS.length]}">${selloHTML(l, true, "estampa")}</div>`).join("");
    vibrar([30, 80, 30]);
  }
  // Dos preguntas por hotspot: qué te pareció el lugar y qué te pareció la experiencia (1 a 5 estrellas cada una)
  const estrellas = (l, tema, n, etiqueta) => `<div class="pregunta"><span>${etiqueta}</span><span class="estrellas" role="group" aria-label="${etiqueta}: ${esc(l.nombre)}">
      ${[1, 2, 3, 4, 5].map(i => `<button data-lugar="${l.id}" data-tema="${tema}" data-n="${i}" aria-label="${i} de 5">${i <= n ? "★" : "☆"}</button>`).join("")}</span></div>`;
  $("#calificar").innerHTML = u.ids.map(porId).map(l => {
    const c = calificacionDe(l.id);
    return `<div class="calificacion"><strong>${esc(l.nombre)}</strong>
      ${estrellas(l, "lugar", c.lugar, "¿Qué te pareció el lugar?")}${estrellas(l, "experiencia", c.experiencia, "¿Qué te pareció la experiencia?")}</div>`;
  }).join("");
}
/** Calificación de un hotspot: { lugar, experiencia }. Las guardadas antes con un solo número cuentan como "lugar". */
function calificacionDe(id) {
  const c = estado.calificaciones[id];
  return typeof c === "number" ? { lugar: c, experiencia: 0 } : { lugar: c?.lugar || 0, experiencia: c?.experiencia || 0 };
}
$("#calificar").addEventListener("click", e => {
  const b = e.target.closest("button[data-n]"); if (!b) return;
  estado.calificaciones[b.dataset.lugar] = { ...calificacionDe(b.dataset.lugar), [b.dataset.tema]: Number(b.dataset.n) };
  guardarEstado(); pintarCierre();
});
$("#guardar-volver").addEventListener("click", () => {
  const u = estado.ultimo; if (!u) return;
  estado.km += u.km; estado.salidas += 1;
  estado.historial.push({ fecha: new Date().toISOString(), km: u.km });
  u.ids.forEach(id => { if (!estado.visitados.includes(id)) estado.visitados.push(id); });
  estado.sellos = estado.sellos || {};
  u.ids.forEach(id => { if (!estado.sellos[id]) estado.sellos[id] = new Date().toISOString(); });
  $("#sellos-nuevos").dataset.listo = "";                 // el próximo cierre vuelve a estampar
  estado.destinos = []; plan.hasta = null; plan.modo = "destino";
  guardarEstado();
  location.hash = "compartir";                  // el cierre del viaje sigue en Compartir
});

// ---------- 09 · Perfil ----------
function kmDesde(dias) {
  const desde = Date.now() - dias * 86400000;
  return estado.historial.filter(h => new Date(h.fecha).getTime() >= desde).reduce((s, h) => s + h.km, 0);
}
function pintarPerfil() {
  $("#km-total").textContent = fmtKm(estado.km);
  $("#actividad-resumen").innerHTML = [
    ["naranja", fmtKm(kmDesde(7)), "Esta semana"],
    ["verde", fmtKm(kmDesde(30)), "Últimos 30 días"],
    ["celeste", `${estado.salidas} salidas`, "Desde que empezaste"]
  ].map(([c, t, d]) => `<div class="tarjeta-apilada ${c}"><strong>${t}</strong><span>${d}</span></div>`).join("");
  $("#perfil-sellos").textContent = `${estado.visitados.length} ${estado.visitados.length === 1 ? "sello" : "sellos"} · ${LUGARES.filter(l => l.verificado && estado.visitados.includes(l.id)).length} de ${LUGARES.filter(l => l.verificado).length} hotspots`;
  const favoritos = estado.guardados.map(porId).filter(Boolean);
  $("#preferidos").innerHTML = favoritos.map(l => tarjetaLugarHTML({ lugar: l, etiqueta: "♥ PREFERIDO", titulo: l.nombre, textoSinImagen: l.categoria,
    metas: [`${l.categoria} · ${l.barrio}`] })).join("");
  $("#preferidos").hidden = !favoritos.length; $("#preferidos-vacio").hidden = favoritos.length > 0;
  $("#mis-intereses").innerHTML = estado.intereses.map(i => `<span class="chip activo">${esc(i)}</span>`).join("");
}

// ---------- 10 · Compartir ----------
function pintarCompartir() {
  const u = estado.ultimo;
  $("#compartir-km").textContent = u ? fmtKm(u.km).toUpperCase() : fmtKm(estado.km).toUpperCase();
  $("#compartir-ruta").textContent = u ? `por Buenos Aires · ${ORIGEN.nombre} → ${u.ids.map(id => porId(id).nombre).join(" → ")}` : "por Buenos Aires";
}
// Cada opción comparte directamente; el botón de abajo cierra el recorrido y vuelve al inicio.
const textoCompartir = () => `${$("#compartir-km").textContent} por Buenos Aires con Pedalito. ${$("#compartir-ruta").textContent}`;
$$("#compartir [data-red]").forEach(b => b.addEventListener("click", async () => {
  const texto = textoCompartir(), red = b.dataset.red;
  if (red === "whatsapp") { window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener"); return; }
  try {                                              // Instagram Stories no se puede abrir con un link: se usa el menú de compartir del celular
    if (navigator.share) await navigator.share({ title: "Pedalito", text: texto });
    else { await navigator.clipboard.writeText(texto); aviso("Texto copiado: pegalo en tu historia de Instagram."); }
  } catch (e) { if (e?.name !== "AbortError") aviso("No pudimos compartir desde acá. Probá desde el celular."); }   // AbortError = la persona canceló
}));
$("#compartir-ya").addEventListener("click", () => {
  hojaInicio.poner(false);                                    // Inicio vuelve con el panel blanco a la mitad de la pantalla
  finalizado = true; navegaciones = 0; volviendo = true;      // cierra la etapa: ni la flecha ni el historial interno llevan de vuelta a Compartir
  location.hash = "inicio";
});

// ---------- Bicis y anclajes en vivo ----------
// Cada vez que llegan datos nuevos (cada minuto) se actualizan los círculos del Home, los del mapa del recorrido,
// las tarjetas de retiro y devolución y el paso de la guía que se está mostrando.
function refrescarDisponibilidad() {
  pintarEstacionesHome();
  pinesRecorrido.forEach(({ el, est, clave, fondo }) => {
    if (!pintarPin(el, est.numero, clave, fondo ? "" : "E")) {
      pintarEstimado(el, est, clave);
    }
    el.classList.remove("estimado"); el.classList.toggle("fondo", !!fondo);
  });
  if (plan.tramos) {
    const tramos = plan.tramos.filter(t => t.modo !== "llegada");
    $$("#paradas [data-disp]").forEach(s => {
      const t = tramos[Number(s.dataset.i)]; if (!t) return;
      s.textContent = s.dataset.disp === "retiro" ? `Retiro: ${t.retiro.nombre} · ${dispTexto(t.retiro, "bicis")}`
        : `Devolución: ${t.devolucion.nombre} · ${dispTexto(t.devolucion, "anclajes")}`;
    });
    if (pantallaActual === "recorrido") pintarPaso();
  }
}
DISP.alCambiar(refrescarDisponibilidad);
DISP.iniciar();

// Cada vez que se abre la página se empieza de cero: arranca en "Bienvenido" y se despinean los lugares, el recorrido y los intereses de la vez anterior
estado.destinos = []; estado.enCurso = null; estado.intereses = []; guardarEstado();
history.replaceState(null, "", "#bienvenida");
mostrar();
