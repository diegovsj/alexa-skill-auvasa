/**
 * Parser CSV mínimo compatible con RFC 4180 (soporta comillas, comas y saltos
 * de línea dentro de campos). Los ficheros GTFS usan ese formato.
 */

/**
 * Convierte un texto CSV en un array de objetos usando la primera fila como
 * cabecera. Se eliminan los BOM y los espacios sobrantes de las cabeceras.
 *
 * @param {string} texto
 * @returns {Array<Record<string, string>>}
 */
export function parseCsv(texto) {
  const filas = parseCsvFilas(texto.replace(/^\uFEFF/, ''));
  if (filas.length === 0) return [];

  const cabecera = filas[0].map((c) => c.trim());
  const registros = [];

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i];
    // Ignoramos líneas completamente vacías.
    if (fila.length === 1 && fila[0] === '') continue;

    const registro = {};
    for (let j = 0; j < cabecera.length; j++) {
      registro[cabecera[j]] = fila[j] ?? '';
    }
    registros.push(registro);
  }

  return registros;
}

/**
 * Devuelve la matriz de celdas del CSV.
 *
 * @param {string} texto
 * @returns {string[][]}
 */
export function parseCsvFilas(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      entreComillas = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else if (c === '\r') {
      // Se ignora; el \n cierra la fila.
    } else {
      campo += c;
    }
  }

  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas;
}

/**
 * Convierte "HH:MM:SS" en segundos desde medianoche.
 * GTFS permite horas >= 24 para viajes que cruzan la medianoche.
 *
 * @param {string} hhmmss
 * @returns {number} Segundos, o NaN si el formato no es válido.
 */
export function horaASegundos(hhmmss) {
  const m = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec((hhmmss || '').trim());
  if (!m) return Number.NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
