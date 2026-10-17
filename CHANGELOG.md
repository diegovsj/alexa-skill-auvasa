# Historial de cambios

El formato sigue, de forma informal, las recomendaciones de
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
El proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- Consulta de llegadas **por número de parada** («la parada 550»): el número
  (`stop_code`) se añade como sinónimo del slot `PARADA` y hay frases nuevas
  para combinarlo con una línea («¿cuánto le queda a la línea 8 para llegar a
  la parada 550?»).
- Adaptador de persistencia **en memoria** (`PersistenciaMemoria`) como opción
  por defecto cuando no hay DynamoDB, para que la skill nunca falle al leer
  atributos persistentes.
- Escape de caracteres XML/SSML (`escaparSsml`) en los textos que repiten lo
  que ha dicho el usuario.
- Pruebas de extremo a extremo de la skill (`tests/skill.test.mjs`) contra la
  Lambda real.
- Documentación: `README.md`, `docs/DATOS.md`, `docs/ARQUITECTURA.md`,
  `docs/PUBLICACION.md`, `docs/privacidad.md`, `docs/terminos.md`,
  `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` y `SECURITY.md`.
- Despliegue en una skill **Alexa‑hosted** (código, modelo de voz y manifiesto).
- Plantilla de entorno `.env.example` y loader de `.env` sin dependencias
  (`tools/lib/dotenv.mjs`).
- Configuración de la ASK CLI (`ask-resources.json`, Alexa‑hosted).
- Variable `AUVASA_REFERENCIA` para fijar el instante de cálculo en pruebas.

### Cambiado

- **Despliegue**: la skill está publicada en la **etapa de desarrollo** de una
  skill *Alexa‑hosted*. El despliegue se hace con `git push` a la rama `master`
  (Alexa‑hosted **no** usa `ask deploy`).
- Compatibilidad con el runtime **Node.js 16** de Alexa‑hosted: `gtfsRealtime`
  usa `fetch` si el runtime lo trae y, si no, un respaldo con `http`/`https`;
  `lambda/package.json` pasa a `"engines": {"node": ">=16"}`.
- **Conversación más breve y natural**: al abrir la skill con parada favorita se
  dan directamente las llegadas (con un «Hola, bienvenido a AUVASA»); la
  cabecera dice el número y el nombre de la parada; el aviso de tiempo real solo
  aparece cuando el feed **no** está disponible; las llegadas se agrupan por
  línea y destino; y los mensajes de error son más cortos.
- El **recorrido de una línea** se recorta a 8 paradas por sentido y termina con
  «y hay más paradas»; con «recorrido completo de la línea X» se enumeran todas.
- Consulta de una **línea concreta en la parada favorita** («¿cuándo pasa el 8 en
  mi parada?») y aviso claro cuando la línea no pasa por esa parada.
- **Línea favorita** (opcional), además de la parada favorita: se guarda,
  consulta y olvida, y al abrir la skill se usa si pasa por la parada favorita.
- Al añadir la línea favorita se avisa si no pasa por la parada favorita.
- El **nombre** de la skill pasa a **«Bus Valladolid (AUVASA)»** y el saludo a
  «Bienvenido a Bus Valladolid (AUVASA)».
- Más **formulaciones** reconocidas («añade», «agrega … a favoritos», «… a mi
  favorita», «a mis favoritas»…).
- Al consultar una parada o una línea, si faltan favoritos la skill **ofrece
  guardarlos** (la parada, la línea o ambas, según lo que falte).
- El handler de salida cierra la sesión explícitamente.
- El simulador y las pruebas desenvuelven el texto SSML del SDK.

### Corregido

- El generador del modelo de voz escribía los *slot types* en el formato plano
  de la CLI v1; ahora usa el formato anidado que exige SMAPI
  (`{"name": {"value": …, "synonyms": […]}}`), que era rechazado con
  `400 MALFORMED_INPUT`.
- `skill.json`: `privacyAndCompliance` pasa al nivel de `manifest` y se restaura
  `apis.custom.endpoint` (sin él, la skill se quedaba sin endpoint).
- La skill ya no lanza al consultar la parada favorita sin DynamoDB
  configurado.
- Codificación de *varints* negativos en las pruebas del decodificador
  GTFS‑Realtime.

## [0.1.0] — 2026-10-16

### Añadido

- Primera versión funcional: próximas llegadas, líneas de una parada, recorrido
  de una línea y parada favorita.
- Datos GTFS estático y GTFS‑Realtime oficiales de AUVASA.
- Modelo de voz e iconos generados a partir de los datos.
- Simulador local y suite de pruebas.
