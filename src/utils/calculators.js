/**
 * UVM Kinesiology Exit Indicator Calculator
 * Calculates the 7 components of the graduation readiness indicator
 * Updated to match new specifications (Jan 2026)
 */

// Criticality category to score mapping
const CRITICALITY_SCORES = {
  'alta': 5,
  'muy alta': 5,
  'muyalta': 5,
  'media-alta': 4,
  'media alta': 4,
  'mediaalta': 4,
  'media': 3,
  'baja': 2,
  'muy baja': 1,
  'muybaja': 1
};

// -------- Helpers --------
function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^A-Z0-9]+/g, ' ')     // keep alnum
    .replace(/\s+/g, ' ')
    .trim();
}

function truthyEnMalla(v) {
  if (v === true) return true;
  if (v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'si' || s === 'sí' || s === 'yes';
}

/**
 * Helper: Filter only courses "En Malla"
 * Robust against enMalla being boolean/string/number.
 */
function getMallaRecords(studentRecords) {
  if (!Array.isArray(studentRecords)) return [];
  return studentRecords.filter(r => truthyEnMalla(r.enMalla));
}

/**
 * Helper: Determine plan max semester from curriculumData
 * Supports structure: { semestres: [{ indice_semestre: 1, asignaturas: [...] }, ...] }
 * Also supports: { semestres_totales: 10 }
 */
function getMaxPlanSemester(curriculumData) {
  // Check for explicit semestres_totales
  if (curriculumData?.semestres_totales) {
    const total = Number(curriculumData.semestres_totales);
    if (Number.isFinite(total) && total > 0) return total;
  }

  // default fallback
  let maxPlan = 10;

  if (curriculumData?.semestres && Array.isArray(curriculumData.semestres) && curriculumData.semestres.length) {
    const nums = curriculumData.semestres
      .map(s => Number(s.indice_semestre ?? s.semestre ?? s.nivel ?? 0))
      .filter(n => Number.isFinite(n) && n > 0);

    if (nums.length) {
      maxPlan = Math.max(...nums);
    } else {
      // if not explicitly indexed, use count
      maxPlan = curriculumData.semestres.length;
    }
    return maxPlan;
  }

  // fallback heuristic (kept minimal)
  return maxPlan;
}

/**
 * Helper: Determine total courses in plan (for coverage)
 */
function getTotalPlanCourses(curriculumData) {
  if (curriculumData?.semestres && Array.isArray(curriculumData.semestres)) {
    let total = 0;
    curriculumData.semestres.forEach(s => {
      if (Array.isArray(s.asignaturas)) total += s.asignaturas.length;
    });
    return total || 0;
  }
  return 0;
}

/**
 * Convert percentage (0-100) to criticality score (1-5)
 * Based on spec thresholds:
 * 0–4.99% → 1, 5–9.99% → 2, 10–19.99% → 3, 20–29.99% → 4, ≥30% → 5
 */
function criticidadScoreFromPercent(percent) {
  const val = Number(percent);
  if (!Number.isFinite(val) || val < 0) return 1;
  if (val < 5) return 1;
  if (val < 10) return 2;
  if (val < 20) return 3;
  if (val < 30) return 4;
  return 5;
}

// -------- Components --------

/**
 * 1. Approval Rate (Tasa de aprobación)
 * NEW FORMULA: #FilasAprobadas / #FilasTotales (cada intento cuenta)
 */
export function calculateApprovalRate(studentRecords, audit = null) {
  const records = getMallaRecords(studentRecords);
  if (records.length === 0) {
    if (audit) {
      audit.approvalRate = { aprobados: 0, total: 0, rate: 0 };
    }
    return 0;
  }

  // Count each row (each attempt)
  let approvedCount = 0;
  let totalCount = records.length;

  records.forEach(record => {
    const nota = Number(record.nota);
    const isApproved =
      (Number.isFinite(nota) && nota >= 4.0) ||
      (record.estado && String(record.estado).toLowerCase().includes('aprob'));

    if (isApproved) {
      approvedCount++;
    }
  });

  const rate = totalCount > 0 ? approvedCount / totalCount : 0;

  if (audit) {
    audit.approvalRate = { aprobados: approvedCount, total: totalCount, rate };
  }

  return rate;
}

/**
 * 2. Academic Performance (Rendimiento académico)
 * Formula: Average Grade / 7.0
 * Uses average of ALL grades (not best per course)
 */
export function calculatePerformance(studentRecords, audit = null) {
  const records = getMallaRecords(studentRecords);
  if (records.length === 0) {
    if (audit) {
      audit.performance = { notas: [], promedio: 0, normalized: 0 };
    }
    return 0;
  }

  const grades = records
    .map(r => Number(r.nota))
    .filter(g => Number.isFinite(g) && g > 0);

  if (grades.length === 0) {
    if (audit) {
      audit.performance = { notas: [], promedio: 0, normalized: 0 };
    }
    return 0;
  }

  const average = grades.reduce((sum, g) => sum + g, 0) / grades.length;
  const normalized = average / 7.0;

  if (audit) {
    audit.performance = { notas: grades, promedio: average, normalized };
  }

  return normalized;
}

/**
 * 3. Permanence (Permanencia) - 20%
 * Formula: 1 - (years of study / 5)
 * years = (maxYear - minYear + 1)
 */
export function calculatePermanence(studentRecords, audit = null) {
  const records = getMallaRecords(studentRecords);
  if (!records || records.length === 0) {
    if (audit) {
      audit.permanence = { anioMin: null, anioMax: null, anos: 0, value: 1 };
    }
    return 1;
  }

  // Calculate duration in semesters for better precision
  // Only consider records with valid year/semester
  const validRecords = records.filter(r => {
    const y = parseInt(r.anio, 10);
    return Number.isFinite(y) && y >= 2000 && y <= 2100;
  });

  if (validRecords.length === 0) {
    if (audit) {
      audit.permanence = { anioMin: null, anioMax: null, anos: 0, retraso: 0, value: 1 };
    }
    return 1;
  }

  // Calculate semester indices: Year * 2 + (Sem - 1)
  const indices = validRecords.map(r => {
    const y = parseInt(r.anio, 10);
    const s = parseInt(r.semestre, 10) || 1; // Default to sem 1 if missing
    return (y * 2) + Math.max(0, Math.min(1, s - 1));
  });

  const minIndex = Math.min(...indices);
  const maxIndex = Math.max(...indices);

  // Duration in semesters (inclusive)
  const semestersStudied = maxIndex - minIndex + 1;
  const yearsStudied = semestersStudied / 2;

  // C3 = 1 - (retraso / 5), donde retraso = añosEstudio - 5
  // Penalize only if duration > 5 years per new spec
  const delay = Math.max(0, yearsStudied - 5);
  const permanence = 1 - (delay / 5);
  const clamped = Math.max(0, Math.min(1, permanence));

  console.log('[Permanencia] (Semestral)', { semesters: semestersStudied, years: yearsStudied, delay, permanence: clamped });

  if (audit) {
    // Audit with precision
    const startYear = Math.floor(minIndex / 2);
    const startSem = (minIndex % 2) + 1;
    const endYear = Math.floor(maxIndex / 2);
    const endSem = (maxIndex % 2) + 1;

    audit.permanence = {
      inicio: `${startYear}-${startSem}`,
      fin: `${endYear}-${endSem}`,
      semestres: semestersStudied,
      anos: yearsStudied,
      retraso: delay,
      value: clamped
    };
  }

  return clamped;
}

/**
 * 4. Repetition Index (Repetición de ramos)
 * Formula: 1 - (sum(intentos-1) / totalCursosTomados)
 */
export function calculateRepetition(studentRecords, audit = null) {
  const records = getMallaRecords(studentRecords);
  if (records.length === 0) {
    if (audit) {
      audit.repetition = { cursos: [], totalReps: 0, totalFilas: 0, value: 1 };
    }
    return 1;
  }

  const recordsByCourse = new Map();
  records.forEach(r => {
    const key = r.codigoMalla || r.codigoAsignatura || r.CODIGO_ASIGNATURA || normalizeText(r.nombreMalla || r.asignatura);
    if (!key) return;

    if (!recordsByCourse.has(key)) recordsByCourse.set(key, []);
    recordsByCourse.get(key).push(r);
  });

  let totalRepetitions = 0;
  const courseDetails = [];

  recordsByCourse.forEach((courseRecords, key) => {
    const attempts = courseRecords.length;
    const reps = Math.max(0, attempts - 1);
    totalRepetitions += reps;
    courseDetails.push({ curso: key, intentos: attempts, repeticiones: reps });
  });

  const totalCourses = records.length; // Use total rows as per new spec
  if (totalCourses === 0) {
    if (audit) {
      audit.repetition = { cursos: courseDetails, totalReps: 0, totalFilas: 0, value: 1 };
    }
    return 1;
  }

  const repetitionIndex = 1 - (totalRepetitions / totalCourses);
  const clamped = Math.max(0, Math.min(1, repetitionIndex));

  if (audit) {
    audit.repetition = { cursos: courseDetails, totalReps: totalRepetitions, totalFilas: totalCourses, value: clamped };
  }

  return clamped;
}

/**
 * 5. Course Criticality (Criticidad de asignaturas)
 * NEW FORMULA: sum(criticalityScore) / (5 * totalCursos)
 * (No inversion - higher score = higher criticality load)
 *
 * Supports:
 * - Category format (Baja/Media/Alta)
 * - Intento format (intento4/intento3/intento2 percentages) - PRIORITIZED
 */
export function calculateCriticality(studentRecords, criticalityData, audit = null) {
  const records = getMallaRecords(studentRecords);
  if (records.length === 0) {
    if (audit) {
      audit.criticality = { cursos: [], totalScore: 0, maxScore: 0, value: 0.5 };
    }
    return 0.5;
  }

  // Build lookup maps
  const critByCode = new Map();
  const critByName = new Map();

  /**
   * Get criticality score from item - prioritizes intento format
   */
  const getCriticalityScore = (item) => {
    // Priority 1: Intento percentages (intento4 -> intento3 -> intento2)
    const intento4 = item.intento4 ?? item.Porcentaje_4 ?? item['Porcentaje 4'] ?? null;
    const intento3 = item.intento3 ?? item.Porcentaje_3 ?? item['Porcentaje 3'] ?? null;
    const intento2 = item.intento2 ?? item.Porcentaje_2 ?? item['Porcentaje 2'] ?? null;

    if (intento4 !== null && intento4 !== undefined && intento4 !== '') {
      return criticidadScoreFromPercent(intento4);
    }
    if (intento3 !== null && intento3 !== undefined && intento3 !== '') {
      return criticidadScoreFromPercent(intento3);
    }
    if (intento2 !== null && intento2 !== undefined && intento2 !== '') {
      return criticidadScoreFromPercent(intento2);
    }

    // Priority 2: Category format
    const catRaw =
      item.criticidad ??
      item.categoria ??
      item['Categoría'] ??
      item['Categoria'] ??
      item['CATEGORIA'] ??
      '';
    const cat = normalizeText(catRaw).toLowerCase().replace(/\s+/g, '');
    const score = CRITICALITY_SCORES[cat] ?? CRITICALITY_SCORES[cat.replace('-', '')] ?? 1;
    return score;
  };

  const ingestList = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach(item => {
      const codeRaw = item.codigo ?? item.sigla ?? item.CODIGO_ASIGNATURA ?? item.codigoAsignatura ?? '';
      const code = normalizeText(codeRaw).replace(/\s+/g, '');
      const nameRaw = item.Asignatura ?? item.asignatura ?? item.nombre ?? item.NOMBRE ?? '';
      const nameNorm = normalizeText(nameRaw);

      const score = getCriticalityScore(item);

      if (code) critByCode.set(code, score);
      if (nameNorm) critByName.set(nameNorm, score);
    });
  };

  if (criticalityData) {
    if (Array.isArray(criticalityData)) {
      ingestList(criticalityData);
    } else if (typeof criticalityData === 'object') {
      Object.values(criticalityData).forEach(v => ingestList(v));
    }
  }

  // Unique courses taken (use code if possible, else name)
  const uniqueCourses = new Map(); // key -> { code, nameNorm }
  records.forEach(r => {
    const code = normalizeText(r.codigoMalla || r.codigoAsignatura || r.CODIGO_ASIGNATURA).replace(/\s+/g, '');
    const nameNorm = normalizeText(r.nombreMalla || r.nombreAsignatura || r.asignatura);

    const key = code || nameNorm;
    if (!key) return;

    if (!uniqueCourses.has(key)) uniqueCourses.set(key, { code, nameNorm });
  });

  let totalCritSum = 0;
  let count = 0;
  const courseDetails = [];

  uniqueCourses.forEach(({ code, nameNorm }, key) => {
    count++;
    let score = 1;

    if (code && critByCode.has(code)) score = critByCode.get(code);
    else if (nameNorm && critByName.has(nameNorm)) score = critByName.get(nameNorm);
    else score = 1; // default Muy Baja

    totalCritSum += score;
    courseDetails.push({ curso: key, puntaje: score });
  });

  if (count === 0) {
    if (audit) {
      audit.criticality = { cursos: [], totalScore: 0, maxScore: 0, value: 0.5 };
    }
    return 0.5;
  }

  // NEW: Direct formula (no inversion) - suma / (5 × total)
  const maxScore = 5 * count;
  const c5 = totalCritSum / maxScore;
  const clamped = Math.max(0, Math.min(1, c5));

  if (audit) {
    audit.criticality = { cursos: courseDetails, totalScore: totalCritSum, maxScore, value: clamped };
  }

  return clamped;
}

