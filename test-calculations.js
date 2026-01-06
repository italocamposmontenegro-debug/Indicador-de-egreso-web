/**
 * Unit Tests for Exit Indicator Calculations - UPDATED (Jan 2026)
 * Run: node test-calculations.js
 */

import {
    calculateApprovalRate,
    calculatePerformance,
    calculatePermanence,
    calculateRepetition,
    calculateCriticality,
    calculateRelevance,
    calculateExitIndicatorWithAudit
} from './src/utils/calculators.js';

// Test data - Student with 2 years of study
const student12345678 = [
    { codigoAsignatura: "KIN101", nota: 5.5, semestre: 1, anio: 2022, oportunidad: 1, enMalla: true, semestreCurricular: 1 },
    { codigoAsignatura: "KIN102", nota: 6.0, semestre: 1, anio: 2022, oportunidad: 1, enMalla: true, semestreCurricular: 1 },
    { codigoAsignatura: "KIN103", nota: 4.5, semestre: 1, anio: 2022, oportunidad: 1, enMalla: true, semestreCurricular: 1 },
    { codigoAsignatura: "KIN104", nota: 3.5, semestre: 1, anio: 2022, oportunidad: 1, enMalla: true, semestreCurricular: 1 }, // Failed first
    { codigoAsignatura: "KIN104", nota: 4.2, semestre: 1, anio: 2023, oportunidad: 2, enMalla: true, semestreCurricular: 1 }, // Passed second
    { codigoAsignatura: "KIN201", nota: 5.8, semestre: 2, anio: 2022, oportunidad: 1, enMalla: true, semestreCurricular: 2 },
    { codigoAsignatura: "KIN202", nota: 6.2, semestre: 2, anio: 2022, oportunidad: 1, enMalla: true, semestreCurricular: 2 },
    { codigoAsignatura: "KIN203", nota: 5.0, semestre: 2, anio: 2022, oportunidad: 1, enMalla: true, semestreCurricular: 2 },
    { codigoAsignatura: "KIN301", nota: 5.5, semestre: 3, anio: 2023, oportunidad: 1, enMalla: true, semestreCurricular: 3 },
    { codigoAsignatura: "KIN302", nota: 4.8, semestre: 3, anio: 2023, oportunidad: 1, enMalla: true, semestreCurricular: 3 }
];

// Test data - Student with 3 years, multiple repetitions
const student98765432 = [
    { codigoAsignatura: "KIN101", nota: 4.0, semestre: 1, anio: 2021, oportunidad: 1, enMalla: true, semestreCurricular: 1 },
    { codigoAsignatura: "KIN102", nota: 3.8, semestre: 1, anio: 2021, oportunidad: 1, enMalla: true, semestreCurricular: 1 }, // Failed
    { codigoAsignatura: "KIN102", nota: 4.2, semestre: 1, anio: 2022, oportunidad: 2, enMalla: true, semestreCurricular: 1 }, // Passed
    { codigoAsignatura: "KIN103", nota: 3.5, semestre: 1, anio: 2021, oportunidad: 1, enMalla: true, semestreCurricular: 1 }, // Failed
    { codigoAsignatura: "KIN103", nota: 3.2, semestre: 1, anio: 2022, oportunidad: 2, enMalla: true, semestreCurricular: 1 }, // Failed again
    { codigoAsignatura: "KIN103", nota: 4.1, semestre: 1, anio: 2023, oportunidad: 3, enMalla: true, semestreCurricular: 1 }, // Passed
    { codigoAsignatura: "KIN201", nota: 4.5, semestre: 2, anio: 2022, oportunidad: 1, enMalla: true, semestreCurricular: 2 },
    { codigoAsignatura: "KIN202", nota: 4.0, semestre: 2, anio: 2022, oportunidad: 1, enMalla: true, semestreCurricular: 2 } // 8 rows total
];

// Mock Criticality Data
const criticalityData = [
    { codigo: "KIN101", criticidad: "muy alta", Porcentaje_4: 35 }, // Score 5
    { codigo: "KIN102", criticidad: "muy alta" }, // Score 5
    { codigo: "KIN103", criticidad: "alta" }, // Score 5
    { codigo: "KIN104", criticidad: "media" }, // Score 3
    { codigo: "KIN201", criticidad: "muy alta" }, // Score 5
    { codigo: "KIN202", criticidad: "muy alta" }, // Score 5
    { codigo: "KIN203", criticidad: "alta" }, // Score 5
    { codigo: "KIN301", criticidad: "muy alta" }, // Score 5
    { codigo: "KIN302", criticidad: "alta" } // Score 5
];

// Mock Curriculum Data
const curriculumData = { semestres_totales: 10, semestres: [] };

