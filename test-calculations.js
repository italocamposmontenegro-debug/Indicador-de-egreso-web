/**
 * Unit Tests for Exit Indicator Calculations
 * Updated to match original specifications
 * Run: node test-calculations.js
 */

// Test data - Student with 2 years of study
const student12345678 = [
    { codigoAsignatura: "KIN101", nota: 5.5, semestre: 1, anio: 2022, oportunidad: 1 },
    { codigoAsignatura: "KIN102", nota: 6.0, semestre: 1, anio: 2022, oportunidad: 1 },
    { codigoAsignatura: "KIN103", nota: 4.5, semestre: 1, anio: 2022, oportunidad: 1 },
    { codigoAsignatura: "KIN104", nota: 3.5, semestre: 1, anio: 2022, oportunidad: 1 }, // Failed first
    { codigoAsignatura: "KIN104", nota: 4.2, semestre: 1, anio: 2023, oportunidad: 2 }, // Passed second
    { codigoAsignatura: "KIN201", nota: 5.8, semestre: 2, anio: 2022, oportunidad: 1 },
    { codigoAsignatura: "KIN202", nota: 6.2, semestre: 2, anio: 2022, oportunidad: 1 },
    { codigoAsignatura: "KIN203", nota: 5.0, semestre: 2, anio: 2022, oportunidad: 1 },
    { codigoAsignatura: "KIN301", nota: 5.5, semestre: 3, anio: 2023, oportunidad: 1 },
    { codigoAsignatura: "KIN302", nota: 4.8, semestre: 3, anio: 2023, oportunidad: 1 }
];

// Test data - Student with 3 years and multiple repetitions
const student98765432 = [
    { codigoAsignatura: "KIN101", nota: 4.0, semestre: 1, anio: 2021, oportunidad: 1 },
    { codigoAsignatura: "KIN102", nota: 3.8, semestre: 1, anio: 2021, oportunidad: 1 }, // Failed
    { codigoAsignatura: "KIN102", nota: 4.2, semestre: 1, anio: 2022, oportunidad: 2 }, // Passed
    { codigoAsignatura: "KIN103", nota: 3.5, semestre: 1, anio: 2021, oportunidad: 1 }, // Failed
    { codigoAsignatura: "KIN103", nota: 3.2, semestre: 1, anio: 2022, oportunidad: 2 }, // Failed again
    { codigoAsignatura: "KIN103", nota: 4.1, semestre: 1, anio: 2023, oportunidad: 3 }, // Passed
    { codigoAsignatura: "KIN201", nota: 4.5, semestre: 2, anio: 2022, oportunidad: 1 },
    { codigoAsignatura: "KIN202", nota: 4.0, semestre: 2, anio: 2022, oportunidad: 1 }
];

// === CALCULATION FUNCTIONS (matching original specifications) ===

function calculateApprovalRate(studentRecords) {
    if (!studentRecords || studentRecords.length === 0) return 0;

    const coursesTaken = new Map();
    studentRecords.forEach(record => {
        const key = record.codigoAsignatura || record.nombreAsignatura;
        if (!coursesTaken.has(key)) {
            coursesTaken.set(key, { approved: false });
        }
        if (record.nota >= 4.0) {
            coursesTaken.get(key).approved = true;
        }
    });

    const totalCourses = coursesTaken.size;
    const approvedCourses = Array.from(coursesTaken.values()).filter(c => c.approved).length;
    return totalCourses > 0 ? approvedCourses / totalCourses : 0;
}

