/**
 * UVM Kinesiology Exit Indicator Calculator
 * Calculates the 7 components of the graduation readiness indicator
 */

// Criticality category to score mapping
const CRITICALITY_SCORES = {
    'alta': 5,
    'muy alta': 5, // Mapping legacy/alias
    'media-alta': 4,
    'media alta': 4,
    'media': 3,
    'baja': 2,
    'muy baja': 1
};

/**
 * Helper: Filter only courses "En Malla"
 * If enrichment hasn't happened yet, we might fallback or warn.
 * But according to plan, we trust enMalla flag.
 */
function getMallaRecords(studentRecords) {
    if (!studentRecords) return [];
    return studentRecords.filter(r => r.enMalla);
}

/**
 * 1. Approval Rate (Tasa de aprobación) - 25%
 * Formula: Approved Courses (Malla) / Total Courses Taken (Malla)
 */
export function calculateApprovalRate(studentRecords) {
    const records = getMallaRecords(studentRecords);
    if (records.length === 0) return 0;

    // Group by unique curriculum course
    const coursesTaken = new Map();
    records.forEach(record => {
        // Use codigoMalla as primary key
        const key = record.codigoMalla || record.codigoAsignatura;
        if (!coursesTaken.has(key)) {
            coursesTaken.set(key, { approved: false });
        }

        const isApproved = record.nota >= 4.0 ||
            (record.estado && record.estado.toLowerCase().includes('aprob'));

        if (isApproved) {
            coursesTaken.get(key).approved = true;
        }
    });

    const totalCourses = coursesTaken.size;
    const approvedCourses = Array.from(coursesTaken.values()).filter(c => c.approved).length;

    return totalCourses > 0 ? approvedCourses / totalCourses : 0;
}

/**
 * 2. Academic Performance (Rendimiento académico) - 20%
 * Formula: Average Grade (Malla) / 7.0
 */
export function calculatePerformance(studentRecords) {
    const records = getMallaRecords(studentRecords);
    if (records.length === 0) return 0;

    // Get the highest grade per course (malla only)
    const bestGrades = new Map();
    records.forEach(record => {
        const key = record.codigoMalla || record.codigoAsignatura;
        if (!bestGrades.has(key) || record.nota > bestGrades.get(key)) {
            bestGrades.set(key, record.nota);
        }
    });

    const grades = Array.from(bestGrades.values()).filter(g => g > 0);
    if (grades.length === 0) return 0;

    const average = grades.reduce((sum, g) => sum + g, 0) / grades.length;
    return average / 7.0;
}

/**
 * 3. Permanence (Permanencia) - 20%
 * Formula: 1 - (years of study / 5)
 * Universe: Malla courses (though years are global, we check range of malla records)
 */
export function calculatePermanence(studentRecords) {
    // We use all records effectively, but usually start/end is defined by curriculum activity
    // Spec says "C1-C6 calculated only using curriculum courses", so let's stick to recordsEnMalla
    // to determine the timeframe of *academic advance*.
    const records = getMallaRecords(studentRecords);
    if (records.length === 0) return 1;

    // Look at anio of these records
    const years = records.map(r => r.anio).filter(y => y > 0);
    if (years.length === 0) return 1;

    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const yearsStudied = maxYear - minYear + 1;

    // Original specification: 1 - (años / 5)
    // Clamp years between 0 and 5? No, if they took 7 years, it should be negative or zero.
    // However, specs usually ask to clamp result.
    // Spec says: "1 - (años/5)". If 7 years => 1 - 1.4 = -0.4.
    // Let's clamp the *result* to 0.

    const permanence = 1 - (yearsStudied / 5);
    return Math.max(0, Math.min(1, permanence));
}

/**
 * 4. Repetition Index (Repetición de ramos) - 10%
 * Formula: 1 - (sum(maxOportunidad - 1) / totalCursos)
 * Universe: Malla courses only.
 * Inference: If Oportunidad missing, count chronological attempts.
 */