console.log("=== UNIT TESTS FOR EXIT INDICATOR (NEW SPECS JAN 2026) ===\n");

// --- TEST 1: Approval Rate (Counts ALL rows) ---
console.log("--- TEST 1: Approval Rate ---");
const ar1 = calculateApprovalRate(student12345678);
// student12345678: 10 rows, 1 failed (KIN104 row 4). 9 Passed.
// Rate = 9 / 10 = 0.9
console.log(`Student 1 (1 fail / 10 rows): ${(ar1 * 100).toFixed(1)}% (Expected: 90.0%)`);

const ar2 = calculateApprovalRate(student98765432);
// student98765432: 8 rows. unique courses: 101(P), 102(F,P), 103(F,F,P), 201(P), 202(P)
// Fails: KIN102(1), KIN103(1), KIN103(2). Total fails = 3.
// Passes: 5. Total rows = 8.
// Rate = 5 / 8 = 0.625
console.log(`Student 2 (3 fails / 8 rows): ${(ar2 * 100).toFixed(1)}% (Expected: 62.5%)`);


// --- TEST 2: Performance (Avg of ALL rows / 7.0) ---
console.log("\n--- TEST 2: Performance ---");
// Avg student 1: (5.5+6.0+4.5+3.5+4.2+5.8+6.2+5.0+5.5+4.8) / 10 = 51 / 10 = 5.1
// Normalized: 5.1 / 7 = 0.7285...
const p1 = calculatePerformance(student12345678);
console.log(`Student 1 Avg: ${(p1 * 7).toFixed(2)} (Expected: 5.10) -> ${(p1 * 100).toFixed(2)}%`);


// --- TEST 3: Permanence (1 - years/5) ---
console.log("\n--- TEST 3: Permanence ---");
const perm1 = calculatePermanence(student12345678);
// 2022-2023 = 2 years. 1 - 2/5 = 0.6
console.log(`Student 1 (2 years): ${(perm1 * 100).toFixed(1)}% (Expected: 60.0%)`);

const perm2 = calculatePermanence(student98765432);
// 2021-2023 = 3 years. 1 - 3/5 = 0.4
console.log(`Student 2 (3 years): ${(perm2 * 100).toFixed(1)}% (Expected: 40.0%)`);


// --- TEST 4: Repetition (1 - sum(attempts-1)/total_rows) ---
console.log("\n--- TEST 4: Repetition ---");
const rep1 = calculateRepetition(student12345678);
// KIN104 has 2 attempts (1 rep). Total rows = 10.
// Formula: 1 - (1 / 10) = 0.9
console.log(`Student 1 (1 rep / 10 rows): ${(rep1 * 100).toFixed(1)}% (Expected: 90.0%)`);

const rep2 = calculateRepetition(student98765432);
// KIN102 (2 att -> 1 rep), KIN103 (3 att -> 2 rep). Total reps = 3.
// Total rows = 8.
// Formula: 1 - (3 / 8) = 1 - 0.375 = 0.625
console.log(`Student 2 (3 reps / 8 rows): ${(rep2 * 100).toFixed(1)}% (Expected: 62.5%)`);


// --- TEST 5: Criticality (sum scores / 5*total_unique_courses) ---
console.log("\n--- TEST 5: Criticality ---");
const crit1 = calculateCriticality(student12345678, criticalityData);
// Courses: 9 unique.
// Scores: 5+5+5+3+5+5+5+5+5 = 43.
// Max: 9 * 5 = 45.
// Result: 43 / 45 = 0.955
console.log(`Student 1 Criticality: ${(crit1 * 100).toFixed(1)}% (Expected: ~95.6%)`);


// --- TEST 6: Relevance (LastSem / MaxPlan) ---
console.log("\n--- TEST 6: Relevance ---");
const rel1 = calculateRelevance(student12345678, curriculumData);
console.log(`Student 1 Relevance: ${(rel1 * 100).toFixed(1)}% (Expected: 30.0%)`);


// --- FULL AUDIT ---
console.log("\n--- TEST 7: Full Audit Check ---");
const auditResult = calculateExitIndicatorWithAudit(student12345678, criticalityData, curriculumData, { genero: 'Mujer', ciudad: 'Viña', tipoColegio: 'Municipal' });
console.log("Total Score:", auditResult.totalScore.toFixed(2) + "%");
console.log("Audit Object Present:", !!auditResult.audit);
if (auditResult.audit) {
    console.log("- Audit Approval:", auditResult.audit.approvalRate.rate);
    console.log("- Audit Repetition:", auditResult.audit.repetition.value);
}

console.log("\n=== TESTS COMPLETE ===");
