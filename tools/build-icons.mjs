/**
 * build-icons.mjs
 *
 * Genera los iconos PNG que Amazon exige para publicar una skill:
 *   - smallIcon: 108 x 108 px
 *   - largeIcon: 512 x 512 px
 *
 * Se dibujan por código (con supermuestreo 4x para suavizar bordes) y se
 * codifican como PNG con `zlib`, sin dependencias externas. Así el repositorio
 * no arrastra binarios opacos: el icono es reproducible con `npm run iconos`.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { cargarEnv } from './lib/dotenv.mjs';

cargarEnv();

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const DESTINO = path.join(RAIZ, 'skill-package', 'assets');

const LOCALES = (process.env.AUVASA_LOCALES || 'es-ES').split(',').map((s) => s.trim()).filter(Boolean);

/** Paleta inspirada en la imagen corporativa de AUVASA. */
const AZUL = [11, 61, 145];
const AZUL_CLARO = [23, 98, 196];
const BLANCO = [255, 255, 255];
const GRIS = [232, 238, 246];
const OSCURO = [23, 32, 48];

const SUPERA = 4;

/**
 * Crea un lienzo transparente con supermuestreo.
 *
 * @param {number} ancho
 * @param {number} alto
 */
function lienzo(ancho, alto) {
  const w = ancho * SUPERA;
  const h = alto * SUPERA;
  return { ancho, alto, w, h, buf: new Uint8ClampedArray(w * h * 4) };
}

/**
 * Pinta un píxel con mezcla alfa simple.
 */
function pixel(l, x, y, color, alfa = 1) {
  if (x < 0 || y < 0 || x >= l.w || y >= l.h) return;
  const i = (y * l.w + x) * 4;
  const a = alfa;
  for (let c = 0; c < 3; c++) {
    l.buf[i + c] = l.buf[i + c] * (1 - a) + color[c] * a;
  }
  l.buf[i + 3] = Math.min(255, l.buf[i + 3] * (1 - a) + 255 * a);
}

/** Rectángulo relleno (coordenadas en píxeles reales, no supermuestreados). */
function rect(l, x0, y0, x1, y1, color) {
  const X0 = Math.round(x0 * SUPERA);
  const Y0 = Math.round(y0 * SUPERA);
  const X1 = Math.round(x1 * SUPERA);
  const Y1 = Math.round(y1 * SUPERA);
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) pixel(l, x, y, color);
  }
}

/** Rectángulo con esquinas redondeadas. */
function rectRedondeado(l, x0, y0, x1, y1, radio, color) {
  const X0 = x0 * SUPERA;
  const Y0 = y0 * SUPERA;
  const X1 = x1 * SUPERA;
  const Y1 = y1 * SUPERA;
  const r = radio * SUPERA;
  for (let y = Math.round(Y0); y < Math.round(Y1); y++) {
    for (let x = Math.round(X0); x < Math.round(X1); x++) {
      // Distancia a la esquina más cercana.
      const dx = Math.max(X0 + r - x, x - (X1 - r), 0);
      const dy = Math.max(Y0 + r - y, y - (Y1 - r), 0);
      if (dx * dx + dy * dy <= r * r) pixel(l, x, y, color);
    }
  }
}

/** Círculo relleno. */
function circulo(l, cx, cy, radio, color) {
  const CX = cx * SUPERA;
  const CY = cy * SUPERA;
  const R = radio * SUPERA;
  for (let y = Math.round(CY - R); y <= Math.round(CY + R); y++) {
    for (let x = Math.round(CX - R); x <= Math.round(CX + R); x++) {
      const dx = x - CX;
      const dy = y - CY;
      if (dx * dx + dy * dy <= R * R) pixel(l, x, y, color);
    }
  }
}

/**
 * Reduce el lienzo al tamaño final promediando bloques de SUPERA x SUPERA
 * (filtro de caja, suficiente para un antialias correcto).
 */
function reducir(l) {
  const salida = Buffer.alloc(l.ancho * l.alto * 4);
  for (let y = 0; y < l.alto; y++) {
    for (let x = 0; x < l.ancho; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUPERA; sy++) {
        for (let sx = 0; sx < SUPERA; sx++) {
          const i = ((y * SUPERA + sy) * l.w + (x * SUPERA + sx)) * 4;
          r += l.buf[i];
          g += l.buf[i + 1];
          b += l.buf[i + 2];
          a += l.buf[i + 3];
        }
      }
      const n = SUPERA * SUPERA;
      const j = (y * l.ancho + x) * 4;
      salida[j] = Math.round(r / n);
      salida[j + 1] = Math.round(g / n);
      salida[j + 2] = Math.round(b / n);
      salida[j + 3] = Math.round(a / n);
    }
  }
  return salida;
}