export function calculateRepetition(studentRecords) {
    const records = getMallaRecords(studentRecords);
    if (records.length === 0) return 1; // "Perfect" score if no bad records found yet

    // Group to find max attempts per course
    const courseStats = new Map();

    // 1. First Pass: Group all records for each course
    const recordsByCourse = new Map();
    records.forEach(r => {
        const key = r.codigoMalla || r.codigoAsignatura;
        if (!recordsByCourse.has(key)) recordsByCourse.set(key, []);
        recordsByCourse.get(key).push(r);
    });

    let totalRepetitions = 0;
    recordsByCourse.forEach((courseRecords, key) => {
        // Find max explicitly if exists
        const explicitMax = Math.max(...courseRecords.map(r => r.oportunidad || 0));

        let attemptsCount = 1;
        if (explicitMax > 0) {
            attemptsCount = explicitMax;
        } else {
            // Infer: Count unique periods (sem/year) this course appears
            // Or just count records if we assume 1 record = 1 attempt
            // Robust approach: Sort by year/sem and count
            attemptsCount = courseRecords.length;
        }

        // Repetitions = MaxAttempts - 1 (If took it once, rep=0)
        totalRepetitions += Math.max(0, attemptsCount - 1);
    });

    const totalCourses = recordsByCourse.size;
    if (totalCourses === 0) return 1;

    const repetitionIndex = 1 - (totalRepetitions / totalCourses);
    return Math.max(0, Math.min(1, repetitionIndex));
}

/**
 * 5. Course Criticality (Criticidad de asignaturas) - 10%
 * Formula: 1 - (sum(criticality) / (5 * totalCourses))
 * Mapeo: Alta=5 .. Baja=2 (Inverso: High criticality reduces the score in the SUBTRACTIVE part?)
 * Wait, user req: "C5 debe aumentar cuando baja la criticidad total."
 * Formula provided: C5 = 1 - (Sum(crit) / 5*Total)
 * If courses are VERY CRITICAL (5), Sum is high. 1 - (High) = Low Score.
 * So High Criticality Courses = Low Indicator. Correct.
 * Logic: "Student passed hard courses? Wait."
 * No, the metric is usually "Risk due to Criticality". If student *failed* critical courses...
 * But this formula is purely based on the courses *present* (or taken).
 * Usually "Criticidad" in Exit Profile means: "Did they pass the critical ones?"
 * Current formula implies: Having a curriculum full of critical courses makes this index LOWER.
 * User requirement: "C5 = 1 - ...". Correct. Strict implementation.
 * 
 * Logic for "criticidad por intento": tomar el mayor nivel disponible (4>3>2).
 * This refers to the JSON structure having "Porcentaje_2" etc? 
 * User said: "publicsample_criticidad.json (criticidad por asignatura)" 
 * "Categorías: Alta, Media-Alta..." 
 * "Porcentajes por intento: Porcentaje_2..." -> This looks like dynamic criticality?
 * "Tomar el mayor nivel disponible"
 */
export function calculateCriticality(studentRecords, criticalityData) {
    const records = getMallaRecords(studentRecords);
    if (records.length === 0) return 0.5;

    // Build Criticality Lookup
    // criticalityData might be by year or flat.
    // We need to flatten it or search properly.
    // Assuming simple structure or flattened for now.
    // Real structure in sample: "2020": [{codigo, criticidad...}]

    // We will build a map: code -> score
    const critMap = new Map();

    if (criticalityData) {
        const populate = (list) => {
            if (!Array.isArray(list)) return;
            list.forEach(item => {
                const code = item.codigo || item.sigla;
                // Parse category
                const cat = (item.criticidad || '').toLowerCase();
                let score = CRITICALITY_SCORES[cat] || 1;
                // "si hay criticidad por intento: tomar el mayor nivel disponible"
                // Not visible in sample, but if present in full data (e.g. crit_attempt_1...)
                // We'll stick to 'criticidad' field per sample.

                if (code) critMap.set(code, score);
            });
        };

        if (Array.isArray(criticalityData)) {
            populate(criticalityData);
        } else {
            Object.values(criticalityData).forEach(populate);
        }
    }

    // Identificar cursos únicos tomados
    const uniqueCourses = new Set();
    records.forEach(r => uniqueCourses.add(r.codigoMalla)); // Use cleaned code

    let totalCritSum = 0;
    let count = 0;

    uniqueCourses.forEach(code => {
        if (!code) return;
        count++;
        // If not in map, assume something? Lowest? 
        // "si faltase) Muy Baja = 1"
        const score = critMap.get(code) || 1;
        totalCritSum += score;
    });

    if (count === 0) return 0.5;

    const c5 = 1 - (totalCritSum / (5 * count));
    return Math.max(0, Math.min(1, c5));
}

