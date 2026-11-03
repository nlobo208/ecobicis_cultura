// Pedalito · horarios: convierte el texto del dataset en una semana ordenada para mostrarla de forma visual
//
// El dataset trae los horarios como texto libre y con muchos formatos:
//   "Jueves a lunes 12 a 20; miércoles 11 a 20; martes cerrado"
//   "lunes a jueves: 09:00–22:00 · viernes y sábado: 09:00–00:00"
//   "lunes a viernes de 7 a 1 - sabado de 10 a 2"      (1 y 2 de la madrugada)
//   "lunes a domingo de 12 a 16 y de 20 al cierre"
// interpretar() lo lleva a { semana: [7 días], notas, ok, dudoso }. Si un horario no se puede entender con certeza,
// `ok` o `dudoso` lo indican y la app muestra el texto original en vez de inventar un dato.

(function () {
  const NOMBRES = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];    // 0 = lunes
  const CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const INICIAL = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
  const norm = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const DIA_RE = /\b(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?|lun|mar|mie|jue|vie|sab|dom)\b/g;
  const indiceDia = palabra => {
    const p = palabra.replace(/s$/, "").slice(0, 3);
    return { lun: 0, mar: 1, mie: 2, jue: 3, vie: 4, sab: 5, dom: 6 }[p === "sab" ? "sab" : p];
  };

  /** Días que nombra una cláusula: "lunes a viernes", "viernes y sabado", "todos los dias". */
  function parsearDias(t) {
    if (/todos los dias|toda la semana|diario/.test(t)) return { dias: [0, 1, 2, 3, 4, 5, 6], resto: t.replace(/todos los dias|toda la semana|diario/, " ") };
    if (/fines? de semana/.test(t)) return { dias: [5, 6], resto: t.replace(/fines? de semana/, " ") };
    const marcas = [...t.matchAll(DIA_RE)];
    if (!marcas.length) return { dias: [], resto: t };
    const dias = new Set(); let resto = t;
    marcas.forEach((m, i) => {
      const d = indiceDia(m[1]); if (d === undefined) return;
      const previa = i > 0 ? t.slice(marcas[i - 1].index + marcas[i - 1][0].length, m.index) : "";
      if (i > 0 && /^\s*(a|al|hasta)\s*$/.test(previa)) {                // rango: puede dar la vuelta (viernes a lunes)
        let d0 = indiceDia(marcas[i - 1][1]);
        if (d0 === d) { for (let k = 0; k < 7; k++) dias.add(k); }       // "lunes a lunes" = toda la semana
        else for (let k = d0; ; k = (k + 1) % 7) { dias.add(k); if (k === d) break; }
      } else dias.add(d);
    });
    resto = t.replace(DIA_RE, " ").replace(/\b(a|al|y|e|hasta)\b(?=\s*[,:]?\s*(?:de |del )?\s*(?:\d|cerrad|mediod|todo))/g, m => m);
    return { dias: [...dias].sort((a, b) => a - b), resto };
  }

  const aMin = (h, m) => Number(h) * 60 + Number(m || 0);

  /** Tramos horarios de una cláusula: "12 a 16 y de 20 al cierre" → [{ini, fin}, {ini, finCierre}]. */
  function parsearHoras(t) {
    const tramos = []; let dudoso = false;
    let r = t.replace(/(\d)\s*-\s*(\d)/g, "$1 a $2");
    // "H al cierre"
    r = r.replace(/(\d{1,2})(?:[:.](\d{1,2}))?\s*(?:h|hs)?\s*(?:a|hasta)?\s*(?:las\s*)?al cierre/g, (_, h, m) => { tramos.push({ ini: aMin(h, m), fin: 1440, alCierre: true }); return " "; });
    // "H a H"
    r = r.replace(/(\d{1,2})(?:[:.](\d{1,2}))?\s*(?:h|hs)?\s*(?:a|al|hasta)\s*(?:las\s*)?(\d{1,2})(?:[:.](\d{1,2}))?\s*(?:h|hs)?/g, (_, h1, m1, h2, m2) => {
      if (+h1 > 24 || +h2 > 24 || +(m1 || 0) > 59 || +(m2 || 0) > 59) { dudoso = true; return " "; }
      let ini = aMin(h1, m1), fin = aMin(h2, m2);
      if (fin === 0) fin = 1440;                      // "a 00" = medianoche
      else if (fin <= ini) fin += 1440;               // "7 a 1": cierra de madrugada, ya del día siguiente
      const dur = fin - ini;
      if (dur > 20 * 60 && !(ini === 0 && fin === 1440)) dudoso = true;   // p. ej. "de 1 a 00": casi seguro un error de carga
      tramos.push({ ini, fin }); return " ";
    });
    if (/24 ?(horas|hs)|las 24/.test(r)) { tramos.push({ ini: 0, fin: 1440 }); r = " "; }
    return { tramos, dudoso, resto: r };
  }

  const ES_NOTA = /delivery|take ?away|retiro|cocina|reserva|visita|guiada|boleteria|programacion|segun|exposicion fija/;
  // Acentos escritos como \u para que no dependan de la codificación del archivo
  const ACENTOS = { exposicion: "exposición", programacion: "programación", segun: "según", boleteria: "boletería", mediodia: "mediodía" };
  const bonito = t => { const s = t.charAt(0).toUpperCase() + t.slice(1); return s.replace(/exposicion|programacion|segun|boleteria|mediodia/g, w => ACENTOS[w]); };

  function interpretar(texto) {
    const original = String(texto || "").trim();
    const salida = { original, semana: Array.from({ length: 7 }, () => null), notas: [], ok: false, dudoso: false };
    if (!original) return salida;

    let t = norm(original).replace(/[–—]/g, "-").replace(/\s+/g, " ");
    const parentesis = [...t.matchAll(/\(([^)]*)\)/g)].map(m => m[1].trim()).filter(Boolean);
    parentesis.forEach(p => salida.notas.push(bonito(p)));
    t = t.replace(/\([^)]*\)/g, " ").replace(/(\d)\s*-\s*(\d)/g, "$1 a $2");
    const clausulas = t.split(/\s*(?:;|\||·|\n|\s-\s)\s*/).map(c => c.trim().replace(/^[,:]|[,:]$/g, "").trim()).filter(Boolean);

    const hayDias = clausulas.some(c => parsearDias(c).dias.length);
    clausulas.forEach(c => {
      if (ES_NOTA.test(c) && !/^(lunes|martes|miercoles|jueves|viernes|sabado|domingo)/.test(c)) { salida.notas.push(bonito(c)); return; }
      const { dias, resto } = parsearDias(c);
      const cerrado = /cerrad/.test(resto);
      const horas = parsearHoras(resto.replace(/:/g, m => m));
      const almuerzoCena = /mediodia/.test(resto) && /noche/.test(resto);
      const aplica = dias.length ? dias : (hayDias ? [] : [0, 1, 2, 3, 4, 5, 6]);
      if (/feriado/.test(c) && !dias.length) { salida.notas.push(bonito(c)); return; }
      if (!aplica.length) { if (c.length > 3) salida.notas.push(bonito(c)); return; }
      if (horas.dudoso) salida.dudoso = true;
      if (cerrado && !horas.tramos.length) { aplica.forEach(d => { salida.semana[d] = { cerrado: true, tramos: [] }; }); salida.ok = true; return; }
      if (horas.tramos.length) {
        aplica.forEach(d => { salida.semana[d] = { cerrado: false, tramos: horas.tramos.slice() }; });
        salida.ok = true;
      } else if (almuerzoCena) {
        aplica.forEach(d => { salida.semana[d] = { cerrado: false, tramos: [], texto: "Mediodía y noche" }; });
        salida.ok = true;
      } else if (dias.length) {
        salida.notas.push(bonito(c));      // tiene días pero no horas que entienda
      }
      if (/feriado/.test(c)) salida.notas.push((cerrado ? "Cerrado los feriados" : "Abre en feriados"));
    });
    // Los días que el texto no nombra se muestran como cerrados (el dato lista los días de apertura)
    if (salida.ok) salida.semana = salida.semana.map(d => d || { cerrado: true, tramos: [], sinDato: true });
    salida.notas = [...new Set(salida.notas)];
    return salida;
  }

  // ---------- Formato ----------
  const hora = min => { const h = Math.floor(min / 60), m = min % 60; return m ? `${h}:${String(m).padStart(2, "0")}` : String(h); };
  const finTxt = fin => fin === 1440 ? "24" : hora(fin % 1440);
  /** "a medianoche", "a la 1 h", "a las 20 h" */
  const cierraA = fin => { const f = fin % 1440; return f === 0 ? "a medianoche" : f === 60 ? "a la 1 h" : `a las ${hora(f)} h`; };
  /** "12–20" (para la grilla de la semana). */
  const tramoCorto = t => t.alCierre ? `${hora(t.ini)}–cierre` : `${hora(t.ini)}–${finTxt(t.fin)}`;
  /** "12 a 20 h" (para frases). */
  const tramoTexto = t => t.alCierre ? `${hora(t.ini)} h al cierre` : `${hora(t.ini)} a ${finTxt(t.fin)} h`;
  const horasDelDia = d => d.texto ? d.texto : d.tramos.map(tramoTexto).join(" y ");
  const firmaDia = d => d.cerrado ? "cerrado" : (d.texto || d.tramos.map(tramoCorto).join("+"));

  /** Agrupa días con el mismo horario en rangos: [{ dias:[0,1,2,3,4], d }] (los días van en orden circular). */
  function grupos(semana) {
    const porFirma = new Map();
    semana.forEach((d, i) => { if (!d || d.cerrado) return; const f = firmaDia(d); if (!porFirma.has(f)) porFirma.set(f, { dias: [], d }); porFirma.get(f).dias.push(i); });
    return [...porFirma.values()];
  }
  /** "Lun a vie", "Sáb y dom", "Lun, mié y vie" */
  function nombreDias(dias) {
    if (dias.length === 7) return "Todos los días";
    const set = new Set(dias), runs = []; let inicio = [...Array(7).keys()].find(i => set.has(i) && !set.has((i + 6) % 7));
    if (inicio === undefined) inicio = 0;
    for (let k = 0; k < 7; k++) {
      const i = (inicio + k) % 7; if (!set.has(i)) continue;
      const ult = runs[runs.length - 1];
      if (ult && ult[ult.length - 1] === (i + 6) % 7) ult.push(i); else runs.push([i]);
    }
    const items = runs.flatMap(r => r.length >= 3 ? [`${CORTO[r[0]]} a ${CORTO[r[r.length - 1]].toLowerCase()}`] : r.map(i => CORTO[i])).map((p, i) => i ? p.charAt(0).toLowerCase() + p.slice(1) : p);
    return items.length === 1 ? items[0] : items.slice(0, -1).join(", ") + " y " + items[items.length - 1];
  }
  /** Resumen en una línea: "Lun a vie 8 a 20 h · Sáb 10 a 14 h". Si no se entiende, devuelve el texto tal cual. */
  function resumen(texto) {
    const h = interpretar(texto);
    if (!h.ok || h.dudoso) return h.original || "sin dato";
    return grupos(h.semana).map(g => `${nombreDias(g.dias)}: ${horasDelDia(g.d)}`).join(" · ");
  }
  /** Para las actividades: dias="jueves a lunes", abre="12:00", cierra="20:00" → "Jue a lun · 12 a 20 h". */
  function resumenActividad(dias, abre, cierra) {
    const hh = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ""); return m ? hora(aMin(m[1], m[2])) : ""; };
    const horas = abre && cierra ? `${hh(abre)} a ${hh(cierra)} h` : "";
    const { dias: d } = parsearDias(norm(dias || ""));
    const cuando = d.length ? nombreDias(d) + (/feriado/.test(norm(dias)) ? " y feriados" : "") : "";
    return [cuando, horas].filter(Boolean).join(" · ");
  }

  // ---------- Abierto o cerrado ahora ----------
  function estadoAhora(h, fecha = new Date()) {
    if (!h.ok || h.dudoso) return null;
    const hoy = (fecha.getDay() + 6) % 7, ahora = fecha.getHours() * 60 + fecha.getMinutes();
    const ayer = h.semana[(hoy + 6) % 7], dia = h.semana[hoy];
    if (ayer && ayer.tramos.some(t => t.fin > 1440 && ahora < t.fin - 1440)) {
      const t = ayer.tramos.find(x => x.fin > 1440 && ahora < x.fin - 1440);
      return { abierto: true, texto: `Abierto ahora · cierra ${cierraA(t.fin)}` };
    }
    if (dia && dia.tramos.length) {
      const t = dia.tramos.find(x => ahora >= x.ini && ahora < x.fin);
      if (t) return { abierto: true, texto: t.alCierre ? "Abierto ahora · hasta el cierre" : `Abierto ahora · cierra ${cierraA(t.fin)}` };
      const proximo = dia.tramos.filter(x => x.ini > ahora).sort((a, b) => a.ini - b.ini)[0];
      if (proximo) return { abierto: false, texto: `Cerrado ahora · abre hoy a las ${hora(proximo.ini)} h` };
    }
    for (let k = 1; k <= 7; k++) {
      const d = h.semana[(hoy + k) % 7];
      if (d && d.tramos.length) return { abierto: false, texto: `Cerrado ahora · abre ${k === 1 ? "mañana" : CORTO[(hoy + k) % 7].toLowerCase() === "dom" ? "el domingo" : "el " + NOMBRES[(hoy + k) % 7]} a las ${hora(d.tramos[0].ini)} h` };
    }
    return dia && dia.texto ? null : { abierto: false, texto: "Cerrado hoy" };
  }

  window.PedalitoHorarios = { bonito, interpretar, resumen, resumenActividad, estadoAhora, tramoCorto, tramoTexto, INICIAL, CORTO, nombreDias, grupos };
})();
