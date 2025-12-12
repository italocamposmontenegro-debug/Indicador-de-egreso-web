/**
 * UVM Kinesiology Exit Indicator Calculator
 * Calculates the 7 components of the graduation readiness indicator
 */

// Criticality category to score mapping
const CRITICALITY_SCORES = {
    'muy alta': 5,
    'alta': 4,
    'media': 3,
    'baja': 2,
    'muy baja': 1,
    'critical': 5,
    'high': 4,
    'medium': 3,
    'low': 2,
    'very low': 1,
    '5': 5,
    '4': 4,
    '3': 3,
    '2': 2,
    '1': 1
};

/**
 * 1. Approval Rate (Tasa de aprobación) - 25%
 * Formula: Approved Courses / Total Courses Taken
 */
export function calculateApprovalRate(studentRecords) {
    if (!studentRecords || studentRecords.length === 0) return 0;

    // Group by course to get unique courses taken
    const coursesTaken = new Map();
    studentRecords.forEach(record => {
        const key = record.codigoAsignatura || record.nombreAsignatura;
        if (!coursesTaken.has(key)) {
            coursesTaken.set(key, { approved: false, nota: 0 });
        }
        // Check if approved (nota >= 4.0 or estado contains 'aprobado')
        const isApproved = record.nota >= 4.0 ||
            (record.estado && record.estado.toLowerCase().includes('aprob'));
        if (isApproved) {
            coursesTaken.get(key).approved = true;
            coursesTaken.get(key).nota = Math.max(coursesTaken.get(key).nota, record.nota);
        }
    });

    const totalCourses = coursesTaken.size;
    const approvedCourses = Array.from(coursesTaken.values()).filter(c => c.approved).length;

    return totalCourses > 0 ? approvedCourses / totalCourses : 0;
}

/**
 * 2. Academic Performance (Rendimiento académico) - 20%
 * Formula: Average Grade / 7.0
 */
