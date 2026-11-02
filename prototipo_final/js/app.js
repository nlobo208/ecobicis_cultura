// Pedalito · prototipo final (Figma: UX_pedalito2)
// Datos: ../app/data/lugares.js (3.390 lugares y 110 estaciones), datos/insight_estaciones.js, datos/actividades.js
// Claves y URLs: env.js (generado desde .env con generar_env.ps1)

const ENV = Object.assign({
  OPENWEATHER_API_KEY: "", OPENWEATHER_URL: "https://api.openweathermap.org/data/2.5/weather",
  OPENFREEMAP_STYLE_URL: "https://tiles.openfreemap.org/styles/positron",
  ORIGEN_LAT: "-34.5886", ORIGEN_LON: "-58.3895", IA_ENDPOINT: "/.netlify/functions/chat"
}, window.PEDALITO_ENV || {});

const LUGARES = window.PEDALITO_LUGARES;
const ACTIVIDADES = window.PEDALITO_ACTIVIDADES || [];
const ORIGEN = { nombre: "Plaza Vicente López", lat: Number(ENV.ORIGEN_LAT), lon: Number(ENV.ORIGEN_LON) };
const PRED = window.PedalitoPrediccion, TEND = window.PedalitoTendencias;

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
  email: "", nombre: "", intereses: [], km: 0, salidas: 0, visitados: [], destinoId: null,
  calificaciones: {}, guardados: [], historial: [], ultimo: null
}, leerEstado());
const plan = { modo: "sorpresa", minutos: 60, maxKm: 5, ids: [], km: 0, estaciones: null };

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
const fotoUrl = l => l.img ? `../app/img/${l.img}` : "";

// ---------- Navegación (#inicio, #lugar/123, …) ----------
const TABS = ["inicio", "explorar", "planificar", "perfil"];
const PUBLICAS = ["bienvenida", "cuenta"];

function mostrar() {
  let [pantalla, param] = location.hash.slice(1).split("/");
  if (!pantalla || !document.getElementById(pantalla)) pantalla = estado.email ? "inicio" : "bienvenida";
  if (!estado.email && !PUBLICAS.includes(pantalla)) pantalla = "bienvenida";
  if (estado.email && estado.intereses.length < 3 && pantalla !== "intereses" && !PUBLICAS.includes(pantalla)) pantalla = "intereses";

  $$(".pantalla").forEach(s => s.classList.toggle("visible", s.id === pantalla));
  const conNav = TABS.includes(pantalla);
  $("#nav").classList.toggle("visible", conNav);
  document.querySelector(".app").classList.toggle("con-nav", conNav);
  $$("#nav a").forEach(a => a.classList.toggle("activo", a.dataset.tab === pantalla));
  window.scrollTo(0, 0);

  ({ intereses: pintarIntereses, inicio: pintarInicio, explorar: pintarExplorar, lugar: () => pintarLugar(param),
     planificar: pintarPlanificar, recorrido: armarRecorrido, llegada: pintarLlegada, cierre: pintarCierre,
     perfil: pintarPerfil, compartir: pintarCompartir }[pantalla] || (() => {}))();
}
window.addEventListener("hashchange", mostrar);

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
$("#guardar-intereses").addEventListener("click", () => { guardarEstado(); sessionStorage.removeItem("pedalito_paravos"); location.hash = "inicio"; });

// ---------- 03 · Home ----------
let mapaHome;
function pintarInicio() {
  const h = new Date().getHours();
  const saludo = h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
  $("#saludo").textContent = `¡${saludo}${estado.nombre ? " " + estado.nombre : ""}!`;
  pintarMapaHome(); pintarFechas(); pintarTendencias(); pintarParaVos();
}

