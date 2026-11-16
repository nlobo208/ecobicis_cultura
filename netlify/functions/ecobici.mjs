// Función de Netlify: bicis y anclajes disponibles ahora en cada estación EcoBici.
// Lee el feed público GBFS v3.0 de EcoBici de la Ciudad (no necesita claves):
//   https://buenosaires.publicbikesystem.net/customer/gbfs/v3.0/station_status       → bicis y anclajes de ahora
//   https://buenosaires.publicbikesystem.net/customer/gbfs/v3.0/station_information  → nombre, ubicación y capacidad
// Protocolo: https://gbfs.org/documentation/reference/
//
// ¿Por qué una función y no pedirlo directo desde el navegador? El feed no manda el encabezado CORS, así que el
// navegador lo bloquearía. La función lo pide desde el servidor y lo reparte con el encabezado correcto.
//
//   GET → { actualizado, estaciones: [{ id, nombre, lat, lon, capacidad, bicis, anclajes, deshabilitadas, activa }] }
//
// El `id` de cada estación es su número oficial (el mismo que usa la app). El feed se actualiza cada ~20 segundos
// (campo ttl): la respuesta se guarda 20 segundos para no repetir pedidos de más.

const BASE = process.env.ECOBICI_GBFS_URL || "https://buenosaires.publicbikesystem.net/customer/gbfs/v3.0";
const VIGENCIA_MS = 20000;
let guardado = { hora: 0, datos: null };

/** En GBFS v3 los textos vienen como lista por idioma: [{ text, language }]. Se elige español y se saca el "002 - " del principio. */
const textoEs = (t) => {
  const s = Array.isArray(t) ? (t.find((x) => x.language === "es") || t[0])?.text : t;
  return String(s ?? "").replace(/^\s*\d+\s*-\s*/, "").trim();
};

export default async (req) => {
  if (req.method !== "GET") return Response.json({ error: "Usá GET" }, { status: 405 });

  const cabecera = { "Cache-Control": "public, max-age=20", "Access-Control-Allow-Origin": "*" };
  if (guardado.datos && Date.now() - guardado.hora < VIGENCIA_MS) return Response.json(guardado.datos, { headers: cabecera });

  try {
    const [estado, info] = await Promise.all([fetch(`${BASE}/station_status`), fetch(`${BASE}/station_information`)]);
    if (!estado.ok || !info.ok) {
      return Response.json({ error: `El feed de EcoBici respondió ${estado.ok ? info.status : estado.status}` }, { status: 502 });
    }
    const [e, i] = [await estado.json(), await info.json()];
    const infoPorId = new Map((i.data?.stations || []).map((s) => [String(s.station_id), s]));
    const estaciones = (e.data?.stations || []).map((s) => {
      const f = infoPorId.get(String(s.station_id)) || {};
      return {
        id: s.station_id,
        nombre: textoEs(f.name),
        lat: f.lat ?? null,
        lon: f.lon ?? null,
        capacidad: f.capacity ?? null,
        bicis: s.num_vehicles_available ?? 0,
        anclajes: s.num_docks_available ?? 0,
        deshabilitadas: s.num_vehicles_disabled ?? 0,
        activa: s.is_installed !== false && s.is_renting !== false,
      };
    });
    const datos = { actualizado: e.last_updated || new Date().toISOString(), estaciones };
    guardado = { hora: Date.now(), datos };
    return Response.json(datos, { headers: cabecera });
  } catch (err) {
    return Response.json({ error: "No se pudo consultar el feed de EcoBici", detalle: String(err) }, { status: 502 });
  }
};
