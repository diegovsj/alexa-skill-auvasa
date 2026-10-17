# Datos: origen, modelo y licencia

Todo lo que la skill sabe sobre la red de AUVASA sale de aquí. Este documento
explica **de dónde vienen los datos**, **cómo se transforman** y **qué
particularidades** tienen, para que quien los use no se lleve sorpresas.

---

## 1. Fuente oficial

AUVASA publica sus datos abiertos en:

- Página: <https://www.auvasa.es/empresa/datos-abiertos/>
- **GTFS estático** (ZIP): `http://212.170.201.204:50080/GTFSRTapi/api/GTFSFile`
- **GTFS‑Realtime – paso de autobuses** (protobuf):
  `http://212.170.201.204:50080/GTFSRTapi/api/tripupdate`
- **GTFS‑Realtime – posición de vehículos**:
  `http://212.170.201.204:50080/GTFSRTapi/api/vehicleposition`
- **GTFS‑Realtime – avisos/alertas**: `http://212.170.201.204:50080/GTFSRTapi/api/alert`

Los cuatro endpoints respondían **HTTP 200** en la comprobación del
2026‑10‑16.

> **Descartado:** el portal CKAN `datosabiertos.valladolid.es` (y su API)
> devuelve **HTTP 401** con autenticación Basic y no es accesible; no se usa.

### Otros datos de movilidad (no usados aún)

- **Bicicletas públicas BIKI (GBFS):**
  `https://valladolid.publicbikesystem.net/customer/gbfs/v2/gbfs.json`.
  Podría usarse para una futura ampliación («¿queda alguna bici en…?»).

---

## 2. Licencia y atribución

Los datos de AUVASA se publican bajo **Creative Commons CC BY 3.0 ES**.

Cita recomendada al reutilizarlos:

> Datos: AUVASA (Autobuses Urbanos de Valladolid), portal de datos abiertos,
> CC BY 3.0 ES.

El **código** de este repositorio es MIT; la licencia de los datos es aparte y
exige indicar la autoría.

---

## 3. Cómo se generan los datos

```bash
npm run datos            # descarga el GTFS y escribe lambda/data/*.json
npm run datos:offline    # reutiliza tools/gtfs/gtfs.zip (caché local)
```

`tools/build-gtfs.mjs` descarga el ZIP, extrae los ficheros con un lector ZIP
propio (no requiere `unzip`) y genera los JSON. Ficheros GTFS que se leen:
`agency.txt`, `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt` y
`calendar_dates.txt`.

> Existe además `tools/build-interaction-model.mjs`, que **no** forma parte de
> este paso: genera el modelo de voz a partir de los JSON ya creados
> (`npm run modelo`). Si cambias algo aquí, acuérdate de regenerar el modelo.

---

## 4. Modelo de los JSON generados

Todos los ficheros están en `lambda/data/`. Los índices se guardan como
**posiciones en un array** (no como IDs) para ahorrar espacio.

### `lineas.json` — `Array<Linea>`

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `id` | string | `route_id` del GTFS |
| `codigo` | string | Nombre corto visible (`1`, `C1`, `LP`…) |
| `nombre` | string | Nombre largo (`route_long_name`) |
| `color` | string | Color de la línea (`RRGGBB`) |
| `colorTexto` | string | Color del texto sobre la línea |
| `tipo` | number | `route_type` (3 = autobús) |

### `paradas.json` — `Array<Parada>`

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `id` | string | `stop_id` del GTFS |
| `codigo` | string | Número de parada visible en la marquesina (`stop_code`) |
| `nombre` | string | Nombre oficial, con espacios normalizados |
| `buscable` | string | Nombre normalizado (sin acentos ni signos) para buscar |
| `lat`, `lon` | number | Coordenadas (redondeadas) |

### `viajes.json` — `Array<Viaje>`

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `t` | string | `trip_id` del GTFS |
| `l` | number | Índice de la línea en `lineas.json` |
| `s` | number | Índice del servicio en `calendario.json.servicios` |
| `d` | string | Destino (cabecera) ya «limpio» para leerlo en voz alta |
| `dir` | number | Sentido (`direction_id`) |

