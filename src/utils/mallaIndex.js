/**
 * Malla Indexer & Matcher
 * Utilities to normalize course names and match student records to the verification plan (malla).
 */

/**
 * Normalize string for comparison
 * - Lowercase
 * - Remove accents
 * - Remove special characters (keep alphanumeric)
 * - Collapse spaces
 */
export function normalizeString(str, removeSpaces = false) {
    if (!str) return '';
    let normalized = str
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9\s]/g, ""); // Remove special chars

    if (removeSpaces) {
        normalized = normalized.replace(/\s+/g, "");
    } else {
        normalized = normalized.replace(/\s+/g, " "); // Collapse spaces
    }

    return normalized.trim();
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
    const addCourse = (course) => {
        if (!course) return;

        // Extract fields trying common variations (case-insensitive search)
        let codigo = '';
        let nombre = '';
        let semestre = 0;

        Object.keys(course).forEach(key => {
            const lowerKey = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (lowerKey.includes('codigo') || lowerKey.includes('sigla') || lowerKey === 'cod') {
                codigo = course[key];
            } else if (lowerKey.includes('asignatura') || lowerKey.includes('nombre') || lowerKey === 'name') {
                nombre = course[key];
            } else if (lowerKey.includes('semestre') || lowerKey.includes('nivel') || lowerKey.includes('periodo')) {
                semestre = parseInt(course[key], 10) || semestre;
            }
        });

        if (!codigo && !nombre) return;

        const entry = {
            codigo,
            nombre,
            semestre,
            original: course
        };

        if (codigo) {
            byCode.set(normalizeString(String(codigo), true), entry);
        }
        if (nombre) {
            byName.set(normalizeString(String(nombre)), entry);
        }
        allCourses.push(entry);
    };

    const isCourse = (obj) => {
        if (!obj || typeof obj !== 'object') return false;
        const keys = Object.keys(obj).map(k => k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
        return keys.some(k => k.includes('codigo') || k.includes('sigla') || k === 'cod' || k.includes('asignatura') || k.includes('nombre') || k === 'name');
    };

    // Traverse the JSON structure
    if (Array.isArray(mallaJson)) {
        mallaJson.forEach(item => {
            if (isCourse(item)) {
                addCourse(item);
            } else if (item && typeof item === 'object') {
                // Try to find nested arrays (e.g., semesters)
                Object.values(item).forEach(val => {
                    if (Array.isArray(val)) val.forEach(addCourse);
                });
            }
        });
    } else if (typeof mallaJson === 'object' && mallaJson !== null) {
        if (isCourse(mallaJson)) {
            addCourse(mallaJson);
        } else {
            Object.values(mallaJson).forEach(val => {
                if (Array.isArray(val)) {
                    val.forEach(addCourse);
                } else if (typeof val === 'object' && val !== null) {
                    // One more level for nested structures like { "1": [courses] }
                    Object.values(val).forEach(subVal => {
                        if (Array.isArray(subVal)) subVal.forEach(addCourse);
                    });
                }
            });
        }
    }

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

    const recordCode = normalizeString(record.codigoAsignatura || record.codigo, true);
    const recordName = normalizeString(record.nombreAsignatura || record.nombre);

    // 1. Try Code Match (using space-removed normalization)
    if (recordCode) {
        // We need to check against mallaIndex.byCode which should also be space-removed
        // Let's ensure buildMallaIndex uses the same normalization
        if (mallaIndex.byCode.has(recordCode)) {
            return mallaIndex.byCode.get(recordCode);
        }
    }

    // 2. Try Exact Name Match
    if (recordName && mallaIndex.byName.has(recordName)) {
        return mallaIndex.byName.get(recordName);
    }

    // 3. Match Tolerante (Fuzzy)
    // Only attempt if name is long enough to avoid false positives with short abbreviations
    if (recordName && recordName.length > 5) {

        // Check strict includes in both directions
        for (const [normName, info] of mallaIndex.byName.entries()) {

            // If one contains the other (and length difference isn't massive)
            if (normName.includes(recordName) || recordName.includes(normName)) {

                // Specific safeguard: "Taller I" vs "Taller II" collision
                // We check if the remaining part is just numbers (I, II, 1, 2)

                return info;
            }

            // Check startsWith for truncations (e.g., "Anatomia Gen" vs "Anatomia General")
            if (normName.startsWith(recordName) || recordName.startsWith(normName)) {
                if (Math.abs(normName.length - recordName.length) < 15) { // Arbitrary safety limit
                    return info;
                }
            }
        }
    }

    return null;
}