/**
 * 6. Semester Relevance (Relevancia de semestre)
 * Formula: ultimoSemestreCurricularAlcanzado / maxSemestrePlan
 */
export function calculateRelevance(studentRecords, curriculumData, audit = null) {
  const records = getMallaRecords(studentRecords);
  if (records.length === 0) {
    calculateExitIndicator.ultimoSemestreAlcanzado = 0;
    if (audit) {
      audit.relevance = { semestreMax: 0, planMax: 10, value: 0 };
    }
    return 0;
  }

  // FIX: semestreCurricular may come as string => coerce to number
  const semestres = records
    .map(r => Number(r.semestreCurricular))
    .filter(s => Number.isFinite(s) && s > 0);

  const ultimoSemestreAlcanzado = semestres.length ? Math.max(...semestres) : 0;
  calculateExitIndicator.ultimoSemestreAlcanzado = ultimoSemestreAlcanzado;

  const maxPlan = getMaxPlanSemester(curriculumData) || 10;
  const relevance = maxPlan > 0 ? Math.min(ultimoSemestreAlcanzado / maxPlan, 1) : 0;

  if (audit) {
    audit.relevance = { semestreMax: ultimoSemestreAlcanzado, planMax: maxPlan, value: relevance };
  }

  return relevance;
}

