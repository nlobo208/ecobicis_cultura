// Función de Netlify: bicis y anclajes disponibles ahora en cada estación EcoBici.
// Consulta la API de transporte de la Ciudad (formato GBFS) con las credenciales guardadas en Netlify
// (ECOBICI_CLIENT_ID y ECOBICI_CLIENT_SECRET), que nunca llegan al navegador.
//   GET → { actualizado, estaciones: [{ id, nombre, lat, lon, capacidad, bicis, anclajes, deshabilitadas, activa }] }
//
// Credenciales: https://api-transporte.buenosaires.gob.ar/ (registrarse, crear una aplicación y copiar client_id y client_secret).
// La respuesta se guarda 30 segundos para no pasarse del límite de consultas de la API.

const BASE = "https://apitransporte.buenosaires.gob.ar/ecobici/gbfs";
const VIGENCIA_MS = 30000;
let guardado = { hora: 0, datos: null };

export default async (req) => {
  if (req.method !== "GET") return Response.json({ error: "Usá GET" }, { status: 405 });

  const id = process.env.ECOBICI_CLIENT_ID, secreto = process.env.ECOBICI_CLIENT_SECRET;
  if (!id || !secreto) {
    return Response.json({ error: "Falta configurar ECOBICI_CLIENT_ID y ECOBICI_CLIENT_SECRET en Netlify" }, { status: 500 });
  }

  const cabecera = { "Cache-Control": "public, max-age=30" };
  if (guardado.datos && Date.now() - guardado.hora < VIGENCIA_MS) return Response.json(guardado.datos, { headers: cabecera });

  const credenciales = `client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secreto)}`;
  try {
    const [estado, info] = await Promise.all([
      fetch(`${BASE}/stationStatus?${credenciales}`),
      fetch(`${BASE}/stationInformation?${credenciales}`),
    ]);
    if (!estado.ok || !info.ok) {
      return Response.json({ error: `La API de EcoBici respondió ${estado.ok ? info.status : estado.status}` }, { status: 502 });
    }
    const [e, i] = [await estado.json(), await info.json()];
    const infoPorId = new Map((i.data?.stations || []).map((s) => [String(s.station_id), s]));
    const estaciones = (e.data?.stations || []).map((s) => {
      const f = infoPorId.get(String(s.station_id)) || {};
      return {
        id: s.station_id, nombre: f.name ?? "", lat: f.lat ?? null, lon: f.lon ?? null, capacidad: f.capacity ?? null,
        bicis: s.num_bikes_available ?? 0, anclajes: s.num_docks_available ?? 0, deshabilitadas: s.num_bikes_disabled ?? 0,
        activa: s.is_installed !== 0 && s.is_renting !== 0,
      };
    });
    const datos = { actualizado: e.last_updated ? new Date(e.last_updated * 1000).toISOString() : new Date().toISOString(), estaciones };
    guardado = { hora: Date.now(), datos };
    return Response.json(datos, { headers: cabecera });
  } catch (err) {
    return Response.json({ error: "No se pudo consultar la API de EcoBici", detalle: String(err) }, { status: 502 });
  }
};