function pintarMapaHome() {
  if (mapaHome || !window.maplibregl) return;
  mapaHome = new maplibregl.Map({ container: "mapa-home", style: ENV.OPENFREEMAP_STYLE_URL, center: [ORIGEN.lon, ORIGEN.lat],
    zoom: 14.5, interactive: false, attributionControl: false });
  const punto = document.createElement("div");
  punto.style.cssText = "width:18px;height:18px;border-radius:50%;background:#203ae9;border:3px solid #fff;box-shadow:0 0 0 10px rgba(32,58,233,.25)";
  new maplibregl.Marker({ element: punto }).setLngLat([ORIGEN.lon, ORIGEN.lat]).addTo(mapaHome);
}

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
  $("#fechas").innerHTML = lista.map((a, i) => {
    const lugar = porId(a.lugar_id);
    const etiqueta = a.hasta ? `HASTA ${a.hasta.slice(8, 10)}/${a.hasta.slice(5, 7)}` : a.tipo.toUpperCase();
    const color = ["", "azul", "naranja"][i % 3];
    const dato = a.abre ? `${a.lugar} · ${a.dias || ""} ${a.abre}–${a.cierra}` : a.lugar;
    const contenido = `
      <div class="foto ${lugar?.img ? "" : "sin-imagen"}" ${lugar?.img ? `style="background-image:url('${fotoUrl(lugar)}')"` : ""}>
        <span class="tag ${color}">${esc(etiqueta)}</span>${lugar?.img ? "" : esc(a.tipo)}
      </div>
      <div class="info"><strong>${esc(a.nombre)}</strong><span class="meta">${esc(dato)}</span></div>`;
    return lugar ? `<a class="tarjeta-lugar" href="#lugar/${lugar.id}">${contenido}</a>` : `<div class="tarjeta-lugar">${contenido}</div>`;
  }).join("") || `<p class="nota">No hay fechas cargadas.</p>`;
}