/**
 * 7. Demographic Index (Índice demográfico) - Manual Input
 * Formula: (G + C + L) / 3
 * G = 1 if female/other, 0 otherwise
 * C = 1 if city != Santiago, 0 otherwise
 * L = 1 if public school, 0 otherwise
 */
export function calculateDemographic(demographicData, audit = null) {
  if (!demographicData) {
    if (audit) {
      audit.demographic = { G: 0, C: 0, L: 0, genero: '', ciudad: '', colegio: '', value: 0 };
    }
    return 0;
  }

  const { genero = '', ciudad = '', tipoColegio = '' } = demographicData;
  const g = String(genero).toLowerCase();
  const c = String(ciudad).toLowerCase();
  const t = String(tipoColegio).toLowerCase();

  let G = 0;
  if (g === 'mujer' || g === 'female' || g === 'otro' || g === 'other') {
    G = 1;
  }

  let C = 0;
  if (c && !c.includes('santiago')) {
    C = 1;
  }

  let L = 0;
  if (t === 'publico' || t === 'público' || t === 'public' || t === 'municipal' || t === 'subvencionado') {
    L = 1;
  }

  const value = (G + C + L) / 3;

  if (audit) {
    audit.demographic = { G, C, L, genero, ciudad, colegio: tipoColegio, value };
  }

  return value;
}

