# AUVASA — Skill de Alexa para los autobuses urbanos de Valladolid

<p align="center">
  <img src="docs/images/logo-512.png" alt="AUVASA" width="200">
</p>

Skill de voz que consulta **cuándo pasa el próximo autobús de AUVASA** por una
parada, qué líneas paran en ella, el recorrido de una línea o la parada favorita
del usuario. Combina el **GTFS estático** oficial con el **GTFS‑Realtime** para
tener en cuenta los retrasos.

> Proyecto independiente, sin relación con AUVASA ni con el Ayuntamiento de
> Valladolid. Los datos son públicos y se publican bajo licencia
> [CC BY 3.0 ES](NOTICE). El código es **MIT** ([LICENSE](LICENSE)) y las
> contribuciones son bienvenidas ([CONTRIBUTING.md](CONTRIBUTING.md)).

---

## ¿Qué puede hacer?

> **Nombre de invocación:** «**valla bus**». El nombre de la skill es *AUVASA*,
> pero se abre diciendo «Alexa, abre valla bus».

| Pregunta de ejemplo | Qué responde |
| --- | --- |
| «Alexa, abre valla bus» | Bienvenida y ayuda inicial |
| «¿Cuándo pasa el próximo autobús en la parada Paseo Zorrilla 198?» | Próximos autobuses con línea, destino y minutos |
| «¿Cuánto le queda a la línea 8 para llegar a la parada 550?» | Llegadas de esa línea (parada por **número**) |
| «¿Qué líneas pasan por Plaza Mayor?» | Líneas que paran en la parada |
| «¿Por qué paradas pasa la línea C1?» | Recorrido de la línea |
| «Guarda Paseo Zorrilla 198 como mi parada favorita» | Guarda la parada para el usuario |
| «¿Cuándo pasa el próximo autobús en mi parada?» | Llegadas a la parada favorita |

La información en tiempo real se aplica automáticamente cuando está disponible.
Si el feed falla, la skill responde igualmente con el horario teórico.

---

## Estado

- **Versión:** `0.1.0`.
- **Pruebas:** `npm test` ejecuta **37 pruebas** (datos, GTFS‑Realtime, horarios
  y simulación completa de la skill) y todas pasan.
- **Desplegada** en la etapa de desarrollo de una skill *Alexa‑hosted*.
- **Publicación en la tienda:** pendiente de certificación.

---

## Cómo funciona

```
        Usuario              Alexa (reconocimiento de voz)
           │                          │
           ▼                          ▼
   "¿cuándo pasa el 8        Intención + slots (parada, linea)
    en la parada 550?"                │
                                      ▼
                        AWS Lambda (Node.js, skill-package + lambda/)
                                      │
              ┌───────────────────────┴────────────────────────┐
              ▼                                                ▼
   lambda/data/*.json (GTFS estático                 Feed GTFS‑Realtime
   ya procesado: paradas, líneas, horarios)          (protobuf, en memoria)
              └───────────────────────┬────────────────────────┘
                                      ▼
                    Respuesta hablada con los próximos autobuses
```

- El **modelo de voz** (`skill-package/interactionModels/custom/es-ES.json`) y
  los **iconos** se generan a partir de los datos reales, de modo que el
  vocabulario de Alexa siempre está sincronizado con la red de AUVASA.
- La **Lambda** no depende de servicios externos de pago: usa el AWS SDK v3 que
  ya viene en el runtime y solo escribe en DynamoDB si Alexa lo ha creado.

---

## Requisitos

- **Node.js ≥ 20** para las herramientas de desarrollo (probado con 22).
- **Cuenta de desarrollador de Amazon** para desplegar y publicar.
- **ASK CLI v2** (`npm install -g ask-cli`) para trabajar con el proyecto.
- *(Opcional)* Cuenta de AWS si prefieres hospedar tú la Lambda en lugar de
  usar **Alexa‑hosted** (gratuito y recomendado).

Instalación de la ASK CLI:

```bash
npm install -g ask-cli
ask --version
ask configure   # inicio de sesión con tu cuenta de desarrollador de Amazon
```

---

## Puesta en marcha

```bash
git clone git@github.com:diegovsj/alexa-skill-auvasa.git
cd alexa-skill-auvasa

# 1. Dependencias de la Lambda (el resto de herramientas no necesita nada)
cd lambda && npm install && cd ..

# 2. Variables de entorno (opcional en local: hay valores por defecto)
cp .env.example .env

# 3. Generar los datos y el modelo de voz (los iconos ya vienen en el repo)
npm run datos:offline && npm run modelo   # usa el GTFS cacheado en tools/gtfs/
# npm run datos                            # descarga el GTFS más reciente de AUVASA

# 4. Ejecutar las pruebas
npm test

# 5. Probar la skill sin cuenta de Amazon
npm run simular -- --lanzar
npm run simular -- --intent ConsultarLlegadasIntent --texto "zorrilla 198"
npm run simular -- --intent ConsultarLlegadasIntent --parada "550" --linea 8
```

### Scripts disponibles

