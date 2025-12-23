/**
 * Malla Indexer & Matcher
 * Utilities to normalize course names and match student records to the verification plan (malla).
 */

/**
 * Robust normalization for course names and codes
 * - Trim and Uppercase
 * - Remove accents/diacritics
 * - Replace multiple spaces with one
 * - Remove non-alphanumeric characters (except spaces)
 * - Optional: remove all spaces for code matching
 */
export function normalizeCourseName(str, removeAllSpaces = false) {
  if (!str) return '';

  let normalized = String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .toUpperCase()
    .trim();

  if (removeAllSpaces) {
    normalized = normalized.replace(/[^A-Z0-9]/g, "");
  } else {
    normalized = normalized.replace(/[^A-Z0-9\s]/g, "");
    normalized = normalized.replace(/\s+/g, " ");
  }

  return normalized;
}

// Legacy support
export function normalizeString(str, removeSpaces = false) {
  return normalizeCourseName(str, removeSpaces);
}

/**
 * Build an index for the Malla (Curriculum)
 * Expects mallaJson to be an array of objects or an object with years/semesters.
 * Returns an object with lookups by code and name.
 */
export function buildMallaIndex(mallaJson) {
  const byCode = new Map();
  const byName = new Map();
  const allCourses = [];

  const nameKeys = [
    'ASIGNATURA', 'NOMBRE', 'NAME', 'MATERIA', 'DESC', 'DESCRIPCION', 'DESCRIPCIÓN', 'ASIG'
  ];

  // ✅ incluye CODIGO_ASIGNATURA por si aparece en otras versiones
  const codeKeys = [
    'CODIGO', 'CÓDIGO', 'SIGLA', 'COD', 'NRC', 'ID', 'CLAVE',
    'CODIGOASIGNATURA', 'CODIGO_ASIGNATURA', 'CODASIGNATURA',
    'CODIGOOFICIAL', 'CODIGO_OFICIAL'
  ];

  const semKeys = ['SEMESTRE', 'NIVEL', 'INDICE_SEMESTRE', 'CICLO', 'PERIODO_MALLA'];

  const normalizeKey = (k) => String(k)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9_]/g, "");

  const addCourse = (obj, inheritedSem = 0) => {
    if (!obj || typeof obj !== 'object') return;

    let name = '';
    let code = '';
    let semestre = inheritedSem;

    const objKeys = Object.keys(obj);

    // Detect fields by scanning keys
    for (const k of objKeys) {
      const normK = normalizeKey(k);

      if (!name && nameKeys.some(nk => normK.includes(normalizeKey(nk)))) {
        name = obj[k];
      }

      if (!code && codeKeys.some(ck => normK.includes(normalizeKey(ck)))) {
        code = obj[k];
      }

      if (semKeys.some(sk => normK.includes(normalizeKey(sk)))) {
        const val = parseInt(obj[k], 10);
        if (!isNaN(val) && val > 0) semestre = val;
      }
    }

    // Fallback direct (tu malla_only usa "codigo" y "nombre")
    if (!name) name = obj.asignatura || obj.nombre || obj.name;
    if (!code) code =
      obj.codigo ||
      obj.codigo_oficial ||
      obj.sigla ||
      obj.cod ||
      obj.codigo_asignatura ||
      obj.CODIGO_ASIGNATURA;

    if (semestre === 0) {
      semestre = parseInt(obj.semestre || obj.nivel || obj.indice_semestre, 10) || 0;
    }

    if (!name && !code) return;

    const courseInfo = {
      nombre: String(name || ''),
      codigo: String(code || ''),
      semestre: semestre || 0,
      original: obj
    };

    const normName = normalizeCourseName(courseInfo.nombre);
    const normCode = normalizeCourseName(courseInfo.codigo, true);

    if (normCode) byCode.set(normCode, courseInfo);
    if (normName) byName.set(normName, courseInfo);

    const isDuplicate = allCourses.some(c => {
      const cNormName = normalizeCourseName(c.nombre);
      const cNormCode = normalizeCourseName(c.codigo, true);
      return (normCode && cNormCode === normCode) || (normName && cNormName === normName);
    });

    if (!isDuplicate) allCourses.push(courseInfo);
  };

  const isCourse = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const keys = Object.keys(obj).map(k => normalizeCourseName(k, true));
    return keys.some(k =>
      k.includes('CODIGO') ||
      k.includes('SIGLA') ||
      k.includes('CODIGOASIGNATURA') ||
      k.includes('NOMBRE') ||
      k.includes('ASIGNATURA') ||
      k.includes('DESC') ||
      k === 'COD'
    );
  };

  // ✅ FIX CRÍTICO: heredar semestre desde data.semestre (VALOR), no desde el nombre de la clave
  const traverse = (data, depth = 0, currentSem = 0) => {
    if (!data || depth > 20) return;

    if (Array.isArray(data)) {
      data.forEach(item => traverse(item, depth + 1, currentSem));
      return;
    }

    if (typeof data !== 'object') return;

    let detectedSem = currentSem;

    // 1) Si el objeto tiene una propiedad "semestre" (como tu JSON malla_only), usar su VALOR
    for (const [k, v] of Object.entries(data)) {
      const normK = normalizeKey(k);
      if (normK === 'SEMESTRE' || normK.includes('INDICE_SEMESTRE') || normK === 'NIVEL') {
        const val = parseInt(v, 10);
        if (!isNaN(val) && val > 0) detectedSem = val;
      }
    }

    // 2) Heurística por nombre de clave contenedora (por si viene SEMESTRE7, NIVEL2, etc.)
    for (const k of Object.keys(data)) {
      const normK = normalizeKey(k).replace(/[^A-Z0-9]/g, '');
      if (normK.includes('SEMESTRE') || normK.includes('NIVEL') || normK.includes('BLOQUE')) {
        const num = parseInt(k.replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > 0) detectedSem = num;
      }
    }

    // 3) Agregar curso si corresponde
    if (isCourse(data)) {
      addCourse(data, detectedSem);
    }

    // 4) Recursión
    for (const [key, val] of Object.entries(data)) {
      if (!val || typeof val !== 'object') continue;

      let nextSem = detectedSem;

      // Si el key es numérico "7": [...] también puede ser semestre
      const keyNum = parseInt(key, 10);
      if (!isNaN(keyNum) && keyNum > 0 && keyNum <= 12) {
        nextSem = keyNum;
      } else {
        const keyNorm = normalizeKey(key);
        if (keyNorm.includes('SEMESTRE') || keyNorm.includes('NIVEL')) {
          const num = parseInt(key.replace(/\D/g, ''), 10);
          if (!isNaN(num) && num > 0) nextSem = num;
        }
      }

      traverse(val, depth + 1, nextSem);
    }
  };

  traverse(mallaJson);

  return { byCode, byName, allCourses };
}

