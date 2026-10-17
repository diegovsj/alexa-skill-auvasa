# Arquitectura del código

Mapa técnico del proyecto. Para la puesta en marcha y el estado, consulta
[`../README.md`](../README.md).

---

## 1. Visión general

```
                         skill-package/                    lambda/
     ┌─────────────────────────────────────┐   ┌───────────────────────────────┐
     │ skill.json        (ficha/manifiesto) │   │ index.js  (entrada de Lambda) │
     │ interactionModels/custom/es-ES.json  │──▶│ src/handlers/*  (intents)     │
     │ assets/*.png      (iconos)           │   │ src/services/*  (lógica)      │
     └─────────────────────────────────────┘   │ src/util/*      (apoyo)       │
                    ▲                           │ src/i18n/es.js  (textos)      │
                    │ generado por              │ data/*.json     (GTFS)        │
                    │                           └───────────────────────────────┘
        tools/build-interaction-model.mjs                        │
                    ▲                                            ▼
        tools/build-gtfs.mjs  ◀── GTFS oficial AUVASA      GTFS-Realtime (protobuf)
                    ▲
        tools/build-icons.mjs
```

- **`skill-package/`** es lo que Amazon publica: el manifiesto, el modelo de voz
  (intents, slots, frases) y los iconos.
- **`lambda/`** es el backend que responde a cada petición de Alexa.
- **`tools/`** genera los ficheros derivados a partir de los datos de AUVASA.

---

## 2. Flujo de una petición

1. Alexa envía un `IntentRequest` con los slots ya resueltos (por ejemplo
   `parada = "Calle Hernando de Acuña 1 esquina Mateo Seoane S."` y
   `linea = "8"`).
2. `lambda/index.js` construye la skill (una vez por contenedor) y la invoca.
3. `src/handlers/index.js` prueba los handlers **en orden**; el primero cuyo
   `canHandle()` devuelve `true` responde.
4. El handler usa `src/handlers/comun.js` para resolver la parada y
   `src/services/horarios.js` para calcular las llegadas.
5. Los textos se toman de `src/i18n/es.js` y se devuelven con
   `responseBuilder.speak(...)`.

### Orden de los handlers

```
Lanzamiento → Ayuda → ConsultarLlegadas → ConsultarLineasEnParada
→ ConsultarParadasDeLinea → GuardarParadaFavorita → ConsultarParadaFavorita
→ Sí → No → Salir → Fallback → FinSesión   (y ErrorHandler al final)
```

El orden importa: si dos `canHandle` coincidieran, gana el primero.

---

## 3. Servicios

### `catalogo.js`

Índices memoizados sobre `lambda/data`:

- `paradaPorId` / `paradaPorCodigo` / `lineaPorCodigo`.
- `buscarParadas(consulta)`: primero intenta el **número de parada**; si no,
  puntúa todas las paradas con `puntuar()` y devuelve las mejores.
- `lineasEnParada(id)`: líneas distintas que pasan por una parada.
- `recorridosDeLinea(linea)`: paradas por sentido (ida/vuelta).
- `serviciosActivos(fecha)`: servicios del calendario para una fecha, con
  respaldo por «día equivalente».

### `horarios.js` (el núcleo)

`proximasLlegadas(paradaId, {linea, limite, horizonteSegundos, referencia})`:

1. Toma los servicios activos de hoy **y de ayer** (para viajes que cruzan
   medianoche).
2. Recorre las salidas de la parada, filtra por línea si se pidió y descarta
   las que ya han pasado (con un margen de 2 min).
3. Ordena por tiempo restante.
4. Aplica el **tiempo real** (`aplicarTiempoReal`) y descarta cancelados.
5. Devuelve las `limite` primeras llegadas (por defecto 3).

La parámetro `referencia` permite fijar el instante de cálculo en las pruebas.

### `gtfsRealtime.js` + decodificador

- `obtenerIndice()`: descarga el feed, lo decodifica y construye un índice
  `trip_id → {puntos, minSecuencia, maxSecuencia, relacion}`, con caché en
  memoria y *backoff* ante fallos. **Nunca lanza**: si algo va mal devuelve
  `null` y la skill usa el horario teórico.
- `protobuf.js`: lector genérico de *varints*, campos y mensajes anidados.
- `gtfsRealtimeDecoder.js`: interpreta el `FeedMessage` de GTFS‑RT.

---

## 4. Utilidades

| Fichero | Funciones clave |
| --- | --- |
| `util/tiempo.js` | `ahora()` (Europe/Madrid, con `AUVASA_REFERENCIA`), `epochDiaServicio()`, `formatearHora()`, `sumarDias()`, `diaSemana()`. |
| `util/texto.js` | `normalizar()`, `palabras()`, `puntuar()`, `escaparSsml()`. |
| `util/voz.js` | `describirLlegadas()`, `enumerarParadas()`, `nombrarLinea()`. |
| `data/almacen.js` | Carga memoizada de los JSON. |
| `persistence/dynamodb.js` | `PersistenciaMemoria` (local/por defecto) y `PersistenciaDynamoDB` (AWS SDK v3, carga perezosa). |

---

## 5. Textos e idiomas

Todos los textos hablados están en `src/i18n/es.js`. Añadir un idioma consiste
en:

1. Duplicar `src/i18n/es.js` (p. ej. `en.js` o `es-MX.js`).
2. Generar el modelo de voz del locale:
   `node tools/build-interaction-model.mjs es-ES es-MX`.
3. Generar iconos: `AUVASA_LOCALES=es-ES,es-MX npm run iconos`.
4. Añadir el bloque del locale a `skill-package/skill.json`.
5. Elegir el fichero de textos según el locale de la petición.

La lógica de `resolverParada` y de horarios **no** depende del idioma.

---

## 6. Configuración de la ASK CLI

`ask-resources.json` declara un perfil `default` con
`"type": "@ask-cli/hosted-skill-deployer"`: la skill se hospeda en
**Alexa‑hosted** (Lambda + DynamoDB + CodeCommit gestionados por Amazon, plan
gratuito). Los campos `skillMetadata.src` y `code.default.src` apuntan a
`./skill-package` y `./lambda`.

---

## 7. Pruebas

`npm test` ejecuta `node --test tests/*.test.mjs`:

- **`datos.test.mjs`** — integridad de los JSON (contadores, índices, etc.).
- **`gtfs-realtime.test.mjs`** — el decodificador protobuf, con feeds
  sintéticos construidos en el propio test.
- **`horarios.test.mjs`** — búsqueda de paradas y cálculo de llegadas a una
  hora fija.
- **`skill.test.mjs`** — extremo a extremo: invoca la Lambda real con eventos
  de Alexa y comprueba el texto hablado (incluye la consulta por número de
  parada y la parada favorita).

Las pruebas fijan `AUVASA_RT_DISABLED=1` y `AUVASA_REFERENCIA` para ser
deterministas y no depender de la red ni del reloj.
