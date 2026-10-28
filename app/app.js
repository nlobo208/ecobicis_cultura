// Pedalito · lógica de la app (sin frameworks)
// Datos: data/lugares.js (30 lugares de ejemplo + estaciones EcoBici cercanas)

const LUGARES = window.PEDALITO_LUGARES;
const ESTACIONES = window.PEDALITO_ESTACIONES;
const ORIGEN = ESTACIONES.find(e => e.numero === 12); // Plaza Vicente López

// Las mismas 16 categorías que los chips del Figma (hotspots_pedalito)
const INTERESES = ["Anfiteatro", "Bar", "Biblioteca", "Café", "Centro cultural", "Club de música en vivo",
  "Disquería", "Espacio de formación", "Espacio ferial", "Galería de arte", "Librería",
  "Monumentos y lugares históricos", "Museo", "Restaurante", "Sala de cine", "Sala de teatro"];

const LUGARES_POR_TIEMPO = { 30: 1, 60: 2, 120: 3 };
const DISTANCIA_MAX_KM = 5;

// ---------- Estado guardado en el navegador ----------
const estado = Object.assign(
  { intereses: [], km: 0, salidas: 0, visitados: [], destinoId: null },
  leerEstado()
);
const plan = { modo: "sorpresa", minutos: 60, ids: [] };

function leerEstado() {
  try { return JSON.parse(localStorage.getItem("pedalito")) || {}; } catch { return {}; }
}
function guardarEstado() {
  try { localStorage.setItem("pedalito", JSON.stringify(estado)); } catch { /* modo privado */ }
}

// ---------- Utilidades ----------
const $ = sel => document.querySelector(sel);
const porId = id => LUGARES.find(l => l.id === Number(id));
const estacion = n => ESTACIONES.find(e => e.numero === n);

