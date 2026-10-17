# Cómo contribuir

¡Gracias por el interés! Este es un proyecto pequeño y cualquier ayuda es
bienvenida: mejoras en las respuestas, más líneas de prueba, correcciones de
datos o nuevos idiomas.

## Puesta en marcha

```bash
# Node.js >= 20
cd lambda && npm install && cd ..
cp .env.example .env
npm run preparar:offline
npm test
```

Para probar la skill sin cuenta de Amazon:

```bash
npm run simular -- --lanzar
npm run simular -- --intent ConsultarLlegadasIntent --texto "zorrilla 198"
```

## Antes de enviar cambios

1. **Pasa las pruebas:** `npm test` (deben pasar las 37).
2. **Regenera los ficheros derivados** si has tocado los datos o su
   generación:
   ```bash
   npm run datos:offline && npm run modelo && npm run iconos
   ```
3. **Mantén el estilo:** comentarios y nombres de dominio en español,
   `lambda/` en CommonJS y `tools/`/`tests/` en ESM (ver
   [Convenciones](#convenciones)).
4. **Añade una prueba** para cualquier cambio de comportamiento.

## Convenciones

- Los textos hablados van **solo** en `lambda/src/i18n/es.js`.
- Nada de dependencias nuevas en la Lambda si se puede evitar: el runtime ya
  incluye el AWS SDK v3 y el resto se resuelve con la librería estándar.
- Los ficheros de `lambda/data/` son **generados**: no los edites a mano.

## Pull requests

- Describe **qué** cambia y **por qué**.
- Si afecta a la voz de la skill, incluye un ejemplo de respuesta antes y
  después.
- Si es tu primera contribución, no te preocupes por el formato: ya lo
  puliremos entre todos.

## Código de conducta

Participar en este proyecto implica aceptar el
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