/**
 * Get detailed course breakdown for audit/transparency
 */
export function getCourseBreakdown(studentRecords, criticalityData, curriculumData) {
  const records = getMallaRecords(studentRecords);
  const breakdown = new Map();

  // Build criticality lookup
  const critByCode = new Map();
  const critByName = new Map();

  const getCriticalityScore = (item) => {
    const intento4 = item.intento4 ?? item.Porcentaje_4 ?? null;
    const intento3 = item.intento3 ?? item.Porcentaje_3 ?? null;
    const intento2 = item.intento2 ?? item.Porcentaje_2 ?? null;

    if (intento4 !== null) return criticidadScoreFromPercent(intento4);
    if (intento3 !== null) return criticidadScoreFromPercent(intento3);
    if (intento2 !== null) return criticidadScoreFromPercent(intento2);

    const catRaw = item.criticidad ?? item.categoria ?? item['Categoría'] ?? '';
    const cat = normalizeText(catRaw).toLowerCase().replace(/\s+/g, '');
    return CRITICALITY_SCORES[cat] ?? 1;
  };

  if (criticalityData) {
    const ingest = (list) => {
      if (!Array.isArray(list)) return;
      list.forEach(item => {
        const code = normalizeText(item.codigo ?? item.sigla ?? '').replace(/\s+/g, '');
        const name = normalizeText(item.Asignatura ?? item.asignatura ?? item.nombre ?? '');
        const score = getCriticalityScore(item);
        if (code) critByCode.set(code, score);
        if (name) critByName.set(name, score);
      });
    };
    if (Array.isArray(criticalityData)) ingest(criticalityData);
    else Object.values(criticalityData).forEach(v => ingest(v));
  }

  // Process records
  records.forEach(r => {
    const key = r.codigoMalla || r.codigoAsignatura || r.CODIGO_ASIGNATURA || normalizeText(r.nombreMalla || r.asignatura);
    if (!key) return;

    if (!breakdown.has(key)) {
      const code = normalizeText(r.codigoMalla || r.codigoAsignatura || '').replace(/\s+/g, '');
      const name = normalizeText(r.nombreMalla || r.nombreAsignatura || r.asignatura);

      let critScore = 1;
      if (code && critByCode.has(code)) critScore = critByCode.get(code);
      else if (name && critByName.has(name)) critScore = critByName.get(name);

      breakdown.set(key, {
        asignatura: r.nombreMalla || r.nombreAsignatura || r.asignatura || key,
        codigo: r.codigoMalla || r.codigoAsignatura || '',
        intentos: 0,
        notas: [],
        puntajeCriticidad: critScore,
        semestreMalla: r.semestreCurricular || 0,
        enMalla: true
      });
    }

    const entry = breakdown.get(key);
    entry.intentos++;
    const nota = Number(r.nota);
    if (Number.isFinite(nota) && nota > 0) {
      entry.notas.push(nota);
    }
  });

  // Calculate averages
  return Array.from(breakdown.values()).map(entry => ({
    ...entry,
    notaPromedio: entry.notas.length > 0
      ? (entry.notas.reduce((a, b) => a + b, 0) / entry.notas.length).toFixed(2)
      : 'N/A'
  }));
}