function distanciaKm(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const km = n => n.toFixed(1).replace(".", ",") + " km";
const desdeOrigen = l => distanciaKm(ORIGEN, l);

function foto(l) {
  return l.img
    ? `<div class="foto"><img src="img/${l.img}" alt="${l.nombre}"></div>`
    : `<div class="foto sin-imagen">${l.categoria}</div>`;
}

// ---------- Navegación por pantallas (#inicio, #explorar, #lugar/123…) ----------
function mostrar() {
  let [pantalla, param] = location.hash.slice(1).split("/");
  if (!estado.intereses.length && pantalla !== "intereses") pantalla = "intereses";
  if (!document.getElementById(pantalla)) pantalla = "inicio";

  document.querySelectorAll(".pantalla").forEach(s => s.classList.toggle("visible", s.id === pantalla));
  document.querySelectorAll(".barra a").forEach(a => a.classList.toggle("activo", a.dataset.tab === pantalla));
  $("#barra").classList.toggle("oculta", pantalla === "intereses" || pantalla === "lugar");
  window.scrollTo(0, 0);

  ({ intereses: pintarIntereses, inicio: pintarInicio, explorar: pintarExplorar,
     lugar: () => pintarLugar(param), planificar: pintarPlanificar, recorrido: armarRecorrido, perfil: pintarPerfil }[pantalla] || (() => {}))();
}
window.addEventListener("hashchange", mostrar);

// ---------- 02 · Intereses ----------
function pintarIntereses() {
  const cont = $("#chips-intereses");
  cont.innerHTML = INTERESES.map(i =>
    `<button class="chip ${estado.intereses.includes(i) ? "activo" : ""}" data-interes="${i}">${i}</button>`).join("");
  actualizarBotonIntereses();
}
$("#chips-intereses").addEventListener("click", e => {
  const i = e.target.dataset.interes;
  if (!i) return;
  const sel = estado.intereses;
  if (sel.includes(i)) sel.splice(sel.indexOf(i), 1);
  else if (sel.length < 5) sel.push(i);
  pintarIntereses();
});
function actualizarBotonIntereses() {
  const n = estado.intereses.length;
  $("#guardar-intereses").disabled = n < 3 || n > 5;
}
$("#guardar-intereses").addEventListener("click", () => { guardarEstado(); location.hash = "inicio"; });

// ---------- 03 · Home ----------
function pintarInicio() {
  const h = new Date().getHours();
  $("#saludo").textContent = h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
  const paraVos = LUGARES
    .filter(l => estado.intereses.includes(l.categoria))
    .sort((a, b) => desdeOrigen(a) - desdeOrigen(b))
    .slice(0, 6);
  $("#para-vos").innerHTML = paraVos.length ? paraVos.map(l => `
    <a class="tarjeta-lugar" href="#lugar/${l.id}">
      <div class="foto-wrap">${foto(l)}<span class="tag">CERCA TUYO</span></div>
      <strong>${l.nombre}</strong>
      <span class="meta">${km(desdeOrigen(l))} · ${l.barrio}</span>
    </a>`).join("") : `<p class="nota">Todavía no hay lugares de ejemplo para tus intereses.</p>`;
}

// Clima actual en CABA (Open-Meteo: gratis y sin clave)
let clima = null;
fetch("https://api.open-meteo.com/v1/forecast?latitude=-34.61&longitude=-58.38" +
      "&current=temperature_2m,precipitation,wind_speed_10m&timezone=America%2FArgentina%2FBuenos_Aires")
  .then(r => r.json())
  .then(d => {
    clima = d.current;
    const lluvia = clima.precipitation > 0 ? `lluvia ${clima.precipitation} mm` : "sin lluvia";
    $("#clima-inicio").textContent = `${Math.round(clima.temperature_2m)} °C · ${lluvia}`;
  })
  .catch(() => { $("#clima-inicio").textContent = "Clima no disponible"; });

// ---------- 04 · Explorar ----------
let filtro = "cerca";
function pintarExplorar() {
  const q = $("#buscador").value.trim().toLowerCase();
  let lista = LUGARES.filter(l => !q || (l.nombre + " " + l.categoria + " " + l.barrio).toLowerCase().includes(q));
  if (filtro === "intereses") lista = lista.filter(l => estado.intereses.includes(l.categoria));
  if (filtro === "cerca") lista = lista.filter(l => desdeOrigen(l) <= DISTANCIA_MAX_KM);
  lista.sort((a, b) => desdeOrigen(a) - desdeOrigen(b));
  $("#cantidad").textContent = `${lista.length} lugares`;
  $("#lista-lugares").innerHTML = lista.map(l => `
    <a class="fila-lugar" href="#lugar/${l.id}">
      ${foto(l)}
      <div><strong>${l.nombre}</strong>
        <span class="meta">${l.categoria} · ${km(desdeOrigen(l))} · ${l.barrio}</span>
        <span class="ver">Ver lugar →</span></div>
    </a>`).join("");
}
$("#buscador").addEventListener("input", pintarExplorar);
$("#filtros").addEventListener("click", e => {
  if (!e.target.dataset.filtro) return;
  filtro = e.target.dataset.filtro;
  document.querySelectorAll("#filtros .chip").forEach(c => c.classList.toggle("activo", c === e.target));
  pintarExplorar();
});

// ---------- 11 · Detalle lugar ----------
function pintarLugar(id) {
  const l = porId(id);
  if (!l) { location.hash = "explorar"; return; }
  const hero = $("#detalle-hero");
  hero.style.backgroundImage = l.img ? `url("img/${l.img}")` : "none";
  hero.classList.toggle("sin-imagen", !l.img);
  $("#detalle-categoria").textContent = l.categoria.toUpperCase();
  $("#detalle-nombre").textContent = l.nombre;
  const est = estacion(l.estacion);
  $("#detalle-meta").textContent = `${km(desdeOrigen(l))} · ${l.barrio} · EcoBici: ${est ? est.nombre : "—"}`;
  $("#detalle-horario").textContent = l.horario ? `Horario · ${l.horario}` : "Horario sin confirmar";
  $("#detalle-fuente").textContent = [
    l.cerrado ? `Cerrado: ${l.cerrado}.` : "",
    l.fuente_horario ? `Fuente: ${l.fuente_horario}.` : "",
    "Verificá horarios antes de salir."].join(" ");
  $("#detalle-sumar").onclick = () => {
    estado.destinoId = l.id; guardarEstado();
    plan.modo = "destino"; location.hash = "planificar";
  };
}

// ---------- 05 · Planificar ----------
function pintarPlanificar() {
  const d = porId(estado.destinoId);
  $("#destino-elegido").textContent = d ? d.nombre : "Elegí un lugar en Explorar";
  document.querySelectorAll(".modo").forEach(m => m.classList.toggle("activo", m.dataset.modo === plan.modo));
}
document.querySelector(".modos").addEventListener("click", e => {
  const m = e.target.closest(".modo");
  if (!m) return;
  if (m.dataset.modo === "destino" && !estado.destinoId) { location.hash = "explorar"; return; }
  plan.modo = m.dataset.modo; pintarPlanificar();
});
$("#tiempos").addEventListener("click", e => {
  if (!e.target.dataset.min) return;
  plan.minutos = Number(e.target.dataset.min);
  document.querySelectorAll("#tiempos .chip").forEach(c => c.classList.toggle("activo", c === e.target));
});
$("#buscar-recorrido").addEventListener("click", () => { location.hash = "recorrido"; });

// ---------- 06 · Recorrido (IA en tiempo real con Groq) ----------
function candidatos() {
  const cerca = LUGARES.filter(l => desdeOrigen(l) <= DISTANCIA_MAX_KM);
  const destino = porId(estado.destinoId);
  if (plan.modo === "destino" && destino) return [destino, ...cerca.filter(l => l.id !== destino.id && estado.intereses.includes(l.categoria))];
  const propios = cerca.filter(l => estado.intereses.includes(l.categoria));
  return (propios.length ? propios : cerca).sort((a, b) => desdeOrigen(a) - desdeOrigen(b)).slice(0, 8);
}

async function armarRecorrido() {
  const lista = candidatos();
  const cuantos = LUGARES_POR_TIEMPO[plan.minutos];
  $("#propuesta-texto").textContent = "Pensando tu recorrido…";
  $("#propuesta-texto").classList.add("cargando");

  const climaTxt = clima ? `${clima.temperature_2m} °C, lluvia ${clima.precipitation} mm, viento ${clima.wind_speed_10m} km/h` : "sin dato";
  const pregunta = `Armá un recorrido cultural en EcoBici saliendo de la estación ${ORIGEN.nombre}.
Tiempo disponible: ${plan.minutos} minutos (elegí ${cuantos} lugar/es). Intereses: ${estado.intereses.join(", ")}.
Clima ahora: ${climaTxt}. ${plan.modo === "destino" ? "El primer lugar de la lista es obligatorio." : ""}
Elegí SOLO entre estos lugares (id · nombre · categoría · km desde la salida · horario):
${lista.map(l => `${l.id} · ${l.nombre} · ${l.categoria} · ${km(desdeOrigen(l))} · ${l.horario || "horario sin confirmar"}`).join("\n")}
Respondé en JSON con esta forma: {"ids":[números en el orden de visita],"texto":"propuesta de 2 a 4 oraciones que explique por qué estos lugares, en tono cercano"}`;

  let ids, texto, origen;
  try {
    const r = await fetch("/.netlify/functions/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pregunta, formato: "json" })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    const json = JSON.parse(d.texto);
    ids = json.ids.map(Number).filter(id => lista.some(l => l.id === id)).slice(0, cuantos);
    texto = json.texto;
    origen = `Generado por IA (Groq · ${d.modelo}).`;
    if (!ids.length) throw new Error("La IA no eligió lugares válidos");
  } catch (err) {
    // Sin la función de Netlify (por ejemplo, abriendo el archivo en la compu) usamos una propuesta simple
    ids = lista.slice(0, cuantos).map(l => l.id);
    texto = `Te proponemos ${ids.map(id => porId(id).nombre).join(" y ")}, los más cercanos a tus intereses.`;
    origen = "Vista sin IA: la propuesta con Groq funciona cuando el sitio está publicado en Netlify.";
  }

  plan.ids = ids;
  $("#propuesta-texto").classList.remove("cargando");
  $("#propuesta-texto").textContent = texto;
  $("#propuesta-origen").textContent = origen;
  pintarRecorrido();
}

let mapa;
function pintarRecorrido() {
  const paradas = plan.ids.map(porId);
  const devolucion = estacion(paradas[paradas.length - 1].estacion);
  const puntos = [ORIGEN, ...paradas, devolucion];
  let total = 0;
  for (let i = 1; i < puntos.length; i++) total += distanciaKm(puntos[i - 1], puntos[i]);
  plan.km = total;
  $("#recorrido-resumen").textContent = `${km(total)} aprox. · ${paradas.length} lugar${paradas.length > 1 ? "es" : ""} · ${plan.minutos} min`;
  $("#recorrido-destino").textContent = `Devolución: estación ${devolucion.nombre} · ${paradas.map(p => p.nombre).join(" → ")}`;

  if (mapa) mapa.remove();
  mapa = new maplibregl.Map({
    container: "mapa",
    style: "https://tiles.openfreemap.org/styles/positron",
    bounds: limites(puntos), fitBoundsOptions: { padding: 50 }, attributionControl: { compact: true }
  });
  mapa.on("load", () => {
    mapa.addSource("ruta", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: puntos.map(p => [p.lon, p.lat]) } } });
    mapa.addLayer({ id: "ruta", type: "line", source: "ruta", paint: { "line-color": "#0a6cff", "line-width": 4, "line-dasharray": [2, 1] } });
  });
  marcador(ORIGEN, "#0e0f12", `Salida · ${ORIGEN.nombre}`);
  paradas.forEach(p => marcador(p, "#7d5eff", p.nombre));
  marcador(devolucion, "#0a6cff", `Devolución · ${devolucion.nombre}`);
}
function marcador(p, color, texto) {
  new maplibregl.Marker({ color }).setLngLat([p.lon, p.lat]).setPopup(new maplibregl.Popup().setText(texto)).addTo(mapa);
}
function limites(puntos) {
  const lons = puntos.map(p => p.lon), lats = puntos.map(p => p.lat);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}

$("#terminar").addEventListener("click", () => {
  estado.km += plan.km || 0;
  estado.salidas += 1;
  plan.ids.forEach(id => { if (!estado.visitados.includes(id)) estado.visitados.push(id); });
  estado.destinoId = null; plan.modo = "sorpresa";
  guardarEstado();
  location.hash = "perfil";
});

// ---------- 09 · Perfil ----------
function pintarPerfil() {
  $("#km-total").textContent = estado.km.toFixed(1).replace(".", ",");
  $("#salidas").textContent = estado.salidas;
  $("#visitados").textContent = estado.visitados.length;
  $("#mis-intereses").innerHTML = estado.intereses.map(i => `<span class="chip activo etiqueta-chip">${i}</span>`).join("");
}

mostrar();