/**
 * 6. Semester Relevance (Relevancia de semestre) - 10%
 * Formula: Ultimo semestre curricular alcanzado / Max semestre plan
 */
export function calculateRelevance(studentRecords, curriculumData) {
    const records = getMallaRecords(studentRecords);
    if (records.length === 0) return 0;

    // Find max semestreCurricular
    const semestres = records
        .map(r => r.semestreCurricular)
        .filter(s => typeof s === 'number' && s > 0);

    const ultimoSemestreAlcanzado = semestres.length > 0 ? Math.max(...semestres) : 0;

    // Store for use in stats
    calculateExitIndicator.ultimoSemestreAlcanzado = ultimoSemestreAlcanzado;

    // Find Plan Max Semestre
    // From curriculumData
    let maxPlan = 10; // Default
    // Try to scan curriculumData
    if (curriculumData) {
        // Collect all 'semestre' values
        let allSems = [];
        const scan = (val) => {
            if (Array.isArray(val)) {
                val.forEach(i => scan(i));
            } else if (val && typeof val === 'object') {
                // Check if this object's keys or the object itself indicates a semester
                const keys = Object.keys(val);
                for (const k of keys) {
                    const normK = k.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z]/g, '');
                    if (normK.includes('SEMESTRE') || normK.includes('NIVEL') || normK.includes('BLOQUE')) {
                        const s = parseInt(String(val[k]).replace(/\D/g, ''), 10);
                        if (!isNaN(s)) allSems.push(s);
                    }
                }

                // Also check keys of the object if it's a container
                for (const [k, v] of Object.entries(val)) {
                    const normK = k.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z]/g, '');
                    if (normK.includes('SEMESTRE') || normK.includes('NIVEL')) {
                        const s = parseInt(k.replace(/\D/g, ''), 10);
                        if (!isNaN(s)) allSems.push(s);
                    }
                    if (v && typeof v === 'object') scan(v);
                }
            }
        };

        scan(curriculumData);

        if (allSems.length > 0) maxPlan = Math.max(...allSems);
    }

    if (maxPlan === 0) maxPlan = 10;

    const relevance = Math.min(ultimoSemestreAlcanzado / maxPlan, 1);

    console.log(`--- DEBUG RELEVANCE ---`);
    console.log(`Ultimo Semestre Alcanzado: ${ultimoSemestreAlcanzado}`);
    console.log(`Max Semestre Plan: ${maxPlan}`);
    console.log(`Resultado C6: ${relevance}`);
    console.log(`-----------------------`);

    return relevance;
}

/**
 * 7. Demographic Index (Índice demográfico) - 5%
 * Manual Input.
 * Formula: (Gender + City + SchoolType) / 3
 * Gender: Female/Other=1, Male=0
 * City: Outside Santiago=1, Santiago=0
 * SchoolType: Public=1, Private=0
 */
export function calculateDemographic(demographicData) {
    if (!demographicData) return 0.5;

    // Destructure with default safety
    const { genero = '', ciudad = '', tipoColegio = '' } = demographicData;
    const g = genero.toLowerCase();
    const c = ciudad.toLowerCase();
    const t = tipoColegio.toLowerCase();

    // Gender score
    let genderScore = 0;
    if (g === 'mujer' || g === 'female' || g === 'otro' || g === 'other') {
        genderScore = 1;
    }

    // City score (outside Santiago = 1)
    let cityScore = 0;
    if (c && !c.includes('santiago')) {
        cityScore = 1;
    }

    // School type score (public = 1)
    let schoolScore = 0;
    if (t === 'publico' || t === 'public' ||
        t === 'municipal' || t === 'subvencionado') {
        schoolScore = 1;
    }

    return (genderScore + cityScore + schoolScore) / 3;
}

/**
 * Main Calculator
 */