/**
 * Dibuja el icono a un tamaño dado.
 *
 * @param {number} tamano
 * @returns {Buffer} Píxeles RGBA
 */
function dibujar(tamano) {
  const l = lienzo(tamano, tamano);
  const u = tamano / 512; // factor de escala respecto al diseño base

  // Fondo redondeado con degradado vertical simulado por franjas.
  const franjas = 64;
  for (let i = 0; i < franjas; i++) {
    const t = i / (franjas - 1);
    const color = [
      Math.round(AZUL[0] + (AZUL_CLARO[0] - AZUL[0]) * t),
      Math.round(AZUL[1] + (AZUL_CLARO[1] - AZUL[1]) * t),
      Math.round(AZUL[2] + (AZUL_CLARO[2] - AZUL[2]) * t),
    ];
    rectRedondeado(
      l,
      0,
      (i * tamano) / franjas,
      tamano,
      ((i + 1) * tamano) / franjas + 1,
      0,
      color,
    );
  }

  // Autobús: carrocería blanca.
  rectRedondeado(l, 96 * u, 128 * u, 416 * u, 400 * u, 34 * u, BLANCO);
  // Franja inferior gris (faldón).
  rect(l, 96 * u, 352 * u, 416 * u, 400 * u, GRIS);

  // Parabrisas y ventanillas.
  rectRedondeado(l, 124 * u, 160 * u, 388 * u, 248 * u, 12 * u, OSCURO);
  rect(l, 250 * u, 160 * u, 262 * u, 248 * u, BLANCO);
  rectRedondeado(l, 140 * u, 272 * u, 372 * u, 320 * u, 10 * u, AZUL_CLARO);

  // Faros.
  rectRedondeado(l, 118 * u, 336 * u, 158 * u, 356 * u, 8 * u, [255, 214, 102]);
  rectRedondeado(l, 354 * u, 336 * u, 394 * u, 356 * u, 8 * u, [255, 214, 102]);

  // Ruedas.
  circulo(l, 176 * u, 402 * u, 34 * u, OSCURO);
  circulo(l, 336 * u, 402 * u, 34 * u, OSCURO);
  circulo(l, 176 * u, 402 * u, 14 * u, BLANCO);
  circulo(l, 336 * u, 402 * u, 14 * u, BLANCO);

  return reducir(l);
}

// ------------------------------------------------------------ codificador PNG

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const longitud = Buffer.alloc(4);
  longitud.writeUInt32BE(datos.length, 0);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);
  return Buffer.concat([longitud, cuerpo, crc]);
}

/**
 * Codifica píxeles RGBA como PNG (color type 6).
 *
 * @param {Buffer} pixeles
 * @param {number} ancho
 * @param {number} alto
 * @returns {Buffer}
 */
function png(pixeles, ancho, alto) {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0);
  cabecera.writeUInt32BE(alto, 4);
  cabecera[8] = 8; // profundidad de bit
  cabecera[9] = 6; // RGBA
  cabecera[10] = 0;
  cabecera[11] = 0;
  cabecera[12] = 0;

  const filas = Buffer.alloc((ancho * 4 + 1) * alto);
  for (let y = 0; y < alto; y++) {
    filas[y * (ancho * 4 + 1)] = 0; // filtro "none"
    pixeles.copy(filas, y * (ancho * 4 + 1) + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', cabecera),
    trozo('IDAT', zlib.deflateSync(filas, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------- main

fs.mkdirSync(DESTINO, { recursive: true });

const grandes = png(dibujar(512), 512, 512);
const pequenos = png(dibujar(108), 108, 108);

for (const locale of LOCALES) {
  const g = path.join(DESTINO, `${locale}_largeIcon.png`);
  const p = path.join(DESTINO, `${locale}_smallIcon.png`);
  fs.writeFileSync(g, grandes);
  fs.writeFileSync(p, pequenos);
  console.log(`[iconos] ${path.relative(RAIZ, g)} y ${path.relative(RAIZ, p)}`);
}
