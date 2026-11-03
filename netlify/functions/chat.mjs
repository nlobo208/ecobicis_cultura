// Función de Netlify: recibe una pregunta de la app, llama a Groq y devuelve la respuesta.
// La clave vive en Netlify (variable de entorno GROQ_API_KEY), nunca en el repo.

const MODELO = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const BASE = `Sos el asistente de Pedalito, una app de recorridos culturales en EcoBici
por las comunas 1, 2, 4 y 14 de la Ciudad de Buenos Aires. Respondé en español rioplatense.
Si no sabés algo, decilo; no inventes lugares, horarios, calles ni estaciones.`;
// El límite de palabras es para respuestas de texto libre. Las respuestas JSON (recorrido, guía paso a paso)
// pueden ser largas: ahí se respeta el formato que pide la app.
const INSTRUCCIONES = {
  texto: `${BASE} Respondé en no más de 120 palabras.`,
  json: `${BASE} Respondé únicamente con el JSON pedido, sin texto antes ni después.`,
};

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Usá POST" }, { status: 405 });
  }

  const clave = process.env.GROQ_API_KEY;
  if (!clave) {
    return Response.json({ error: "Falta configurar GROQ_API_KEY en Netlify" }, { status: 500 });
  }

  let pregunta = "", formato = "texto";
  try {
    ({ pregunta, formato = "texto" } = await req.json());
  } catch {
    return Response.json({ error: "El cuerpo tiene que ser JSON" }, { status: 400 });
  }
  if (!pregunta || pregunta.length > 4000) {
    return Response.json({ error: "Falta la pregunta (máx. 4000 caracteres)" }, { status: 400 });
  }

  const respuesta = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0.6,
      // Con formato "json" Groq devuelve un objeto JSON válido (la app lo usa para elegir lugares)
      ...(formato === "json" && { response_format: { type: "json_object" } }),
      messages: [
        { role: "system", content: INSTRUCCIONES[formato === "json" ? "json" : "texto"] },
        { role: "user", content: pregunta },
      ],
    }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    return Response.json({ error: `Groq respondió ${respuesta.status}`, detalle }, { status: 502 });
  }

  const datos = await respuesta.json();
  return Response.json({ texto: datos.choices?.[0]?.message?.content ?? "", modelo: MODELO });
};