export function calculatePerformance(studentRecords) {
    if (!studentRecords || studentRecords.length === 0) return 0;

    // Get the best grade per course (latest or highest)
    const bestGrades = new Map();
    studentRecords.forEach(record => {
        const key = record.codigoAsignatura || record.nombreAsignatura;
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
 * Per specification: 5 years is expected graduation time
 */
export function calculatePermanence(studentRecords) {
    if (!studentRecords || studentRecords.length === 0) return 1;

    const years = studentRecords.map(r => r.anio).filter(y => y > 0);
    if (years.length === 0) return 1;

    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const yearsStudied = maxYear - minYear + 1;

    // Original specification: 1 - (años / 5)
    // Clamp years between 0 and 5 to avoid negative values
    const clampedYears = Math.min(Math.max(yearsStudied, 0), 5);
    const permanence = 1 - (clampedYears / 5);

    // Ensure result is between 0 and 1
    return Math.max(0, Math.min(1, permanence));
}

/**
 * 4. Repetition Index (Repetición de ramos) - 10%
 * Formula: 1 - (sum of (oportunidad - 1) for each course / total courses)
 * Per specification: prevents negative values by clamping
 */
export function calculateRepetition(studentRecords) {
    if (!studentRecords || studentRecords.length === 0) return 1;

    // Group by course to count max attempts per course
    const courseAttempts = new Map();
    studentRecords.forEach(record => {
        const key = record.codigoAsignatura || record.nombreAsignatura;
        const attempt = record.oportunidad || 1;
        if (!courseAttempts.has(key) || attempt > courseAttempts.get(key)) {
            courseAttempts.set(key, attempt);
        }
    });

    const totalCourses = courseAttempts.size;
    if (totalCourses === 0) return 1;

    // Sum of (attempt - 1) represents total extra attempts (repetitions)
    const totalRepetitions = Array.from(courseAttempts.values())
        .reduce((sum, attempt) => sum + (attempt - 1), 0);

    // Original specification: 1 - (repeticiones_totales / total_cursos)
    const repetitionIndex = 1 - (totalRepetitions / totalCourses);

    // Ensure result is between 0 and 1
    return Math.max(0, Math.min(1, repetitionIndex));
}

/**
 * 5. Course Criticality (Criticidad de asignaturas) - 10%
 * Formula: sum of criticality scores for all courses / (5 × total courses)
 * Per specification: maps criticality categories to scores 1-5
 */
export function calculateCriticality(studentRecords, criticalityData, malla = 'default') {
    if (!studentRecords || studentRecords.length === 0) return 0.5; // Neutral if no data

    // Get criticality lookup based on malla
    const criticalityLookup = new Map();
    if (criticalityData) {
        const mallaData = criticalityData[malla] || criticalityData['default'] || criticalityData;
        if (Array.isArray(mallaData)) {
            mallaData.forEach(item => {
                const key = item.codigo || item.sigla || item.nombre;
                // Try to get best available criticality (attempt 4, 3, 2, or general)
                const criticality = item.criticidad_4 || item.criticidad_3 ||
                    item.criticidad_2 || item.criticidad || 'media';
                criticalityLookup.set(key, criticality);
            });
        } else if (typeof mallaData === 'object') {
            Object.entries(mallaData).forEach(([key, value]) => {
                criticalityLookup.set(key, value.criticidad || value || 'media');
            });
        }
    }

    // Get unique courses taken by student
    const coursesTaken = new Set();
    studentRecords.forEach(record => {
        const key = record.codigoAsignatura || record.nombreAsignatura;
        coursesTaken.add(key);
    });

    const totalCourses = coursesTaken.size;
    if (totalCourses === 0) return 0.5;

    // Sum criticality scores for all courses taken
    // Per specification: Alta=5, Media-Alta=4, Media=3, Baja=2, Sin dato=1
    let totalCriticalityScore = 0;
    coursesTaken.forEach(courseCode => {
        const criticality = criticalityLookup.get(courseCode);
        const critScore = criticality ?
            (CRITICALITY_SCORES[String(criticality).toLowerCase()] || 1) : 1; // Default to 1 if no data
        totalCriticalityScore += critScore;
    });

    // Original specification: suma puntajes / (5 × total_cursos)
    // Maximum possible score per course is 5, so denominator is 5 × total
    const maxPossibleScore = 5 * totalCourses;
    const criticalityIndex = totalCriticalityScore / maxPossibleScore;

    // Ensure result is between 0 and 1
    return Math.max(0, Math.min(1, criticalityIndex));
}

/**
 * 6. Semester Relevance (Relevancia de semestre) - 10%
 * Formula: Current Semester Reached / Max Semester in Curriculum
 */
export function calculateRelevance(studentRecords, curriculumData, malla = 'default') {
    if (!studentRecords || studentRecords.length === 0) return 0;

    // Find the highest semester the student has reached
    // Handle various field names and ensure proper number parsing
    const semesters = studentRecords
        .map(r => {
            // Try multiple possible field names
            const sem = r.semestre || r.Semestre || r.SEMESTRE || r.semester || 0;
            return typeof sem === 'string' ? parseInt(sem, 10) : Number(sem);
        })
        .filter(s => !isNaN(s) && s > 0);

    // If no semester data found, try to infer from course codes or default to 1
    if (semesters.length === 0) {
        // Default to at least 1 semester if we have any records
        return studentRecords.length > 0 ? 0.1 : 0;
    }

    const currentSemester = Math.max(...semesters);

    // Determine max semester from curriculum or default to 10 for Kinesiology
    let maxSemester = 10;
    if (curriculumData) {
        const mallaData = curriculumData[malla] || curriculumData['default'] || curriculumData;
        if (mallaData.maxSemestre) {
            maxSemester = parseInt(mallaData.maxSemestre, 10) || 10;
        } else if (Array.isArray(mallaData)) {
            const maxFromData = Math.max(...mallaData.map(c => parseInt(c.semestre, 10) || 0));
            maxSemester = maxFromData > 0 ? maxFromData : 10;
        }
    }

    return Math.min(currentSemester / maxSemester, 1);
}

/**
 * 7. Demographic Index (Índice demográfico) - 5%
 * Formula: (Gender + City + SchoolType) / 3
 * Gender: Female=1, Male=0, Other=1
 * City: Outside Santiago=1, Santiago=0
 * SchoolType: Public=1, Private=0
 */
export function calculateDemographic(demographicData) {
    if (!demographicData) return 0.5; // Neutral if no data

    const { genero, ciudad, tipoColegio } = demographicData;

    // Gender score
    let genderScore = 0;
    if (genero === 'mujer' || genero === 'female' || genero === 'otro' || genero === 'other') {
        genderScore = 1;
    }

    // City score (outside Santiago = 1)
    let cityScore = 0;
    if (ciudad && !ciudad.toLowerCase().includes('santiago')) {
        cityScore = 1;
    }

    // School type score (public = 1)
    let schoolScore = 0;
    if (tipoColegio === 'publico' || tipoColegio === 'public' ||
        tipoColegio === 'municipal' || tipoColegio === 'subvencionado') {
        schoolScore = 1;
    }

    return (genderScore + cityScore + schoolScore) / 3;
}

/**
 * Calculate the complete Exit Indicator with all 7 components
 */
export function calculateExitIndicator(studentRecords, criticalityData, curriculumData, demographicData) {
    const studentMalla = studentRecords[0]?.malla || 'default';

    // Calculate all 7 components
    const components = {
        approvalRate: {
            value: calculateApprovalRate(studentRecords),
            weight: 0.25,
            label: 'Tasa de Aprobación',
            description: 'Cursos aprobados / Cursos cursados'
        },
        performance: {
            value: calculatePerformance(studentRecords),
            weight: 0.20,
            label: 'Rendimiento Académico',
            description: 'Promedio de notas / 7.0'
        },
        permanence: {
            value: calculatePermanence(studentRecords),
            weight: 0.20,
            label: 'Permanencia',
            description: '1 - (Años cursados / 5)'
        },
        repetition: {
            value: calculateRepetition(studentRecords),
            weight: 0.10,
            label: 'Índice de Repetición',
            description: '1 - (Repeticiones / Cursos cursados)'
        },
        criticality: {
            value: calculateCriticality(studentRecords, criticalityData, studentMalla),
            weight: 0.10,
            label: 'Criticidad de Asignaturas',
            description: 'Puntaje de criticidad normalizado'
        },
        relevance: {
            value: calculateRelevance(studentRecords, curriculumData, studentMalla),
            weight: 0.10,
            label: 'Relevancia de Semestre',
            description: 'Semestre alcanzado / Semestre máximo'
        },
        demographic: {
            value: calculateDemographic(demographicData),
            weight: 0.05,
            label: 'Índice Demográfico',
            description: '(Género + Ciudad + Colegio) / 3'
        }
    };

    // Calculate weighted total
    let totalScore = 0;
    Object.values(components).forEach(component => {
        component.weightedValue = component.value * component.weight;
        totalScore += component.weightedValue;
    });

    // Convert to percentage
    const finalPercentage = totalScore * 100;

    // Determine level
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

    // Get summary statistics
    const uniqueCourses = new Set(studentRecords.map(r => r.codigoAsignatura || r.nombreAsignatura)).size;
    const approvedCourses = calculateApprovedCount(studentRecords);
    const averageGrade = calculateAverageGrade(studentRecords);

    return {
        components,
        totalScore: finalPercentage,
        level,
        levelClass,
        malla: studentMalla,
        stats: {
            totalCourses: uniqueCourses,
            approvedCourses,
            averageGrade: averageGrade.toFixed(2),
            currentSemester: Math.max(
                ...studentRecords
                    .map(r => {
                        const sem = r.semestre || r.Semestre || r.SEMESTRE || r.semester || 0;
                        return typeof sem === 'string' ? parseInt(sem, 10) : Number(sem);
                    })
                    .filter(s => !isNaN(s) && s > 0),
                1
            )
        }
    };
}

// Helper functions
function calculateApprovedCount(studentRecords) {
    const approvedCourses = new Set();
    studentRecords.forEach(record => {
        const key = record.codigoAsignatura || record.nombreAsignatura;
        const isApproved = record.nota >= 4.0 ||
            (record.estado && record.estado.toLowerCase().includes('aprob'));
        if (isApproved) {
            approvedCourses.add(key);
        }
    });
    return approvedCourses.size;
}

function calculateAverageGrade(studentRecords) {
    const bestGrades = new Map();
    studentRecords.forEach(record => {
        const key = record.codigoAsignatura || record.nombreAsignatura;
        if (!bestGrades.has(key) || record.nota > bestGrades.get(key)) {
            bestGrades.set(key, record.nota);
        }
    });

    const grades = Array.from(bestGrades.values()).filter(g => g > 0);
    if (grades.length === 0) return 0;

    return grades.reduce((sum, g) => sum + g, 0) / grades.length;
}
