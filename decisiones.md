# Registro de decisiones

Qué probamos, qué descartamos y por qué. Las entradas más nuevas van arriba.

## 2026-09-28 · Datos y limpieza

**Qué hicimos**
- Acotamos todo el análisis a las comunas 1, 2, 3, 4 y 14. Descartamos las otras 10 comunas de todos los datasets.
- Dejamos como base los datasets de espacios culturales, ciclovías, usuarios EcoBici 2024 y conteo de ciclistas. Faltan estaciones y recorridos 2024, que son los que permiten medir uso por estación.
- Elegimos 2024 como año de viajes porque es un año completo y coincide con el archivo de usuarios que ya teníamos.

**Qué descartamos y por qué**
- `usuarios_ecobici_2024` no sirve para medir uso por estación. Es el registro de altas de usuarios, sin estación ni recorrido. Lo usamos solo para perfil (género y edad).
- Sacamos 65 usuarios con edad menor a 16 o mayor a 90 (errores de carga, había edades de 1 y de 961).
- Sacamos 10 librerías online (sin dirección física) y 5 filas con coordenadas faltantes o inválidas.
- Unificamos filas repetidas del mismo lugar (el original tiene una fila por sala o pabellón).
- El conteo de ciclistas 2013-2019 quedó como contexto histórico y no se cruza con nada (son solo 7 filas).

**Cómo clasificamos los espacios culturales**
- Núcleo de la hipótesis: exhibición (museos, galerías, centros culturales) y escénico (teatros, cines, música en vivo, anfiteatros). Son 691 espacios.
- Aparte: monumentos y ferias (patrimonio). No son espacios de exhibición o escénicos en sentido estricto.
- Complementarios: bibliotecas, librerías, bares, disquerías, espacios de formación y calesitas.
- Es una decisión nuestra y se puede revisar en `codigo/limpiar_datasets.py`.

**Ciclovía como variable de control**
- Calculamos la distancia de cada espacio cultural a la ciclovía más cercana. Es aproximada.
- La comuna de cada estación EcoBici se va a asignar con la ciclovía más cercana, porque el dataset de estaciones probablemente no la trae. Mejora posible: cruzar con el polígono oficial de comunas.

**Pendiente**
- Descargar estaciones y recorridos 2024 (bad gateaway) y probar `codigo/cruce_estaciones_culturales.py` con datos reales (solo se probó con datos inventados).
- Verificar la lista de feriados 2024 del script.
- Anotar en el readme la licencia y la fecha de descarga de cada fuente.

## (22/9) · Cambio de hipótesis

**Hipótesis nueva.** En las comunas 1, 2, 3, 4 y 14, las estaciones EcoBici a menos de 300 m de un espacio cultural de exhibición o escénico tienen un uso distinto (más viajes en fin de semana y feriados, más tarde-noche, más viajes de ida y vuelta, mayor duración) que las estaciones sin espacio cultural cerca. Esto sugeriría un uso recreativo distinto del uso de traslado al trabajo o estudio.

**Por qué este foco**
- Compara dos tipos de uso (recreativo vs. traslado) en lugar de confirmar algo que ya sabemos.
- Permite un producto concreto: una app que arma recorridos culturales en bici según el tiempo y los gustos de la persona, con clima y feriados.
- El usuario pasa a ser la gente en general (residentes y turistas), no la Subsecretaría. La app se plantea como alianza entre la Secretaría de Transporte, el Ministerio de Cultura y BA EcoBici.

**Decisiones de alcance**
- La proximidad a subte, tren, colectivo o Metrobús ya no se testea. Queda como supuesto de base.
- La presencia de ciclovía cercana pasa a ser variable de control.
- Ideas para una versión 2: disponibilidad en tiempo real, eventos y exposiciones temporales, gastronomía.

## (15/9) · Hipótesis anterior descartada

**Qué planteábamos.** Cliente: Subsecretaría de Planificación de la Movilidad y la Seguridad Vial (GCBA). Hipótesis central (H3): hay estaciones EcoBici subutilizadas (anclajes instalados que no se corresponden con sus viajes) y se explican por dos factores.
- **H1:** las estaciones a menos de 300 m de subte o Metrobús tienen más viajes que las demás.
- **H2:** las estaciones conectadas a una ciclovía tienen más viajes que las que no.

**Por qué la descartamos.** Se resolvía sola. Que haya más uso cerca del transporte público masivo es un patrón esperable de cualquier sistema de bicis públicas integrado a otros medios de transporte, así que no había nada real para testear. La hipótesis se consideró corroborada por definición y se usa como supuesto de base para pasar a un análisis más profundo.

**Qué datasets se usaban.** Estaciones de bicicletas (sistema viejo y nuevo), ciclovías, estaciones de tren, paradas de colectivo, Metrobús y subte.

**Qué aprendimos**
- Una hipótesis tiene que poder salir mal. Si el resultado es obvio de antemano, no sirve.
- Del cruce anterior nos quedamos con el uso de estaciones, ciclovías y comunas como unidad de análisis.

