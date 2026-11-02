// Pedalito · rueda GIRA (pantalla Compartir, al terminar el viaje)
// Se toca la rueda (o el botón GIRA), gira con inercia y al frenar muestra el mensaje del día.
// Respeta "reducir movimiento": en ese caso no gira, muestra el mensaje directamente.

(function () {
  const MENSAJES = [
    "Hoy el mejor atajo es el que pasa por un museo.",
    "Pedalear despacio también es llegar.",
    "Una ciudad se conoce mejor a 15 km/h.",
    "Si dudás entre dos lugares, andá al que tiene horario hasta tarde.",
    "Un café después del museo cuenta como parte del recorrido.",
    "Las mejores fotos salen cuando frenás para mirar.",
    "Hoy descubrí una calle que nunca habías mirado.",
    "Devolver la bici a tiempo es cultura ciudadana.",
    "Tu próximo recorrido empieza con una pregunta: ¿qué hay a la vuelta?",
    "Menos pantalla, más ciudad.",
    "Cada kilómetro suma, aunque sea hacia la biblioteca.",
    "La cultura también se pedalea."
  ];

  /** Mensaje del día: el mismo todo el día para quien gira, cambia con la fecha. */
  function mensajeDelDia(fecha = new Date()) {
    const dia = Math.floor(fecha.getTime() / 86400000);
    return MENSAJES[dia % MENSAJES.length];
  }

  const DURACION_MS = 3500;                       // lo que tarda en frenar, en cualquier pantalla
  const easeOut = t => 1 - Math.pow(1 - t, 3);    // arranca rápido y frena de a poco

  function iniciar({ rueda, boton, salida, mensaje, alTerminar }) {
    let angulo = 0, girando = false, yaGiro = false, temporizador = null, sesion = 0;
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function mostrar() {
      if (yaGiro) return;
      clearTimeout(temporizador);
      yaGiro = true; girando = false;
      mensaje.textContent = mensajeDelDia();
      salida.hidden = false;
      boton.textContent = "Mensaje del día";
      boton.disabled = true;
      if (alTerminar) alTerminar();
    }

    function girar() {
      if (girando || yaGiro) return;
      if (reducir) { mostrar(); return; }
      girando = true;
      boton.textContent = "…";
      const desde = angulo, vuelta = 360 * (4 + Math.random() * 2); // entre 4 y 6 vueltas
      const inicio = performance.now(), mia = ++sesion;
      const paso = ahora => {
        if (mia !== sesion) return;               // se reinició la rueda mientras giraba
        const t = Math.min((ahora - inicio) / DURACION_MS, 1);
        rueda.style.transform = `rotate(${desde + vuelta * easeOut(t)}deg)`;
        if (t < 1) requestAnimationFrame(paso); else { angulo = desde + vuelta; mostrar(); }
      };
      requestAnimationFrame(paso);
      // Si la pestaña queda en segundo plano el navegador pausa la animación: el mensaje igual aparece
      temporizador = setTimeout(mostrar, DURACION_MS + 400);
    }

    boton.addEventListener("click", girar);
    rueda.addEventListener("click", girar);
    rueda.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); girar(); } });

    return { reiniciar() {
      clearTimeout(temporizador); sesion++;
      angulo = 0; girando = false; yaGiro = false;
      rueda.style.transform = "rotate(0deg)";
      salida.hidden = true; boton.textContent = "GIRA"; boton.disabled = false;
    } };
  }

  window.PedalitoRueda = { iniciar, mensajeDelDia };
})();