/**
 * Main Calculator
 */
export function calculateExitIndicator(studentRecords, criticalityData, curriculumData, demographicData) {
  if (!Array.isArray(studentRecords) || studentRecords.length === 0) {
    return {
      components: {},
      totalScore: 0,
      level: 'Bajo',
      levelClass: 'low',
      malla: 'default',
      stats: { totalCourses: 0, approvedCourses: 0, averageGrade: '0.00', currentSemester: 0, coveragePct: 0 }
    };
  }

  const mallaName = studentRecords[0]?.malla || 'default';
  const records = getMallaRecords(studentRecords);

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
      description: 'Cursos aprobados / Cursos cursados (filas)'
    },
    performance: {
      value: compValues.performance,
      weight: 0.20,
      label: 'Rendimiento Académico',
      description: 'Promedio de notas / 7.0'
    },
    permanence: {
      value: compValues.permanence,
      weight: 0.20,
      label: 'Permanencia',
      description: '1 - (Años de retraso / 5)'
    },
    repetition: {
      value: compValues.repetition,
      weight: 0.10,
      label: 'Índice de Repetición',
      description: '1 - (Repeticiones / Total filas)'
    },
    criticality: {
      value: compValues.criticality,
      weight: 0.10,
      label: 'Criticidad de Asignaturas',
      description: 'Suma criticidad / (5 × Total cursos)'
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
  const uniqueCoursesTaken = new Set(records.map(r => (r.codigoMalla || r.codigoAsignatura || r.CODIGO_ASIGNATURA || r.nombreMalla)));
  const totalMallaCount = uniqueCoursesTaken.size;

  const approvedCoursesSet = new Set();
  records.forEach(r => {
    const nota = Number(r.nota);
    const isApproved =
      (Number.isFinite(nota) && nota >= 4.0) ||
      (r.estado && String(r.estado).toLowerCase().includes('aprob'));
    if (isApproved) {
      approvedCoursesSet.add(r.codigoMalla || r.codigoAsignatura || r.CODIGO_ASIGNATURA || r.nombreMalla);
    }
  });
  const approvedMallaCount = approvedCoursesSet.size;

  const grades = records
    .map(r => Number(r.nota))
    .filter(g => Number.isFinite(g) && g > 0);
  const avgGrade = grades.length ? (grades.reduce((s, g) => s + g, 0) / grades.length) : 0;

  const planTotal = getTotalPlanCourses(curriculumData);
  const coveragePct = planTotal > 0 ? (totalMallaCount / planTotal) * 100 : 0;

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
      coveragePct
    }
  };
}