export function calculateExitIndicator(studentRecords, criticalityData, curriculumData, demographicData) {
    // 1. Enrich/Ensure we have keys (Assumes parser did its job, or we re-ran enrichment)
    // In App.jsx we will ensure enrichment runs before this is called or records passed here are enriched.
    // For safety, we trust studentRecords have 'enMalla' if relevant. 

    const mallaName = studentRecords[0]?.malla || 'default';
    const records = getMallaRecords(studentRecords); // Only valid curriculum courses

    // Calculate Components
    const compValues = {
        approvalRate: calculateApprovalRate(studentRecords),
        performance: calculatePerformance(studentRecords),
        permanence: calculatePermanence(studentRecords),
        repetition: calculateRepetition(studentRecords),
        criticality: calculateCriticality(studentRecords, criticalityData),
        relevance: calculateRelevance(studentRecords, curriculumData),
        demographic: calculateDemographic(demographicData)
    };

    const components = {
        approvalRate: {
            value: compValues.approvalRate,
            weight: 0.25,
            label: 'Tasa de Aprobación',
            description: 'Cursos aprobados / Cursos cursados (Malla)'
        },
        performance: {
            value: compValues.performance,
            weight: 0.20,
            label: 'Rendimiento Académico',
            description: 'Promedio de notas / 7.0 (Malla)'
        },
        permanence: {
            value: compValues.permanence,
            weight: 0.20,
            label: 'Permanencia',
            description: '1 - (Años cursados / 5)'
        },
        repetition: {
            value: compValues.repetition,
            weight: 0.10,
            label: 'Índice de Repetición',
            description: '1 - (Repeticiones / Cursos cursados)'
        },
        criticality: {
            value: compValues.criticality,
            weight: 0.10,
            label: 'Criticidad de Asignaturas',
            description: '1 - (Suma criticidad / 5*Total)'
        },
        relevance: {
            value: compValues.relevance,
            weight: 0.10,
            label: 'Relevancia de Semestre',
            description: 'Semestre máx alcanzado / Semestre plan'
        },
        demographic: {
            value: compValues.demographic,
            weight: 0.05,
            label: 'Índice Demográfico',
            description: '(Género + Ciudad + Colegio) / 3'
        }
    };

    // Calculate Total
    let totalScore = 0;
    Object.values(components).forEach(c => {
        c.weightedValue = c.value * c.weight;
        totalScore += c.weightedValue;
    });

    const finalPercentage = totalScore * 100;

    // Level
    let level, levelClass;
    if (finalPercentage >= 80) {
        level = 'Alto';
        levelClass = 'high';
    } else if (finalPercentage >= 60) {
        level = 'Medio';
        levelClass = 'medium';
    } else {
        level = 'Bajo';
        levelClass = 'low';
    }

    // Stats for UI
    const uniqueCoursesTaken = new Set(records.map(r => r.codigoMalla || r.nombreMalla));
    const totalMallaCount = uniqueCoursesTaken.size;

    // Count unique approved courses
    const approvedCoursesSet = new Set();
    records.forEach(r => {
        const isApproved = r.nota >= 4.0 || (r.estado && r.estado.toLowerCase().includes('aprob'));
        if (isApproved) {
            approvedCoursesSet.add(r.codigoMalla || r.nombreMalla);
        }
    });
    const approvedMallaCount = approvedCoursesSet.size;

    // Calculate Average Grade for display
    const bestGrades = new Map();
    records.forEach(r => {
        const key = r.codigoMalla || r.nombreMalla;
        if (!bestGrades.has(key) || r.nota > bestGrades.get(key)) {
            bestGrades.set(key, r.nota);
        }
    });
    const grades = Array.from(bestGrades.values()).filter(g => g > 0);
    const avgGrade = grades.length ? (grades.reduce((s, g) => s + g, 0) / grades.length) : 0;

    return {
        components,
        totalScore: finalPercentage,
        level,
        levelClass,
        malla: mallaName,
        stats: {
            totalCourses: totalMallaCount,
            approvedCourses: approvedMallaCount,
            averageGrade: avgGrade.toFixed(2),
            currentSemester: calculateExitIndicator.ultimoSemestreAlcanzado || 0,
            coveragePct: (totalMallaCount / 50) * 100 // Better estimate
        }
    };
}