// "Para vos": la IA ordena los lugares que coinciden con tus intereses; sin IA se ordenan por cercanía
async function pintarParaVos() {
  const cont = $("#para-vos"), origen = $("#para-vos-origen");
  const candidatos = LUGARES.filter(l => estado.intereses.includes(l.categoria) && desdeOrigen(l) <= 5)
    .sort((a, b) => desdeOrigen(a) - desdeOrigen(b)).slice(0, 10);
  const dibujar = (lista, nota) => {
    cont.innerHTML = lista.map(l => `
      <a class="tarjeta-lugar" href="#lugar/${l.id}">
        <div class="foto ${l.img ? "" : "sin-imagen"}" ${l.img ? `style="background-image:url('${fotoUrl(l)}')"` : ""}>
          <span class="tag">CERCA TUYO</span>${l.img ? "" : esc(l.categoria)}
        </div>
        <div class="info"><strong>${esc(l.nombre)}</strong><span class="meta">${fmtKm(desdeOrigen(l))} · ${esc(l.barrio)}</span></div>
      </a>`).join("") || `<p class="nota">No hay lugares de tus intereses a menos de 5 km.</p>`;
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

// "Tendencias": lugares con más recorridos iniciados (js/tendencias.js)
function pintarTendencias() {
  const top = TEND.masElegidos(5).filter(t => porId(t.id));
  $("#tendencias").innerHTML = top.length ? top.map((t, i) => {
    const l = porId(t.id);
    return `<li><a href="#lugar/${l.id}"><span class="puesto">${i + 1}</span><span><strong>${esc(l.nombre)}</strong><br><span class="nota">${esc(l.categoria)} · ${esc(l.barrio)}</span></span><span class="cuantos">${t.recorridos} recorrido${t.recorridos > 1 ? "s" : ""}</span></a></li>`;
  }).join("") : `<li class="vacio">Todavía no hay recorridos iniciados. Cuando empieces uno, el lugar aparece acá.</li>`;
}

// ---------- 04 · Explorar ----------
let filtro = "cerca";
function pintarExplorar() {
  const q = $("#buscador").value.trim().toLowerCase();
  let lista = LUGARES.filter(l => !q || (l.nombre + " " + l.categoria + " " + l.barrio).toLowerCase().includes(q));
  if (filtro === "intereses") lista = lista.filter(l => estado.intereses.includes(l.categoria));
  if (filtro === "verificado") lista = lista.filter(l => l.verificado);
  if (filtro === "cerca") lista = lista.filter(l => desdeOrigen(l) <= 5);
  lista.sort((a, b) => desdeOrigen(a) - desdeOrigen(b));
  $("#cantidad").textContent = `${lista.length} lugares${lista.length > MAX_LISTA ? ` · mostrando ${MAX_LISTA}` : ""}`;
  $("#lista-lugares").innerHTML = lista.slice(0, MAX_LISTA).map((l, i) => `
    <a class="tarjeta-apilada ${COLORES[i % COLORES.length]}" href="#lugar/${l.id}">
      <strong>${esc(l.nombre)}</strong>
      <span>${esc(l.categoria)} · ${fmtKm(desdeOrigen(l))} · ${esc(l.barrio)}</span>
      <span class="ver">Ver lugar →</span>
    </a>`).join("");
}
$("#buscador").addEventListener("input", pintarExplorar);
$("#filtros").addEventListener("click", e => {
  if (!e.target.dataset.filtro) return;
  filtro = e.target.dataset.filtro;
  $$("#filtros .chip").forEach(c => c.classList.toggle("activo", c === e.target));
  pintarExplorar();
});

// ---------- 11 · Detalle lugar ----------
function pintarLugar(id) {
  const l = porId(id);
  if (!l) { location.hash = "explorar"; return; }
  const hero = $("#detalle-hero");
  hero.style.backgroundImage = l.img ? `url("${fotoUrl(l)}")` : "";
  $("#detalle-categoria").textContent = l.categoria;
  $("#detalle-nombre").textContent = l.nombre;
  $("#detalle-meta").textContent = `${fmtKm(desdeOrigen(l))} · ${l.barrio}`;
  $("#detalle-desc").textContent = `${l.direccion}. Estación EcoBici más cercana a ${l.dist_m} m.`;
  $("#detalle-horario").textContent = l.horario || "Horario sin dato";
  const guardado = estado.guardados.includes(l.id);
  $("#guardar-lugar").textContent = guardado ? "♥" : "♡";
  $("#guardar-lugar").onclick = () => {
    const i = estado.guardados.indexOf(l.id);
    if (i >= 0) estado.guardados.splice(i, 1); else estado.guardados.push(l.id);
    guardarEstado(); pintarLugar(id);
  };
  $("#detalle-sumar").onclick = () => { estado.destinoId = l.id; guardarEstado(); plan.modo = "destino"; location.hash = "planificar"; };
}

// ---------- 05 · Planificar ----------
function pintarPlanificar() {
  const d = porId(estado.destinoId);
  $("#destino-elegido").textContent = d ? `⌖ ${d.nombre}` : "⌖ Buscar museo, café, teatro…";
  $$("[data-modo]").forEach(m => m.classList.toggle("activo", m.dataset.modo === plan.modo));
}
$$("[data-modo]").forEach(m => m.addEventListener("click", () => {
  if (m.dataset.modo === "destino" && !estado.destinoId) { location.hash = "explorar"; return; }
  plan.modo = m.dataset.modo; pintarPlanificar();
}));
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
$("#buscar-recorrido").addEventListener("click", () => { location.hash = "recorrido"; });

// ---------- 06 · Recorrido ----------
function candidatos() {
  const cerca = LUGARES.filter(l => desdeOrigen(l) <= plan.maxKm);
  const destino = porId(estado.destinoId);
  if (plan.modo === "destino" && destino) return [destino, ...cerca.filter(l => l.id !== destino.id && estado.intereses.includes(l.categoria))];
  const propios = cerca.filter(l => estado.intereses.includes(l.categoria));
  return (propios.length ? propios : cerca).sort((a, b) => desdeOrigen(a) - desdeOrigen(b)).slice(0, 8);
}

async function armarRecorrido() {
  const lista = candidatos(), cuantos = LUGARES_POR_TIEMPO[plan.minutos];
  $("#recorrido-resumen").textContent = "Armando tu propuesta…";
  $("#propuesta-texto").textContent = "";
  if (!lista.length) { $("#recorrido-resumen").textContent = "No hay lugares con esos filtros. Probá con más distancia."; $("#paradas").innerHTML = ""; return; }

  let ids, texto;
  try {
    const pregunta = `Armá un recorrido cultural en EcoBici saliendo de ${ORIGEN.nombre}.
Tiempo: ${plan.minutos} minutos (elegí ${cuantos} lugar/es). Intereses: ${estado.intereses.join(", ")}. Clima: ${climaTexto()}.
${plan.modo === "destino" ? "El primer lugar de la lista es obligatorio." : ""}
Elegí SOLO entre estos (id · nombre · categoría · km · horario): ${lista.map(l => `${l.id} · ${l.nombre} · ${l.categoria} · ${fmtKm(desdeOrigen(l))} · ${l.horario || "-"}`).join("\n")}
Respondé en JSON: {"ids":[números en orden de visita],"texto":"2 a 3 oraciones cercanas"}`;
    const r = await fetch(ENV.IA_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pregunta, formato: "json" }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error);
    const json = JSON.parse(d.texto);
    ids = json.ids.map(Number).filter(id => lista.some(l => l.id === id)).slice(0, cuantos);
    texto = json.texto + " (Sugerido por IA)";
    if (!ids.length) throw new Error("sin lugares válidos");
  } catch {
    ids = lista.slice(0, cuantos).map(l => l.id);
    texto = `Te proponemos ${ids.map(id => porId(id).nombre).join(" y ")}, los más cercanos a tus intereses.`;
  }
  plan.ids = ids;
  $("#propuesta-texto").textContent = texto;
  pintarRecorrido();
}

let mapa;
function pintarRecorrido() {
  const paradas = plan.ids.map(porId), ultimo = paradas[paradas.length - 1];
  // Distancia en línea recta origen → paradas, y minutos de viaje estimados
  const base = [ORIGEN, ...paradas];
  let km = 0; for (let i = 1; i < base.length; i++) km += PRED.distKm(base[i - 1], base[i]);
  const minutos = Math.max(5, Math.round(km / VELOCIDAD_KMH * 60));
  const est = PRED.recomendarEstaciones(ORIGEN, ultimo, new Date(), minutos);
  const retiro = est.retirar[0], devolucion = est.devolver[0];
  const puntos = [ORIGEN, ...(retiro ? [retiro] : []), ...paradas, ...(devolucion ? [devolucion] : [])];
  km = 0; for (let i = 1; i < puntos.length; i++) km += PRED.distKm(puntos[i - 1], puntos[i]);
  plan.km = km; plan.estaciones = { retiro, devolucion };

  $("#recorrido-resumen").textContent = `${fmtKm(km)} · ${minutos} min en bici (en línea recta)`;
  $("#paradas").innerHTML = `
    <div class="tarjeta-apilada noche"><strong>1 · Retiro de bici</strong>
      <span>${retiro ? `Estación ${esc(retiro.nombre)} · a ${retiro.distM} m · probabilidad de bicis: ${retiro.nivelBicis} (${pct(retiro.bicis)})` : "Sin estación EcoBici a 600 m del origen."}</span></div>
    ${paradas.map((p, i) => `<div class="tarjeta-apilada ${i % 2 ? "naranja" : "rosa"}"><strong>${i + 2} · ${esc(p.nombre)}</strong>
      <span>${esc(p.categoria)} · ${fmtKm(desdeOrigen(p))} desde la salida${p.horario ? ` · ${esc(p.horario)}` : ""}</span></div>`).join("")}
    <div class="tarjeta-apilada celeste"><strong>${paradas.length + 2} · Devolución</strong>
      <span>${devolucion ? `Estación ${esc(devolucion.nombre)} · a ${devolucion.distM} m · anclajes libres: ${devolucion.nivelAnclajes} (${pct(devolucion.anclajes)})` : "Sin estación EcoBici a 600 m del destino."}</span></div>`;

  if (!window.maplibregl) return;
  if (mapa) mapa.remove();
  const lons = puntos.map(p => p.lon), lats = puntos.map(p => p.lat);
  mapa = new maplibregl.Map({ container: "mapa", style: ENV.OPENFREEMAP_STYLE_URL, attributionControl: { compact: true },
    bounds: [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], fitBoundsOptions: { padding: 50 } });
  mapa.on("load", () => {
    mapa.addSource("ruta", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: puntos.map(p => [p.lon, p.lat]) } } });
    mapa.addLayer({ id: "ruta", type: "line", source: "ruta", paint: { "line-color": "#203ae9", "line-width": 4, "line-dasharray": [2, 1] } });
  });
  // El origen es un punto azul; el resto se numera igual que las tarjetas de abajo (1 = retiro de bici)
  puntos.forEach((p, i) => {
    const pin = document.createElement("div");
    pin.className = "pin"; pin.textContent = i === 0 ? "" : i;
    pin.style.background = i === 0 ? "#203ae9" : i === 1 && retiro ? "#092957" : i === puntos.length - 1 && devolucion ? "#00baf1" : "#f90083";
    if (i === 0) pin.style.cssText += ";width:16px;height:16px";
    new maplibregl.Marker({ element: pin }).setLngLat([p.lon, p.lat]).addTo(mapa);
  });
}

