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
export function normalizeString(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9\s]/g, "") // Remove special chars
        .replace(/\s+/g, " ") // Collapse spaces
        .trim();
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

        // Extract fields trying common variations
        const codigo = course.codigo || course.sigla || course.cod || '';
        const nombre = course.nombre || course.asignatura || course.name || '';
        const semestre = parseInt(course.semestre || course.nivel || 0, 10);

        if (!codigo && !nombre) return;

        const entry = {
            codigo,
            nombre,
            semestre,
            original: course
        };

        if (codigo) {
            byCode.set(normalizeString(codigo), entry);
        }
        if (nombre) {
            byName.set(normalizeString(nombre), entry);
        }
        allCourses.push(entry);
    };

    // Traverse the JSON structure
    if (Array.isArray(mallaJson)) {
        mallaJson.forEach(item => {
            // Check if item is a course directly or a container (like "2020": [...])
            if (item.codigo || item.nombre) {
                addCourse(item);
            } else {
                // Try to see if it's a semester array or similar
                Object.values(item).forEach(val => {
                    if (Array.isArray(val)) val.forEach(addCourse);
                });
            }
        });
    } else if (typeof mallaJson === 'object') {
        // Handle object with keys like "2020", "Plan 2015", etc.
        Object.values(mallaJson).forEach(val => {
            if (Array.isArray(val)) {
                val.forEach(addCourse);
            } else if (typeof val === 'object') {
                // Maybe semester keys "1": [...]
                Object.values(val).forEach(subVal => {
                    if (Array.isArray(subVal)) subVal.forEach(addCourse);
                });
            }
        });
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

    const recordCode = normalizeString(record.codigoAsignatura || record.codigo);
    const recordName = normalizeString(record.nombreAsignatura || record.nombre);

    // 1. Try Code Match
    if (recordCode && mallaIndex.byCode.has(recordCode)) {
        return mallaIndex.byCode.get(recordCode);
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
