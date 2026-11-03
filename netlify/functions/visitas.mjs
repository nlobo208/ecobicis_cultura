// Función de Netlify: cuenta cuántas PERSONAS distintas visitaron cada lugar en los últimos días.
//   POST { usuario, lugares: [ids] }  → registra que ese usuario inició un recorrido con esos lugares hoy.
//   GET  ?dias=7                      → { ranking: [{ id, personas }] } con hoy y los días anteriores.
// Guarda un archivo por día en Netlify Blobs: { "idLugar": ["usuario1", "usuario2"] }.
// "usuario" es un identificador anónimo que genera el navegador (no es el email).
//
// Límite conocido: leer-y-escribir el día no es atómico; si dos personas registran en el mismo milisegundo
// puede perderse una. Para un prototipo alcanza; con mucho tráfico conviene una base de datos.

import { getStore } from "@netlify/blobs";

const ZONA = "America/Argentina/Buenos_Aires";
const MAX_DIAS = 30;

const diaDe = (fecha) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(fecha); // YYYY-MM-DD

export default async (req) => {
  const store = getStore("visitas");

  if (req.method === "POST") {
    let cuerpo;
    try { cuerpo = await req.json(); } catch { return Response.json({ error: "El cuerpo tiene que ser JSON" }, { status: 400 }); }
    const usuario = String(cuerpo.usuario || "");
    const lugares = Array.isArray(cuerpo.lugares) ? cuerpo.lugares.map(Number).filter(Number.isInteger).slice(0, 10) : [];
    if (usuario.length < 4 || usuario.length > 64 || !lugares.length) {
      return Response.json({ error: "Faltan usuario o lugares" }, { status: 400 });
    }
    const clave = `dia-${diaDe(new Date())}`;
    const datos = (await store.get(clave, { type: "json" })) || {};
    for (const id of lugares) {
      const personas = new Set(datos[id] || []);
      personas.add(usuario);
      datos[id] = [...personas];
    }
    await store.setJSON(clave, datos);
    return Response.json({ ok: true });
  }

  if (req.method === "GET") {
    const dias = Math.min(Math.max(Number(new URL(req.url).searchParams.get("dias")) || 7, 1), MAX_DIAS);
    const personasPorLugar = new Map();
    for (let i = 0; i < dias; i++) {
      const clave = `dia-${diaDe(new Date(Date.now() - i * 86400000))}`;
      const datos = (await store.get(clave, { type: "json" })) || {};
      for (const [id, usuarios] of Object.entries(datos)) {
        const set = personasPorLugar.get(Number(id)) || new Set();
        usuarios.forEach((u) => set.add(u));
        personasPorLugar.set(Number(id), set);
      }
    }
    const ranking = [...personasPorLugar]
      .map(([id, set]) => ({ id, personas: set.size }))
      .sort((a, b) => b.personas - a.personas)
      .slice(0, 20);
    return Response.json({ ranking }, { headers: { "Cache-Control": "public, max-age=300" } });
  }

  return Response.json({ error: "Usá GET o POST" }, { status: 405 });
};
