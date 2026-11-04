// Pedalito · guía paso a paso (como Waze o Google Maps) y celebración de llegada
//
// Cómo se reparte el trabajo:
//  - El ruteo (js/ruteo.js) calcula el camino por calles y trae las maniobras reales: qué calle, qué giro, cuántos metros.
//  - Acá se arma la lista de pasos y se escribe una instrucción en castellano para cada uno (texto "automático").
//  - La IA reescribe esas instrucciones como un navegador paso a paso (mejorarConIA). Solo puede usar las calles y lugares
//    que le damos; si no responde, queda el texto automático y la app lo avisa.

(function () {
  // ---------- Textos ----------
  const SENTIDO = { "right": "a la derecha", "left": "a la izquierda", "slight right": "un poco a la derecha",
    "slight left": "un poco a la izquierda", "sharp right": "a la derecha (giro cerrado)", "sharp left": "a la izquierda (giro cerrado)" };
  const ORDINAL = ["", "primera", "segunda", "tercera", "cuarta", "quinta", "sexta"];
  const redondear = m => m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`;
  const minuscula = t => t.charAt(0).toLowerCase() + t.slice(1);

  function accionManiobra(p) {
    const via = p.calle ? ` en ${p.calle}` : "";
    switch (p.maniobra) {
      case "depart": return `Empezá a ${p.modo === "bici" ? "pedalear" : "caminar"}${p.calle ? ` por ${p.calle}` : ""}`;
      case "turn": case "end of road":
        return p.giro === "uturn" ? `Hacé el giro en U${via}` : p.giro === "straight" ? `Seguí derecho${via}` : `Doblá ${SENTIDO[p.giro] || ""}${via}`.replace("  ", " ");
      case "fork": return `Tomá el ramal ${p.giro && p.giro.includes("left") ? "izquierdo" : "derecho"}${via}`;
      case "merge": return `Incorporate${via}`;
      case "roundabout": case "rotary": case "roundabout turn":
        return `En la rotonda, tomá la ${p.salida ? ORDINAL[p.salida] + " " : ""}salida${via}`.replace("la  ", "la ");
      case "exit roundabout": case "exit rotary": return `Salí de la rotonda${via}`;
      default: return p.calle ? `Seguí por ${p.calle}` : "Seguí derecho";
    }
  }

  /** Instrucción automática (sin IA) para un paso. */
  function textoBase(p) {
    switch (p.tipo) {
      case "retiro": return `Retirá una bici en la estación ${p.nombre}`;
      case "devolucion": return `Dejá la bici en la ${p.nombre}`;
      case "lugar": return `Llegaste a ${p.nombre}`;
      case "final": return `Llegaste a ${p.nombre}: fin del recorrido`;
      case "sinruta": return `Dirigite a ${p.nombre} (no pudimos trazar este tramo por calles)`;
    }
    const a = accionManiobra(p);
    return p.maniobra === "depart" || p.metros < 30 ? a : `En ${redondear(p.metros)}, ${minuscula(a)}`;
  }

  const FLECHA = { "right": "↱", "left": "↰", "straight": "↑", "slight right": "↗", "slight left": "↖", "sharp right": "↱", "sharp left": "↰", "uturn": "↶" };
  /** Símbolo grande del paso. */
  function icono(p) {
    if (!p) return "";
    if (p.tipo === "retiro" || p.tipo === "devolucion") return "E";
    if (p.tipo === "lugar" || p.tipo === "final") return "★";
    if (p.tipo === "sinruta") return "?";
    if (/roundabout|rotary/.test(p.maniobra)) return "⟳";
    return FLECHA[p.giro] || "↑";
  }

  /** Dato de la estación para la IA: real ("hay 7 bicis ahora") si hay API de EcoBici conectada, estimado si no. */
  function extraDisponibilidad(est, clave) {
    const v = window.PedalitoDisponibilidad?.de(est.numero);
    if (v) { const n = clave === "bicis" ? v.bicis : v.anclajes; return `hay ${n} ${clave === "bicis" ? (n === 1 ? "bici" : "bicis") : (n === 1 ? "anclaje libre" : "anclajes libres")} ahora`; }
    return clave === "bicis" ? `probabilidad de bicis ${est.nivelBicis} (estimada)` : `probabilidad de anclajes libres ${est.nivelAnclajes} (estimada)`;
  }

  // ---------- Lista de pasos ----------
  const aMetros = (a, b) => {
    const k = 111320, dx = (b[0] - a[0]) * k * Math.cos(a[1] * Math.PI / 180), dy = (b[1] - a[1]) * k;
    return Math.hypot(dx, dy);
  };

  /**
   * Convierte los tramos del recorrido (a pie / en bici) en una lista ordenada de pasos para guiar.
   * Cada paso: { modo, tipo, texto, metros, punto:[lon,lat], celebra, … }.
   *  - tipo "maniobra": girar, seguir, rotonda… (metros = lo que falta desde la maniobra anterior)
   *  - tipo "retiro" / "devolucion": retirar o dejar la bici en una estación
   *  - tipo "lugar" / "final": llegada a un lugar cultural o al punto final
   */
  function construir(tramos) {
    const pasos = [];
    let pend = 0;                                    // metros del último tramo de calle hasta el próximo evento
    const meta = t => ({ tipo: t.tipo === "final" ? "final" : "lugar", modo: "pie", nombre: t.hasta.nombre,
      punto: [t.hasta.lon, t.hasta.lat], metros: pend, celebra: true });
    tramos.forEach(t => {
      if (t.modo === "llegada") { pasos.push(meta(t)); pend = 0; return; }       // el lugar estaba a menos de 40 m
      const ruta = t.rutas?.[t.elegida], modo = t.modo;
      if (modo === "bici") {
        pasos.push({ modo: "bici", tipo: "retiro", nombre: t.retiro.nombre, punto: [t.desde.lon, t.desde.lat], metros: pend,
          est: t.retiro, extra: extraDisponibilidad(t.retiro, "bicis") });
        pend = 0;
      }
      if (!ruta) {
        pasos.push({ modo, tipo: "sinruta", nombre: t.hasta.nombre, punto: [t.hasta.lon, t.hasta.lat],
          metros: Math.round(aMetros([t.desde.lon, t.desde.lat], [t.hasta.lon, t.hasta.lat])) });
        pend = 0;
      } else {
        const ps = ruta.pasos || [];
        ps.forEach((s, j) => {
          if (s.maniobra === "arrive" || !s.punto) return;
          pasos.push({ modo, tipo: "maniobra", maniobra: s.maniobra, giro: s.giro, salida: s.salida, calle: s.calle,
            metros: j > 0 ? ps[j - 1].metros : 0, punto: s.punto, ciclovia: modo === "bici" ? ruta.pctCiclovia : null });
        });
        pend = ps.length >= 2 ? ps[ps.length - 2].metros : ruta.metros;
      }
      if (modo === "bici") {
        pasos.push({ modo: "bici", tipo: "devolucion", nombre: `estación ${t.devolucion.nombre}`, punto: [t.hasta.lon, t.hasta.lat], metros: pend,
          celebra: true, est: t.devolucion, extra: extraDisponibilidad(t.devolucion, "anclajes") });
        pend = 0;
      } else if (t.tipo === "lugar" || t.tipo === "final") {
        pasos.push(meta(t)); pend = 0;
      }
    });
    // Si apenas dejás la bici ya estás en el lugar, se festeja una sola vez (la del lugar)
    pasos.forEach((p, i) => {
      const sig = pasos[i + 1];
      if (p.tipo === "devolucion" && sig && (sig.tipo === "lugar" || sig.tipo === "final") && aMetros(p.punto, sig.punto) < 60) p.celebra = false;
      p.texto = textoBase(p);
      p.textoAuto = p.texto;
    });
    return pasos;
  }

  /**
   * Pide a la IA que reescriba las instrucciones como un navegador paso a paso. Va por lotes (el pedido tiene un tope de largo).
   * Solo acepta textos cortos y de la cantidad exacta; los pasos de llegada conservan el nombre exacto del lugar.
   * Devuelve true si la IA mejoró al menos un paso.
   */
  async function mejorarConIA(pasos, preguntar, clima, alActualizar) {
    const TAM = 14;
    const lotes = [];
    for (let i = 0; i < pasos.length; i += TAM) lotes.push(pasos.slice(i, i + TAM));
    let mejorados = 0;
    await Promise.all(lotes.map(async lote => {
      try {
        const lineas = lote.map((p, i) => [i, p.modo === "bici" ? "bici" : "a pie", p.tipo, p.maniobra || "-", p.giro || "-", p.salida || "-",
          p.calle || "-", `${p.metros} m`, p.nombre || "-", p.ciclovia != null ? `ciclovía ${p.ciclovia} %` : "-", p.extra || "-"].join(" | ")).join("\n");
        const json = await preguntar(`Sos el navegador de Pedalito (como Waze) para una salida cultural en EcoBici por Buenos Aires.
Reescribí cada paso como una instrucción corta (máximo 90 caracteres), en español rioplatense, clara para leer o escuchar en movimiento.
Anticipá la distancia ("En 120 m, doblá a la izquierda en Callao"). Usá SOLO las calles y nombres de la tabla: no inventes calles, lugares ni estaciones.
A pie: caminá y cruzá con cuidado en las esquinas. En bici: pedaleá, usá la ciclovía cuando el dato lo diga y respetá los semáforos.
En retiro/devolución nombrá la estación y sumá un consejo breve usando el dato "extra". Clima: ${clima}.
Tabla (n | modo | tipo | maniobra | giro | salida | calle | metros | nombre | ciclovía | extra):
${lineas}
Respondé en JSON: {"textos":["…"]} con exactamente ${lote.length} textos, en el mismo orden.`);
        const textos = json.textos;
        if (!Array.isArray(textos) || textos.length !== lote.length) throw new Error("cantidad distinta");
        lote.forEach((p, i) => {
          const t = String(textos[i] ?? "").trim();
          if (t && t.length <= 140 && p.tipo !== "lugar" && p.tipo !== "final") { p.texto = t; mejorados++; }
        });
        alActualizar?.();
      } catch { /* este lote queda con el texto automático */ }
    }));
    return mejorados > 0;
  }

  // ---------- Confeti ----------
  const Confeti = (() => {
    const COLORES = ["#f90083", "#00baf1", "#ffd400", "#203ae9", "#38ea59", "#f76c09"];
    const DURACION = 3400;
    let canvas, ctx, particulas = [], inicio = 0, raf = 0;

    function crear(w) {
      return Array.from({ length: 150 }, () => ({
        x: Math.random() * w, y: -20 - Math.random() * 260, vx: (Math.random() - .5) * 140, vy: 110 + Math.random() * 230,
        giro: Math.random() * Math.PI, vgiro: (Math.random() - .5) * 9, ancho: 6 + Math.random() * 7, alto: 10 + Math.random() * 10,
        color: COLORES[Math.floor(Math.random() * COLORES.length)] }));
    }
    /** Dibuja el cuadro de `ms` milisegundos desde el comienzo (posiciones calculadas por tiempo, no por cuadro). */
    function dibujar(ms) {
      if (!ctx) return;
      const t = ms / 1000, desvanecer = ms > DURACION - 900 ? Math.max(0, (DURACION - ms) / 900) : 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = desvanecer;
      particulas.forEach(p => {
        ctx.save();
        ctx.translate(p.x + p.vx * t, p.y + p.vy * t + 90 * t * t);
        ctx.rotate(p.giro + p.vgiro * t);
        ctx.fillStyle = p.color; ctx.fillRect(-p.ancho / 2, -p.alto / 2, p.ancho, p.alto);
        ctx.restore();
      });
      ctx.globalAlpha = 1;
    }
    function iniciar(cv) {
      canvas = cv; ctx = cv.getContext("2d");
      const r = cv.getBoundingClientRect(); cv.width = Math.max(1, Math.round(r.width)); cv.height = Math.max(1, Math.round(r.height));
      particulas = crear(cv.width); inicio = performance.now(); cancelAnimationFrame(raf);
      const cuadro = ahora => {
        const ms = ahora - inicio;
        if (ms >= DURACION) { ctx.clearRect(0, 0, cv.width, cv.height); return; }
        dibujar(ms); raf = requestAnimationFrame(cuadro);
      };
      raf = requestAnimationFrame(cuadro);
    }
    const parar = () => { cancelAnimationFrame(raf); ctx?.clearRect(0, 0, canvas.width, canvas.height); };
    return { iniciar, dibujar, parar, DURACION };
  })();

  // ---------- Celebración de llegada ----------
  // Un círculo rosa entra desde la derecha con un cartel "¡Llegaste a …!", cae confeti y todo se va solo.
  let temporizadores = [];
  function celebrar(texto) {
    const el = document.querySelector("#celebracion");
    temporizadores.forEach(clearTimeout); temporizadores = [];
    el.querySelector("#celebracion-texto").textContent = texto;
    el.hidden = false;
    void el.offsetWidth;                                   // fuerza el estado inicial para que la entrada se anime
    el.classList.add("visible");
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!sinMovimiento) Confeti.iniciar(el.querySelector("#confeti"));
    temporizadores.push(setTimeout(() => el.classList.remove("visible"), Confeti.DURACION - 200));   // sale hacia la derecha
    temporizadores.push(setTimeout(() => { el.hidden = true; Confeti.parar(); }, Confeti.DURACION + 700));
  }

  window.PedalitoGuia = { construir, mejorarConIA, textoBase, icono, celebrar, Confeti, aMetros };
})();