/**
 * Match a student record to a course in the Malla
 * Priority:
 * 1. Exact Code Match
 * 2. Exact Name Match (Normalized)
 * 3. Fuzzy Name Match
 */
export function matchAsignaturaToMalla(record, mallaIndex) {
  if (!mallaIndex || !record) return null;

  const recordCode = normalizeCourseName(
    record.codigoAsignatura || record.CODIGO_ASIGNATURA || record.codigo || record.sigla || '',
    true
  );

  const recordName = normalizeCourseName(
    record.nombreAsignatura || record.nombre || record.asignatura || '',
    false
  );

  // 1) Code match
  if (recordCode && mallaIndex.byCode.has(recordCode)) {
    return mallaIndex.byCode.get(recordCode);
  }

  // 2) Exact name match
  if (recordName && mallaIndex.byName.has(recordName)) {
    return mallaIndex.byName.get(recordName);
  }

  // 3) Fuzzy match
  if (recordName && recordName.length > 3) {
    for (const [normName, info] of mallaIndex.byName.entries()) {
      if (normName.includes(recordName) || recordName.includes(normName)) {
        const recordNum = recordName.match(/\d+/);
        const mallaNum = normName.match(/\d+/);
        if (recordNum && mallaNum && recordNum[0] !== mallaNum[0]) continue;
        return info;
      }

      if (normName.startsWith(recordName) || recordName.startsWith(normName)) {
        if (Math.abs(normName.length - recordName.length) < 20) {
          return info;
        }
      }
    }
  }

  return null;
}
