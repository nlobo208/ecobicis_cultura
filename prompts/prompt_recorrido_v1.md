# Prompt del recorrido · v1

Es el prompt con el que Pedalito le pide a la IA un recorrido. Se usa cada vez que alguien toca **Buscar recorrido**.

- **Modelo:** `openai/gpt-oss-120b` en Groq (el 28/10 Groq dio de baja `llama-3.3-70b-versatile`, el que usábamos antes).
- **Dónde está en el código:** el system prompt en `netlify/functions/chat.mjs` (constante `INSTRUCCIONES`); el mensaje del usuario se arma en `app/app.js`, función `armarRecorrido()`.
- **Parámetros:** `temperature: 0.6` y `response_format: json_object`, para que la respuesta sea siempre un JSON válido.
- **Clave:** variable de entorno `GROQ_API_KEY` en Netlify. Nunca en el repo.

## 1. System prompt

```
Sos el asistente de Pedalito, una app de recorridos culturales en EcoBici
por las comunas 1, 2, 4 y 14 de la Ciudad de Buenos Aires. Respondé en español rioplatense,
en no más de 120 palabras. Si no sabés algo, decilo; no inventes lugares, horarios ni estaciones.
```

## 2. Mensaje que arma la app (plantilla)

```
Armá un recorrido cultural en EcoBici saliendo de la estación {estación de salida}.
Tiempo disponible: {30 | 60 | 120} minutos (elegí {1 | 2 | 3} lugar/es). Intereses: {3 a 5 intereses}.
Clima ahora: {temperatura} °C, lluvia {mm} mm, viento {km/h} km/h. {Si eligió destino: "El primer lugar de la lista es obligatorio."}
Elegí SOLO entre estos lugares (id · nombre · categoría · km desde la salida · horario · estado del horario):
{hasta 8 lugares, uno por línea}
Si un horario no está verificado, recomendá confirmarlo antes de salir.
Respondé en JSON con esta forma: {"ids":[números en el orden de visita],"texto":"propuesta de 2 a 4 oraciones que explique por qué estos lugares, en tono cercano"}
```

## 3. Qué datos se le mandan (contexto)

| Dato | De dónde sale | ¿Calculado o declarado? |
|---|---|---|
| Lugares candidatos (hasta 8) | `hotspots_pedalito.xlsx`, filtrados por la app: a 5 km o menos de la salida y de los intereses elegidos, ordenados por cercanía | Filtro y orden calculados con los datos |
| Distancia de cada lugar | Fórmula de haversine (línea recta) | Calculado |
| Horario | 30 lugares verificados a mano; otros, declarado en BA Data; el resto, sin dato | Se le dice a la IA cuál es cuál |
| Intereses y tiempo | Lo que elige la persona en la app | Dato de la persona |
| Clima | Open-Meteo, en el momento | Dato externo |

## 4. Qué se le pide devolver

Un JSON con dos campos:
- `ids`: los lugares elegidos, en orden de visita.
- `texto`: la propuesta para la persona, de 2 a 4 oraciones.

## 5. Límites y controles

- **No puede inventar lugares:** la app descarta cualquier `id` que no esté en la lista que le mandó y se queda con la cantidad pedida.
- **No calcula nada:** distancias, km del recorrido y estaciones los calcula la app, no la IA.
- **Si falla** (sin conexión, error de Groq o respuesta inválida), la app muestra una propuesta simple con los lugares más cercanos y la etiqueta "Dato calculado · Vista sin IA".
- **En la interfaz**, la propuesta de la IA lleva la etiqueta violeta "Sugerido por IA"; los cálculos, la celeste "Dato calculado".

## 6. Versiones

| Versión | Fecha | Cambio |
|---|---|---|
| v1 | 27/10/2026 | Primera versión con salida en JSON. |
| v1.1 | 28/10/2026 | Cambio de modelo a `openai/gpt-oss-120b`. |
| v1.2 | 02/11/2026 | Se le indica si cada horario está verificado, declarado o sin dato. |