$("#iniciar").addEventListener("click", () => {
  if (!plan.ids.length) return;
  TEND.registrarInicio(plan.ids);               // suma 1 recorrido iniciado a cada lugar (Tendencias)
  estado.ultimo = { km: plan.km, ids: [...plan.ids], estaciones: plan.estaciones, minutos: Math.round(plan.km / VELOCIDAD_KMH * 60) };
  guardarEstado();
  location.hash = "llegada";                    // en el prototipo se simula la llegada
});

// ---------- 07 · Llegada ----------
function pintarLlegada() {
  const u = estado.ultimo; if (!u) { location.hash = "planificar"; return; }
  const l = porId(u.ids[u.ids.length - 1]);
  $("#llegada-lugar").textContent = l.nombre;
  $("#llegada-foto").style.cssText = l.img ? `background:url('${fotoUrl(l)}') center / cover` : "";
  $("#llegada-km").textContent = fmtKm(u.km);
  $("#llegada-perfil").textContent = `+${fmtKm(u.km)} a tu perfil`;
  const dev = u.estaciones?.devolucion;
  $("#anclajes").textContent = dev ? `Próximo: anclajes libres en ${dev.nombre} · ${dev.nivelAnclajes} (${pct(dev.anclajes)})` : "No encontramos estación de devolución cerca.";
}
$("#ver-devolucion").addEventListener("click", () => { location.hash = "cierre"; });

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
  estado.destinoId = null; plan.modo = "sorpresa";
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
let redElegida = "instagram";
$$("#compartir [data-red]").forEach(b => b.addEventListener("click", () => {
  redElegida = b.dataset.red;
  $$("#compartir [data-red]").forEach(x => { x.classList.toggle("activo", x === b); x.lastElementChild.textContent = x === b ? "→" : "+"; });
}));
$("#compartir-ya").addEventListener("click", async () => {
  const texto = `${$("#compartir-km").textContent} por Buenos Aires con Pedalito. ${$("#compartir-ruta").textContent}`;
  const boton = $("#compartir-ya");
  try {
    if (navigator.share) await navigator.share({ title: "Pedalito", text: texto });
    else { await navigator.clipboard.writeText(texto); boton.firstChild.textContent = "Copiado para pegar en " + redElegida + " "; }
  } catch { /* la persona canceló */ }
});

mostrar();
