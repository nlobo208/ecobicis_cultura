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
