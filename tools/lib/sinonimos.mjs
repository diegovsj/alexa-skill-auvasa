/**
 * Generación de sinónimos para los slot types personalizados (`PARADA` y
 * `LINEA`) del modelo de interacción.
 *
 * Los nombres oficiales de las paradas son muy descriptivos
 * ("Calle Portillo Balboa frente 60 esquina Amor de Dios"), pero nadie los
 * dice completos. Alexa solo reconoce los valores y sinónimos declarados, así
 * que aquí derivamos automáticamente las formas cortas que usa la gente.
 */

/** Tipos de vía que se pueden omitir al hablar. */
const TIPO_VIA = /^(Calle|Paseo|Avenida|Avda\.?|Av\.?|Plaza|Pza\.?|Camino|Carretera|Ctra\.?|Ronda|Callejón|Cañada|Cuesta|Parque|Barrio|Campus|Hospital|Estación|Estadio|Acera|Travesía|Glorieta|Puente|Mercado|Centro|Polígono|Urb\.?|Arroyo|Calleja|Vía|Vial|C\/|P\.)\s+/i;

/** Marcadores a partir de los cuales el nombre deja de aportar información. */
const RELLENO = /\b(frente|esquina|junto|junto a|cruce|delante|detras|detrás|tras|a la altura|numero|n[uú]mero|n[ºo°]|proximo|próximo|proxima|próxima|entrada|salida|acceso|portal|hacia|sentido|direccion|dirección)\b/i;

const MIN_LONGITUD = 4;

/**
 * Genera las formas alternativas con las que un usuario podría nombrar una
 * parada. Siempre devuelve una lista sin duplicados y sin incluir el nombre
 * oficial.
 *
 * @param {string} nombre Nombre oficial de la parada.
 * @returns {string[]}
 */
export function sinonimosParada(nombre) {
  const base = limpiar(nombre);
  const salida = [];
  const candidatos = [];

  // Contenido entre paréntesis: suele ser el municipio o el nombre popular.
  const parenteticos = [...nombre.matchAll(/\(([^)]+)\)/g)].map((m) => limpiar(m[1]));

  // 1) Nombre truncado antes del primer marcador de relleno.
  const m = RELLENO.exec(base);
  const limpio = m ? base.slice(0, m.index).trim() : base;

  // 2) Sin el tipo de vía ("Calle Doctrinos 12" -> "Doctrinos 12").
  const sinTipo = limpio.replace(TIPO_VIA, '').trim();

  // 3) Vía + número, descartando la descripción posterior ("Zorrilla 198 La
  //    Rubia" -> "Zorrilla 198").
  const conNumero = /^(.*?\d+)\s/.exec(`${sinTipo} `);

  candidatos.push(limpio, ...parenteticos);
  if (sinTipo !== limpio && (sinTipo.includes(' ') || /\d/.test(sinTipo))) {
    candidatos.push(sinTipo);
  }
  if (conNumero) candidatos.push(conNumero[1]);

  for (const c of candidatos) {
    const v = limpiar(c);
    if (v.length < MIN_LONGITUD) continue;
    if (v.toLowerCase() === base.toLowerCase()) continue;
    if (salida.some((x) => x.toLowerCase() === v.toLowerCase())) continue;
    salida.push(v);
  }

  return salida.slice(0, 4);
}

/**
 * Sinónimos hablados para el código de una línea.
 *
 * @param {{codigo: string, nombre: string}} linea
 * @returns {string[]}
 */
export function sinonimosLinea(linea) {
  const codigo = (linea.codigo || '').trim();
  const salida = [];
  const anadir = (s) => {
    if (s && !salida.some((x) => x.toLowerCase() === s.toLowerCase())) salida.push(s);
  };

  const especiales = {
    C: 'circular',
    B: 'buho',
    F: 'f',
    M: 'm',
    P: 'p',
    U: 'universidad',
    H: 'hospital',
    LP: 'linea parquesol',
    LC: 'linea covaresa',
    LD: 'linea delicias',
  };

  if (/^\d+$/.test(codigo)) {
    anadir(`linea ${codigo}`);
    anadir(`el ${codigo}`);
    anadir(`la linea ${codigo}`);
  } else {
    const letra = codigo.replace(/\d+$/, '');
    const numero = codigo.slice(letra.length);
    const palabra = especiales[letra] || especiales[codigo] || letra;
    anadir(`linea ${codigo.toLowerCase()}`);
    anadir(`${palabra}${numero ? ` ${numero}` : ''}`);
  }

  return salida.slice(0, 4);
}

/**
 * Quita paréntesis, puntuación sobrante y espacios repetidos.
 *
 * @param {string} texto
 * @returns {string}
 */
function limpiar(texto) {
  return (texto || '')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