function calculatePerformance(studentRecords) {
    if (!studentRecords || studentRecords.length === 0) return 0;

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

// FIXED: Original spec: 1 - (años / 5)
function calculatePermanence(studentRecords) {
    if (!studentRecords || studentRecords.length === 0) return 1;

    const years = studentRecords.map(r => r.anio).filter(y => y > 0);
    if (years.length === 0) return 1;

    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const yearsStudied = maxYear - minYear + 1;

    // Original spec: 1 - (años / 5), clamped to [0, 5] years
    const clampedYears = Math.min(Math.max(yearsStudied, 0), 5);
    const permanence = 1 - (clampedYears / 5);
    return Math.max(0, Math.min(1, permanence));
}

// FIXED: Original spec: 1 - (repeticiones / total)
function calculateRepetition(studentRecords) {
    if (!studentRecords || studentRecords.length === 0) return 1;

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

    const totalRepetitions = Array.from(courseAttempts.values())
        .reduce((sum, attempt) => sum + (attempt - 1), 0);

    // Original spec: 1 - (repeticiones / total), clamped to [0, 1]
    const repetitionIndex = 1 - (totalRepetitions / totalCourses);
    return Math.max(0, Math.min(1, repetitionIndex));
}

// FIXED: Original spec: suma puntajes / (5 × total)
function calculateCriticality(studentRecords) {
    if (!studentRecords || studentRecords.length === 0) return 0.5;

    const coursesTaken = new Set();
    studentRecords.forEach(record => {
        const key = record.codigoAsignatura || record.nombreAsignatura;
        coursesTaken.add(key);
    });

    const totalCourses = coursesTaken.size;
    if (totalCourses === 0) return 0.5;

    // Default criticality = 3 (media) when no data
    const defaultCritScore = 3;
    const totalCriticalityScore = totalCourses * defaultCritScore;

    // Original spec: suma / (5 × total)
    const maxPossibleScore = 5 * totalCourses;
    return totalCriticalityScore / maxPossibleScore; // = 3/5 = 0.6 when no criticality data
}

// === RUN TESTS ===
console.log("=== UNIT TESTS FOR EXIT INDICATOR (Original Specs) ===\n");

console.log("--- Student 12345678 (2 years, 1 repetition) ---");
console.log("Years: 2022-2023 = 2 years");
console.log("Courses: 10 unique, all approved");
console.log("Repetitions: 1 (KIN104 with 2 attempts)\n");

let approval = calculateApprovalRate(student12345678);
console.log(`1. Approval Rate: ${(approval * 100).toFixed(1)}% (expected: 100%)`);

let performance = calculatePerformance(student12345678);
console.log(`2. Performance: ${(performance * 100).toFixed(1)}% (avg: ${(performance * 7).toFixed(2)}/7.0)`);

let permanence = calculatePermanence(student12345678);
console.log(`3. Permanence: ${(permanence * 100).toFixed(1)}% (2 years → 1 - 2/5 = 60%)`);

let repetition = calculateRepetition(student12345678);
console.log(`4. Repetition: ${(repetition * 100).toFixed(1)}% (1 rep / 10 courses → 1 - 0.1 = 90%)`);

let criticality = calculateCriticality(student12345678);
console.log(`5. Criticality: ${(criticality * 100).toFixed(1)}% (default 3 each → 30/50 = 60%)`);

// Weights
const weights = { approval: 0.25, performance: 0.20, permanence: 0.20, repetition: 0.10, criticality: 0.10, relevance: 0.10, demographic: 0.05 };

let total =
    (approval * weights.approval) +
    (performance * weights.performance) +
    (permanence * weights.permanence) +
    (repetition * weights.repetition) +
    (criticality * weights.criticality) +
    (0.3 * weights.relevance) + // S3 of 10
    (0.5 * weights.demographic); // Default

console.log(`\nTOTAL INDICATOR: ${(total * 100).toFixed(1)}%\n`);

console.log("--- Student 98765432 (3 years, 3 total repetitions) ---");
console.log("Years: 2021-2023 = 3 years");
console.log("Courses: 6 unique, all eventually approved");
console.log("Repetitions: KIN102 (1 extra), KIN103 (2 extra) = 3 total\n");

approval = calculateApprovalRate(student98765432);
console.log(`1. Approval Rate: ${(approval * 100).toFixed(1)}% (expected: 100%)`);

performance = calculatePerformance(student98765432);
console.log(`2. Performance: ${(performance * 100).toFixed(1)}% (avg: ${(performance * 7).toFixed(2)}/7.0)`);

permanence = calculatePermanence(student98765432);
console.log(`3. Permanence: ${(permanence * 100).toFixed(1)}% (3 years → 1 - 3/5 = 40%)`);

repetition = calculateRepetition(student98765432);
console.log(`4. Repetition: ${(repetition * 100).toFixed(1)}% (3 reps / 6 courses → 1 - 0.5 = 50%)`);

criticality = calculateCriticality(student98765432);
console.log(`5. Criticality: ${(criticality * 100).toFixed(1)}% (default → 60%)`);

total =
    (approval * weights.approval) +
    (performance * weights.performance) +
    (permanence * weights.permanence) +
    (repetition * weights.repetition) +
    (criticality * weights.criticality) +
    (0.2 * weights.relevance) + // S2 of 10
    (0.5 * weights.demographic);

console.log(`\nTOTAL INDICATOR: ${(total * 100).toFixed(1)}%\n`);

console.log("=== TESTS COMPLETE ===");