/**
 * Main Calculator with Audit Mode
 * Returns additional audit object with detailed breakdowns
 */
export function calculateExitIndicatorWithAudit(studentRecords, criticalityData, curriculumData, demographicData) {
  if (!Array.isArray(studentRecords) || studentRecords.length === 0) {
    return {
      components: {},
      totalScore: 0,
      level: 'Bajo',
      levelClass: 'low',
      malla: 'default',
      stats: { totalCourses: 0, approvedCourses: 0, averageGrade: '0.00', currentSemester: 0, coveragePct: 0 },
      audit: null,
      courseBreakdown: []
    };
  }

  const audit = {};
  const mallaName = studentRecords[0]?.malla || 'default';
  const records = getMallaRecords(studentRecords);

  const compValues = {
    approvalRate: calculateApprovalRate(studentRecords, audit),
    performance: calculatePerformance(studentRecords, audit),
    permanence: calculatePermanence(studentRecords, audit),
    repetition: calculateRepetition(studentRecords, audit),
    criticality: calculateCriticality(studentRecords, criticalityData, audit),
    relevance: calculateRelevance(studentRecords, curriculumData, audit),
    demographic: calculateDemographic(demographicData, audit)
  };

  const components = {
    approvalRate: {
      value: compValues.approvalRate,
      weight: 0.25,
      label: 'Tasa de Aprobación',
      description: 'Cursos aprobados / Cursos cursados (filas)'
    },
    performance: {
      value: compValues.performance,
      weight: 0.20,
      label: 'Rendimiento Académico',
      description: 'Promedio de notas / 7.0'
    },
    permanence: {
      value: compValues.permanence,
      weight: 0.20,
      label: 'Permanencia',
      description: '1 - (Años de retraso / 5)'
    },
    repetition: {
      value: compValues.repetition,
      weight: 0.10,
      label: 'Índice de Repetición',
      description: '1 - (Repeticiones / Total filas)'
    },
    criticality: {
      value: compValues.criticality,
      weight: 0.10,
      label: 'Criticidad de Asignaturas',
      description: 'Suma criticidad / (5 × Total cursos)'
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
  const uniqueCoursesTaken = new Set(records.map(r => (r.codigoMalla || r.codigoAsignatura || r.CODIGO_ASIGNATURA || r.nombreMalla)));
  const totalMallaCount = uniqueCoursesTaken.size;

  const approvedCoursesSet = new Set();
  records.forEach(r => {
    const nota = Number(r.nota);
    const isApproved =
      (Number.isFinite(nota) && nota >= 4.0) ||
      (r.estado && String(r.estado).toLowerCase().includes('aprob'));
    if (isApproved) {
      approvedCoursesSet.add(r.codigoMalla || r.codigoAsignatura || r.CODIGO_ASIGNATURA || r.nombreMalla);
    }
  });
  const approvedMallaCount = approvedCoursesSet.size;

  const grades = records
    .map(r => Number(r.nota))
    .filter(g => Number.isFinite(g) && g > 0);
  const avgGrade = grades.length ? (grades.reduce((s, g) => s + g, 0) / grades.length) : 0;

  const planTotal = getTotalPlanCourses(curriculumData);
  const coveragePct = planTotal > 0 ? (totalMallaCount / planTotal) * 100 : 0;

  // Get course breakdown
  const courseBreakdown = getCourseBreakdown(studentRecords, criticalityData, curriculumData);

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
      coveragePct
    },
    audit,
    courseBreakdown
  };
}
