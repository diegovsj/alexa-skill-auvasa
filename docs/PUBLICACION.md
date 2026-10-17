# Despliegue y publicación en Amazon

Guía para poner la skill en producción. El despliegue de una skill
**Alexa‑hosted** se hace con **`git push`**, no con `ask deploy` (la CLI avisa de
que las skills hospedadas se despliegan con git).

---

## 1. Requisitos

- Cuenta de **desarrollador de Amazon** (<https://developer.amazon.com/>).
- **ASK CLI v2** (`npm install -g ask-cli`) y **git** instalados.
- Los datos, el modelo de voz y los iconos generados:
  ```bash
  cd lambda && npm install && cd ..
  npm run preparar:offline   # o `npm run preparar` para descargar el GTFS
  npm test                   # 37/37
  ```

---

## 2. Crear la skill Alexa‑hosted

En la consola (<https://developer.amazon.com/alexa/console/ask>) → **Create
Skill**:

- **Tipo:** Custom.
- **Hosting:** **Alexa‑Hosted (Node.js)**.
- **Idioma por defecto:** **Spanish (ES)**.
- Plantilla: *Start from scratch*.

> ⚠️ Evita `ask new` para crear skills hospedadas: la CLI fija el locale a
> `en-US`, y esta skill es solo `es-ES`. Créala en la consola y tráela con
> `ask init --hosted-skill-id`.

Anota el **Skill ID** (`amzn1.ask.skill.…`).

---

## 3. Clonar el proyecto hospedado

```bash
ask configure                      # login con tu cuenta de desarrollador
ask init --hosted-skill-id <SKILL_ID>
# cuando pregunte la carpeta, escribe por ejemplo: auvasa-hosted
```

Esto crea un repositorio git con las ramas:

- **`master`** → etapa de **desarrollo**.
- **`prod`** → etapa **live**.
- **`dev`** → código guardado en la consola.

---

## 4. Copiar las fuentes

```bash
cd <ruta-del-repo>
npm run hospedada -- <ruta-del-proyecto-hospedado>
```

Copia `skill-package/` (ficha, modelo e iconos) y `lambda/` (código, datos y
`package.json`), sin `.env` ni `node_modules`.

---

## 5. Desplegar a desarrollo

```bash
cd <ruta-del-proyecto-hospedado>
git add -A
git commit -m "…"
git push origin master        # master -> desarrollo
```

Cada *push* despliega **a la vez** el código de la Lambda, el modelo de voz y el
manifiesto. El resultado se consulta por SMAPI:

```bash
SKILL=<SKILL_ID>
ask smapi get-skill-status -s $SKILL        # hostedSkillDeployment: SUCCEEDED
ask smapi get-skill-manifest -s $SKILL -g development
```

### Probar sin navegador

La pestaña *Test* de la consola es la forma habitual. También puedes invocar la
Lambda directamente:

```bash
ask smapi invoke-skill -s $SKILL --endpoint-region EU \
  --skill-request-body 'file:/tmp/request.json'
```

`request.json` es un *skill request* normal, pero con
`context.System.application.applicationId` igual al Skill ID. Con `curl`:

```bash
curl -X POST "https://api.amazonalexa.com/v2/skills/$SKILL/stages/development/invocations" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"endpointRegion":"EU","skillRequest":{"body":{ … }}}'
```

---

## 6. Requisitos del `skill.json`

Estos detalles hacen que el despliegue funcione (si faltan, la skill se queda
sin endpoint o el manifiesto se rechaza):

- `privacyAndCompliance` va al nivel de **`manifest`** (hermano de
  `publishingInformation`), no dentro de él.
- `apis.custom.endpoint` debe incluir el ARN de la Lambda hospedada **con
  sufijo de versión/alias** (`…:Release_0`), en las regiones EU/NA/FE.
- Los *slot types* del modelo usan el formato anidado de SMAPI:
  `{"name": {"value": …, "synonyms": […]}}`.
- No incluyas `category`: la categoría se elige en la consola de distribución.
- El runtime de Alexa‑hosted es **Node.js 16.x**: `lambda/package.json` usa
  `"engines": {"node": ">=16"}` y el código no depende de `fetch` global.

> Si haces un *fork* para tu propia skill, cambia los ARN de
> `apis.custom.endpoint` por los de **tu** Lambda hospedada (los descarga
> `ask init` en el `skill.json` del proyecto clonado).

---

## 7. Ficha de la tienda y certificación

En **Distribution**:

- **Nombre, descripción, frases de ejemplo y palabras clave:** los de
  `skill-package/skill.json`.
- **Categoría:** *Travel & Transportation → Public Transportation*.
- **Iconos:** 108×108 y 512×512 PNG (`skill-package/assets/`).
- **Privacidad:** `usesPersonalInfo: false`, `isChildDirected: false`,
  `containsAds: false`, `allowsPurchases: false`.
- **Política de privacidad y términos de uso:** publica
  [`privacidad.md`](privacidad.md) y [`terminos.md`](terminos.md) (por ejemplo
  con GitHub Pages) y pega sus URL.
- **Disponibilidad:** la skill está pensada para todo el mundo
  (`isAvailableWorldwide: true`). Puedes limitarla a España si lo prefieres.
- **Distribución automática de locales:** déjala desmarcada si solo tienes
  `es-ES`.

Repasa la lista de certificación:

- [ ] Todos los intents responden sin errores.
- [ ] Cancel, Stop y Help implementados.
- [ ] Funciona en dispositivos sin pantalla.
- [ ] Sin contenido ofensivo, publicidad ni compras.
- [ ] El nombre de invocación funciona (`auvasa`).
- [ ] La respuesta llega en menos de ~8 s.
- [ ] Instrucciones de prueba claras.
- [ ] Atribución de datos correcta (AUVASA, CC BY 3.0 ES).
- [ ] Datos actualizados y ficha revisada.

Pulsa **Submit for review**.

---

## 8. Pasar a live

Cuando la skill esté certificada, publica el código en la etapa live:

```bash
cd <ruta-del-proyecto-hospedado>
git checkout prod
git merge master
git push
```

- Los cambios **solo de código** no requieren recertificación (Amazon ejecuta
  pruebas de seguridad automáticas).
- Los cambios del **modelo de voz** sí requieren volver a certificar.

---

## 9. Mantenimiento de los datos

Hay que distinguir dos cosas:

- **Tiempo real** (`tripupdate`): se consulta **en cada petición**; los minutos
  siempre están frescos. No hay que regenerar nada.
- **GTFS estático** (paradas, líneas, horarios y calendario): se descarga y se
  procesa a `lambda/data/*.json`. Es lo que **caduca** y hay que regenerar.

El proceso es **manual** (no hay automatización). Conviene hacerlo **cada 2‑3
meses y, sobre todo, antes de que caduque el calendario**. Si se caduca, la
skill sigue respondiendo (usa un «día equivalente»), pero los horarios pueden no
ser exactos.

Pasos:

```bash
# 1) Regenerar datos + modelo de voz + iconos
npm run datos && npm run modelo && npm run iconos

# 2) Comprobar que todo sigue bien
npm test

# 3) Copiar y desplegar
npm run hospedada -- <ruta-del-proyecto-hospedado>
cd <ruta-del-proyecto-hospedado>
git add -A && git commit -m "Datos $(date +%F)"
git push origin master
```

> Para saber hasta cuándo llega el calendario generado, consulta el rango de
> fechas en [`DATOS.md`](DATOS.md) §7 o el `calendario.json` de `lambda/data/`.

---

## 10. Problemas frecuentes

| Síntoma | Causa / solución |
| --- | --- |
| `ask deploy` responde *«Alexa hosted skills can be deployed by performing a git push»* | Es lo normal: usa `git push` a `master`. |
| El modelo da `400 MALFORMED_INPUT` | Los *slot types* deben usar el formato anidado; regenera con `npm run modelo`. |
| El manifiesto falla por `privacyAndCompliance` | Debe estar al nivel de `manifest`. |
| La skill responde *«No endpoint was found»* | Falta `apis.custom.endpoint` en el manifiesto. |
| `hostedSkillDeployment: FAILED` | Revisa `engines: >=16` y que el manifiesto conserve el endpoint. |
| El tiempo real no funciona | El runtime es Node 16 (sin `fetch` global); el código ya incluye un respaldo `http`/`https`. |
| Las llegadas son de otro día | El calendario ha caducado: `npm run datos`. |
| La ficha dice *«An Example Phrase is missing for the es‑ES locale»* | El manifiesto ya incluye frases de ejemplo para `es-ES`. Refresca la consola (Ctrl+F5), comprueba que el selector de idioma es `es-ES`, revisa el campo **Example Phrases** y vuelve a guardar. |
| La ficha pide algo y no se ve qué falta | Abre las herramientas del navegador (F12) → **Network** → pulsa **Save** → mira la respuesta de la petición en rojo: indica el campo exacto. |