| Comando | Para qué sirve |
| --- | --- |
| `npm run datos` / `npm run datos:offline` | Descarga y procesa el GTFS de AUVASA |
| `npm run modelo` | Regenera el modelo de voz a partir de los datos |
| `npm run iconos` | Regenera (opcional) unos iconos PNG dibujados por código. **Sustituyen** los iconos actuales de `assets/` |
| `npm run preparar` / `npm run preparar:offline` | Datos + modelo + iconos, en orden |
| `npm test` | Suite de pruebas (`node:test`) |
| `npm run simular -- …` | Envía peticiones falsas a la Lambda en local |
| `npm run hospedada -- <ruta>` | Copia las fuentes a un proyecto Alexa‑hosted |

---

## Estructura del repositorio

```
.
├── README.md                  # Este fichero
├── ask-resources.json         # Configuración de la ASK CLI (skill Alexa-hosted)
├── LICENSE                    # Licencia MIT (código)
├── NOTICE                     # Autoría y licencias (datos CC BY 3.0 ES)
├── SECURITY.md                # Política de seguridad y privacidad
├── .env.example               # Plantilla de variables de entorno
├── skill-package/             # Lo que se publica en Amazon
│   ├── skill.json             # Ficha y manifiesto de la skill
│   ├── assets/                # Iconos de la tienda (108×108 y 512×512)
│   └── interactionModels/custom/es-ES.json   # Modelo de voz generado
├── lambda/                    # Backend (AWS Lambda)
│   ├── index.js               # Punto de entrada
│   ├── data/                  # GTFS ya procesado en JSON (generado)
│   └── src/                   # Handlers, servicios y utilidades
├── tools/                     # Herramientas de desarrollo (ESM)
│   ├── build-gtfs.mjs         # Descarga y normaliza el GTFS
│   ├── build-interaction-model.mjs
│   ├── build-icons.mjs
│   └── simular.mjs            # Simulador local de la skill
├── tests/                     # Pruebas automáticas
└── docs/                      # Documentación detallada
    ├── ARQUITECTURA.md        # Cómo está organizado el código
    ├── DATOS.md               # Fuentes, modelo GTFS y licencia
    ├── PUBLICACION.md         # Despliegue y certificación
    ├── privacidad.md          # Política de privacidad (para la tienda)
    └── terminos.md            # Términos de uso (para la tienda)
```

---

## Datos y licencia

- **Fuente:** portal de datos abiertos de AUVASA —
  <https://www.auvasa.es/empresa/datos-abiertos/>.
- **GTFS estático:** `http://212.170.201.204:50080/GTFSRTapi/api/GTFSFile`
- **GTFS‑Realtime:** `…/api/tripupdate` (paso de autobuses), `…/api/vehicleposition`,
  `…/api/alert`.
- **Licencia de los datos:** Creative Commons **CC BY 3.0 ES**.

Al reutilizar estos datos hay que citar la fuente:

> Datos: AUVASA (Autobuses Urbanos de Valladolid), portal de datos abiertos,
> CC BY 3.0 ES.

**El código** se distribuye bajo licencia **MIT** ([LICENSE](LICENSE)). La
licencia MIT afecta al código, no a los datos. La nota completa de autoría y
licencias está en [NOTICE](NOTICE).

### ¿Qué implica la licencia MIT?

MIT es una licencia **permisiva**: cualquiera puede usar, copiar, modificar y
redistribuir el código (incluso comercialmente) siempre que conserve el aviso de
copyright y la licencia. Se ofrece **«tal cual»**, sin garantías, lo que limita
la responsabilidad del autor. No obliga a publicar los cambios ni a pagar nada.
No afecta a la licencia de los datos (CC BY 3.0 ES) ni concede derechos sobre
marcas como «AUVASA».

El uso de los datos abiertos de AUVASA está permitido por su licencia CC BY 3.0
ES (incluida la atribución). Que la skill sea gratuita es una decisión del autor,
no una obligación de la licencia.

---

## Documentación

- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — mapa del código.
- [docs/DATOS.md](docs/DATOS.md) — de dónde salen los datos y cómo se procesan.
- [docs/PUBLICACION.md](docs/PUBLICACION.md) — despliegue y certificación.
- [docs/privacidad.md](docs/privacidad.md) y [docs/terminos.md](docs/terminos.md)
  — textos legales para la ficha de la tienda.
- [CONTRIBUTING.md](CONTRIBUTING.md) — cómo contribuir.
- [CHANGELOG.md](CHANGELOG.md) — historial de cambios.

---

## Contribuir

Las *pull requests* y los *issues* son bienvenidos. Antes de enviar cambios:

1. Pasa las pruebas: `npm test` (37/37).
2. Regenera los ficheros derivados si tocas los datos:
   `npm run datos:offline && npm run modelo` (los iconos no dependen de los
   datos, así que no hace falta regenerarlos).
3. Mantén el estilo: comentarios y nombres de dominio en español, `lambda/` en
   CommonJS y `tools/`/`tests/` en ESM.
4. Añade una prueba para cualquier cambio de comportamiento.

Detalles en [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Aviso legal

Este proyecto es una iniciativa **independiente**. «AUVASA» y «Valladolid» se
mencionan únicamente para identificar el servicio de transporte público cuyos
datos abiertos se consultan. No está afiliado, patrocinado ni respaldado por
AUVASA, por el Ayuntamiento de Valladolid ni por Amazon.
