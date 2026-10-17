/**
 * preparar-hospedada.mjs
 *
 * Copia las fuentes de este repositorio (skill-package y lambda) dentro de un
 * proyecto de skill **Alexa-hosted** ya creado y clonado con la ASK CLI.
 *
 * Se usa después de crear la skill hospedada:
 *   ask init --hosted-skill-id amzn1.ask.skill.XXXX   (clona el proyecto)
 *   node tools/preparar-hospedada.mjs ../auvasa-hosted
 *   cd ../auvasa-hosted && ask deploy
 *
 * No copia secretos (.env), ni node_modules, ni el historial de git.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');

const destino = process.argv[2];
if (!destino) {
  console.error('Uso: node tools/preparar-hospedada.mjs <ruta-del-proyecto-hospedado>');
  process.exit(1);
}

const destinoAbs = path.resolve(process.cwd(), destino);

if (!fs.existsSync(path.join(destinoAbs, 'skill-package'))
  && !fs.existsSync(path.join(destinoAbs, 'lambda'))) {
  console.error(`'${destinoAbs}' no parece un proyecto de skill (no tiene skill-package/ ni lambda/).`);
  process.exit(1);
}

/** Copia recursiva de `origen` a `destino` (sobrescribiendo). */
function copiar(origen, destinoRel) {
  const origenAbs = path.join(RAIZ, origen);
  const destinoFinal = path.join(destinoAbs, destinoRel);
  if (!fs.existsSync(origenAbs)) {
    console.warn(`  (omitido) no existe ${origen}`);
    return 0;
  }
  fs.mkdirSync(path.dirname(destinoFinal), { recursive: true });
  fs.cpSync(origenAbs, destinoFinal, { recursive: true, force: true });
  console.log(`  copiado ${origen} -> ${path.relative(process.cwd(), destinoFinal)}`);
  return 1;
}

console.log(`Preparando la skill hospedada en ${destinoAbs}\n`);

let n = 0;
// Ficha, modelo de voz e iconos
n += copiar('skill-package/skill.json', 'skill-package/skill.json');
n += copiar('skill-package/interactionModels', 'skill-package/interactionModels');
n += copiar('skill-package/assets', 'skill-package/assets');

// Backend
n += copiar('lambda/index.js', 'lambda/index.js');
n += copiar('lambda/src', 'lambda/src');
n += copiar('lambda/data', 'lambda/data');
n += copiar('lambda/package.json', 'lambda/package.json');
n += copiar('lambda/package-lock.json', 'lambda/package-lock.json');

console.log(`\n${n} rutas copiadas.`);
console.log('Siguiente paso:');
console.log(`  cd ${path.relative(process.cwd(), destinoAbs)}`);
console.log('  ask deploy');
