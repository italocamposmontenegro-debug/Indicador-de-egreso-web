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

  // Remove non-alphanumeric (keep spaces if not removeAllSpaces)
  if (removeAllSpaces) {
    normalized = normalized.replace(/[^A-Z0-9]/g, "");
  } else {
    normalized = normalized.replace(/[^A-Z0-9\s]/g, "");
    normalized = normalized.replace(/\s+/g, " "); // Collapse spaces
  }

  return normalized;
}

// Legacy support for normalizeString
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

  // Helper to add course to index
  const addCourse = (obj, inheritedSem = 0) => {
    if (!obj || typeof obj !== 'object') return;

    // Try all common key variations for name and code
    const nameKeys = [
      'ASIGNATURA', 'NOMBRE', 'NAME', 'MATERIA', 'DESC', 'DESCRIPCION', 'DESCRIPCIÓN', 'ASIG'
    ];

    // ✅ FIX: incluir CODIGO_ASIGNATURA y variantes
    const codeKeys = [
      'CODIGO', 'CÓDIGO', 'SIGLA', 'COD', 'NRC', 'ID', 'CLAVE',
      'CODIGOASIGNATURA', 'CODIGO_ASIGNATURA', 'CODIGOASIGNAT', 'CODASIGNATURA'
    ];

    const semKeys = ['SEMESTRE', 'NIVEL', 'INDICE_SEMESTRE', 'CICLO', 'PERIODO_MALLA'];

    let name = '';
    let code = '';
    let semestre = inheritedSem;

    // Find first matching key (case insensitive)
    const objKeys = Object.keys(obj);
    for (const k of objKeys) {
      // Importante: normalizamos conservando números y guiones bajos para no perder "CODIGO_ASIGNATURA"
      const normK = String(k)
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9_]/g, "");

      // Nombre
      if (!name && nameKeys.some(nk => normK.includes(nk.replace(/[^A-Z0-9_]/g, "")))) {
        name = obj[k];
      }

      // Código
      if (!code && codeKeys.some(ck => normK.includes(ck.replace(/[^A-Z0-9_]/g, "")))) {
        code = obj[k];
      }

      // Semestre
      if (semKeys.some(sk => normK.includes(sk.replace(/[^A-Z0-9_]/g, "")))) {
        const val = parseInt(obj[k], 10);
        if (!isNaN(val) && val > 0) semestre = val;
      }
    }

    // Fallback to lowercase check if still empty
    if (!name) name = obj.asignatura || obj.nombre || obj.name;
    if (!code) code = obj.codigo || obj.sigla || obj.cod || obj.codigo_asignatura || obj.CODIGO_ASIGNATURA;

    if (semestre === 0) semestre = parseInt(obj.semestre || obj.nivel || obj.indice_semestre, 10) || 0;

    if (name || code) {
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

      // Avoid duplicates in allCourses
      const isDuplicate = allCourses.some(c => {
        const cNormName = normalizeCourseName(c.nombre);
        const cNormCode = normalizeCourseName(c.codigo, true);
        return (normCode && cNormCode === normCode) || (normName && cNormName === normName);
      });

      if (!isDuplicate) {
        allCourses.push(courseInfo);
      }
    }
  };

  const isCourse = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const keys = Object.keys(obj).map(k => normalizeCourseName(k, true));

    // ✅ FIX: reconocer CODIGOASIGNATURA también como indicador de curso
    return keys.some(k =>
      k.includes('CODIGO') ||
      k.includes('SIGLA') ||
      k === 'COD' ||
      k === 'NRC' ||
      k.includes('CODIGOASIGNATURA') ||
      k.includes('ASIGNATURA') ||
      k.includes('NOMBRE') ||
      k === 'NAME' ||
      k === 'MATERIA' ||
      k.includes('DESC')
    );
  };

  // Recursive function to find all courses with context inheritance
  const traverse = (data, depth = 0, currentSem = 0) => {
    if (!data || depth > 15) return; // Safety limit

    if (Array.isArray(data)) {
      data.forEach(item => traverse(item, depth + 1, currentSem));
    } else if (typeof data === 'object') {
      // Check if this object's keys or the object itself indicates a semester
      let detectedSem = currentSem;

      const keys = Object.keys(data);
      for (const k of keys) {
        const normK = k
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^A-Z0-9]/g, '');

        if (normK.includes('SEMESTRE') || normK.includes('NIVEL') || normK.includes('BLOQUE')) {
          const num = parseInt(k.replace(/\D/g, ''), 10);
          if (!isNaN(num) && num > 0) detectedSem = num;
        }
      }

      if (isCourse(data)) {
        addCourse(data, detectedSem);
      }

      // Recurse into properties
      for (const [key, val] of Object.entries(data)) {
        if (val && typeof val === 'object') {
          let nextSem = detectedSem;

          const keyNum = parseInt(key, 10);
          if (!isNaN(keyNum) && keyNum > 0 && keyNum <= 12) {
            nextSem = keyNum;
          } else {
            const keyNorm = key.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (keyNorm.includes('SEMESTRE') || keyNorm.includes('NIVEL')) {
              const num = parseInt(key.replace(/\D/g, ''), 10);
              if (!isNaN(num) && num > 0) nextSem = num;
            }
          }

          traverse(val, depth + 1, nextSem);
        }
      }
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
 * 3. Fuzzy Name Match (StartsWith or Includes with enough length)
 */
export function matchAsignaturaToMalla(record, mallaIndex) {
  if (!mallaIndex || !record) return null;

  // ✅ FIX: soportar CODIGO_ASIGNATURA si viene en el record
  const recordCode = normalizeCourseName(
    record.codigoAsignatura || record.CODIGO_ASIGNATURA || record.codigo || record.sigla,
    true
  );

  const recordName = normalizeCourseName(record.nombreAsignatura || record.nombre || record.asignatura);

  // 1. Try Code Match
  if (recordCode && mallaIndex.byCode.has(recordCode)) {
    return mallaIndex.byCode.get(recordCode);
  }

  // 2. Try Exact Name Match
  if (recordName && mallaIndex.byName.has(recordName)) {
    return mallaIndex.byName.get(recordName);
  }

  // 3. Fuzzy Name Match
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