### `llegadas.json` — `{ [stop_id]: Array<[iV, segundos, secuencia]> }`

Cada parada guarda sus `stop_times`, **ordenados por hora**. La tupla es
`[índice de viaje, segundos desde medianoche, stop_sequence]`. Se usan valores
`>= 86400` para los viajes que terminan después de medianoche.

### `trayectos.json` — `{ [iV]: Array<[secuencia, iP, segundos]> }`

Inverso de `llegadas`: para cada viaje, la lista ordenada de paradas con su
segundo teórico. **Es clave para el tiempo real** (ver §5).

### `calendario.json` — `{ servicios, serviciosPorFecha }`

- `servicios`: `Array<string>` con los `service_id`.
- `serviciosPorFecha`: `{ "AAAAMMDD": [índiceServicio, …] }`, ya resuelto el
  `exception_type` (1 añade, 2 elimina).

> En el GTFS de AUVASA **`calendar.txt` viene vacío**: el calendario se construye
> solo con `calendar_dates.txt`.

### `meta.json`

Metadatos del build: fecha de generación, endpoint de origen, licencia y
contadores (`lineas`, `paradas`, `paradasConServicio`, `viajes`, `servicios`,
`fechas`, `stopTimes`, `stopTimesDescartadas`).

---

## 5. Tiempo real: qué trae y qué no

El feed `tripupdate` de AUVASA tiene **particularidades importantes**:

- Incluye `stop_sequence`, pero **nunca `stop_id`**.
- Incluye tiempos **absolutos** (`StopTimeEvent.time`, epoch en segundos), pero
  **no `delay`**.
- Puede traer `TripDescriptor.schedule_relationship = CANCELED`.

Por eso el cálculo del retraso es:

```
retraso = tiempoTiempoReal − (epochDelDíaDeServicio + segundosTeóricosDelTrayectos)
```

donde `segundosTeóricosDelTrayectos` se obtiene de `trayectos.json` para el par
(viaje, secuencia). Los retrasos con valor absoluto mayor de una hora se
descartan por considerarse erróneos.

El feed se descarga y **se cachea en memoria del contenedor** unos segundos
(`AUVASA_RT_TTL_MS`, 20 s por defecto). Si falla, se aplica un *backoff*
(`AUVASA_RT_BACKOFF_MS`) y la skill responde con el horario teórico.

El decodificador protobuf está **escrito a mano**
(`lambda/src/services/protobuf.js` y `gtfsRealtimeDecoder.js`) para no añadir
dependencias y arrancar rápido.

---

## 6. Detalles de calidad de los datos

- **Destinos abreviados.** Los `trip_headsign` de AUVASA vienen en mayúsculas y
  con abreviaturas (`B. EspaÑA`, `C. Contiendas`, `Pgno. S. Crist`…). El mapa
  `DESTINOS` de `tools/build-gtfs.mjs` los expande a formas pronunciables.
  Si aparece una abreviatura nueva, añádela ahí y regenera.
- **Nombres de parada.** Se normalizan los espacios repetidos. La búsqueda
  difusa (`puntuar`) tolera acentos, mayúsculas, singular/plural y palabras
  truncadas por el reconocimiento de voz.
- **Números de parada.** El `stop_code` (3–5 dígitos) se añade como sinónimo en
  el slot `PARADA`, así que «la parada 550» resuelve a la parada correcta. No
  hay colisión entre códigos de parada y códigos de línea.

---

## 7. Caducidad y actualización

El calendario de la última generación cubre del **2026‑10‑16 al 2026‑12‑27**.

`catalogo.serviciosActivos()` tiene una red de seguridad: si la fecha pedida no
está en el calendario, busca el **mismo día de la semana** en las tres semanas
anteriores y, si no, el día conocido más cercano. Esto evita quedarse sin
servicio, pero **los horarios solo son exactos dentro del rango descargado**.

➡️ **Regenera los datos periódicamente**:

```bash
npm run datos && npm run modelo && npm run iconos
```

y vuelve a desplegar con `git push` (ver [`PUBLICACION.md`](PUBLICACION.md)).
