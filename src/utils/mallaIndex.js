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
    const addCourse = (obj) => {
        if (!obj || typeof obj !== 'object') return;

        // Try all common key variations for name and code
        const nameKeys = ['ASIGNATURA', 'NOMBRE', 'NAME', 'MATERIA', 'DESC', 'DESCRIPCION', 'ASIG'];
        const codeKeys = ['CODIGO', 'SIGLA', 'COD', 'NRC', 'ID', 'CLAVE'];
        const semKeys = ['SEMESTRE', 'NIVEL', 'INDICE_SEMESTRE', 'CICLO', 'PERIODO_MALLA'];

        let name = '';
        let code = '';
        let semestre = 0;

        // Find first matching key (case insensitive)
        const objKeys = Object.keys(obj);
        for (const k of objKeys) {
            const normK = k.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z]/g, '');
            if (!name && nameKeys.some(nk => normK.includes(nk))) name = obj[k];
            if (!code && codeKeys.some(ck => normK.includes(ck))) code = obj[k];
            if (!semestre && semKeys.some(sk => normK.includes(sk))) semestre = parseInt(obj[k], 10);
        }

        // Fallback to lowercase check if still empty
        if (!name) name = obj.asignatura || obj.nombre || obj.name;
        if (!code) code = obj.codigo || obj.sigla || obj.cod;
        if (!semestre) semestre = parseInt(obj.semestre || obj.nivel, 10) || 0;

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
        // Check for common course identifiers
        return keys.some(k =>
            k.includes('CODIGO') || k.includes('SIGLA') || k === 'COD' || k === 'NRC' ||
            k.includes('ASIGNATURA') || k.includes('NOMBRE') || k === 'NAME' || k === 'MATERIA' ||
            k.includes('DESC')
        );
    };

    // Recursive function to find all courses
    const traverse = (data, depth = 0) => {
        if (!data || depth > 10) return; // Safety limit

        if (Array.isArray(data)) {
            data.forEach(item => traverse(item, depth + 1));
        } else if (typeof data === 'object') {
            if (isCourse(data)) {
                addCourse(data);
            }

            // ALWAYS look deeper, even if we thought this was a course
            // (in case it's a container like "Semester" that has a name but also contains courses)
            Object.values(data).forEach(val => {
                if (val && typeof val === 'object') {
                    traverse(val, depth + 1);
                }
            });
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

    const recordCode = normalizeCourseName(record.codigoAsignatura || record.codigo, true);
    const recordName = normalizeCourseName(record.nombreAsignatura || record.nombre);

    // 1. Try Code Match (using space-removed normalization)
    if (recordCode && mallaIndex.byCode.has(recordCode)) {
        return mallaIndex.byCode.get(recordCode);
    }

    // 2. Try Exact Name Match
    if (recordName && mallaIndex.byName.has(recordName)) {
        return mallaIndex.byName.get(recordName);
    }

    // 3. Match Tolerante (Fuzzy)
    // Only attempt if name is long enough to avoid false positives with short abbreviations
    if (recordName && recordName.length > 3) {

        // Check strict includes in both directions
        for (const [normName, info] of mallaIndex.byName.entries()) {

            // If one contains the other (and length difference isn't massive)
            // e.g., "ANATOMIA DEL APARATO LOCOMOTOR" vs "ANATOMIA"
            if (normName.includes(recordName) || recordName.includes(normName)) {

                // Specific safeguard: "INGLES 1" vs "INGLES 2"
                // If both have numbers, they must match exactly
                const recordNum = recordName.match(/\d+/);
                const mallaNum = normName.match(/\d+/);
                if (recordNum && mallaNum && recordNum[0] !== mallaNum[0]) {
                    continue;
                }

                return info;
            }

            // Check startsWith for truncations (e.g., "Anatomia Gen" vs "Anatomia General")
            if (normName.startsWith(recordName) || recordName.startsWith(normName)) {
                if (Math.abs(normName.length - recordName.length) < 20) { // Arbitrary safety limit
                    return info;
                }
            }
        }
    }

    return null;
}