## (16/11) · Disponibilidad en vivo desde el feed público GBFS

**Qué decidimos.** Usar el feed público GBFS v3.0 de EcoBici (`buenosaires.publicbikesystem.net`) para mostrar las bicis y los anclajes libres de ahora, en lugar de la API de transporte con credenciales.

**Por qué.** No pide claves ni registro, así que no dependemos de que nos las entreguen; se actualiza cada ~20 segundos; y el `station_id` coincide con el número oficial de cada estación, por lo que el cruce es exacto. El feed no admite pedidos desde el navegador (CORS), por eso lo consulta una función de Netlify.

**Qué queda por saber.** 4 de las 110 estaciones de la zona no aparecen en el feed (probablemente fuera de servicio): para esas se muestra la estimación del modelo histórico y se avisa.

## (16/11) · Zona cubierta: gris fuera de los 12 barrios

**Qué hicimos.** En los mapas de Inicio, Explorar y "¿Desde dónde salís?" lo que queda fuera de los 12 barrios con datos se pinta de gris desaturado, para que se entienda que ahí no hay información. El borde punteado marca el límite.

**Cómo.** El límite sale del dataset oficial de barrios (datasets/barrios.geojson). Se recortó a los 12 barrios (app/data/zona_barrios.js). Los barrios vecinos no comparten vértices idénticos, así que se unieron en un solo contorno con la biblioteca polygon-clipping (una sola vez) para que la máscara no deje grietas. Este equipo no tiene Python: el recorte se hizo con Perl y la unión en el navegador; el script codigo/generar_zona_barrios.py hace el recorte con el mismo criterio y se puede correr donde haya Python (no genera el contorno unido).

## (16/11) · Ficha de actividad, fichas de hotspots, recolección mensual con IA y pasaporte cultural

**Ficha de actividad.** Al tocar una tarjeta de "Últimas fechas disponibles este mes" se abre la ficha de la actividad (no la del lugar): qué vas a ver, quiénes participan, desde cuándo, un dato curioso y el enlace oficial. Lo mismo para los 30 hotspots en la ficha del lugar. Si falta un dato, ese bloque no se muestra: nunca se inventa. Mientras una persona no lo verifique, se avisa "a confirmar".

**Recolección mensual.** El día 15 de cada mes un flujo de GitHub busca con IA (Groq + búsqueda web) las actividades del mes siguiente y abre un Pull Request en borrador con un informe de dudas; las personas encargadas lo revisan y recién al hacer merge se publica. Detalle y diagrama en datasets/flujo_actividades_mensual.md.

**Por qué Groq y por qué en borrador.** Se usa Groq porque es la clave que ya tenemos (no hace falta una cuenta paga de otro proveedor). Cada búsqueda web gasta mucho cupo del plan gratuito (100.000 a 160.000 tokens por llamada, con un límite de ~8.000 por minuto), por eso el flujo es lento pero entra en un día. Para las fichas fijas de los hotspots se usa Wikipedia y Wikidata, que gastan unos 700 tokens por lugar y dejan la fuente a la vista.

**Pasaporte cultural (pirueta).** Cada lugar visitado suma un sello en la página de su barrio, y los hotspots que faltan quedan como huecos para descubrir. Al terminar un recorrido, los sellos nuevos se estampan con una animación. Hoy los sellos usan una forma base (anillo e iniciales); los dibujos se cargan en app/img/sellos/<id>.png y se avisan en app/data/sellos.js.

## (17/11) · Rediseño visual según Figma "Pedalito 3.0"

**Qué cambió.** Solo lo visual: tipografía Plus Jakarta Sans (antes Inter), fondo lavanda claro con manchas de color suaves, botones y chips en píldora rosa, tarjetas blancas con borde fino, barra de navegación flotante blanca con la pestaña activa en círculo rosa, cajas de datos en azul y paneles con esquinas de 32 px. **No cambió** el contenido, el orden de las pantallas, los textos, ni ids y clases del código.

**Cómo está hecho.** Los colores y la fuente están como variables al inicio de `app/style.css` (`:root`). Los estilos de cada componente nuevo van en el bloque "REDISEÑO · Pedalito 3.0" al final del mismo archivo, que pisa a los de arriba; así se puede ajustar o revertir sin tocar el resto.

**Decisiones de accesibilidad.** El rosa de los botones es `#b5005e` (no el `#f90083` de la paleta) para que el texto blanco tenga contraste AA; el texto secundario es `#64748b` y ningún texto baja de 12 px. El nombre de cada pestaña de la barra queda oculto a la vista pero legible para lectores de pantalla.

**Lo que el Figma tiene y la app no (no se agregó).** Encabezado con logo y foto de perfil, foto de portada en la bienvenida, ítems de "Tus lugares frecuentes" y valoración con estrellas por lugar. Son contenido nuevo, no estilo; quedan para decidir aparte.
