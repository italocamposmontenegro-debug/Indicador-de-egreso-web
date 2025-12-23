/**
 * UVM Kinesiology Exit Indicator Calculator
 * Calculates the 7 components of the graduation readiness indicator
 */

// Criticality category to score mapping
const CRITICALITY_SCORES = {
  'alta': 5,
  'muy alta': 5,
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
 */
function getMaxPlanSemester(curriculumData) {
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

// -------- Components --------

/**
 * 1. Approval Rate (Tasa de aprobación)
 * Formula: Approved Courses (Malla) / Total Courses Taken (Malla)
 */
export function calculateApprovalRate(studentRecords) {
  const records = getMallaRecords(studentRecords);
  if (records.length === 0) return 0;

  // Group by unique curriculum course
  const coursesTaken = new Map();
  records.forEach(record => {
    const key = record.codigoMalla || record.codigoAsignatura || record.CODIGO_ASIGNATURA || normalizeText(record.nombreMalla || record.asignatura);
    if (!key) return;

    if (!coursesTaken.has(key)) {
      coursesTaken.set(key, { approved: false });
    }

    const nota = Number(record.nota);
    const isApproved =
      (Number.isFinite(nota) && nota >= 4.0) ||
      (record.estado && String(record.estado).toLowerCase().includes('aprob'));

    if (isApproved) {
      coursesTaken.get(key).approved = true;
    }
  });

  const totalCourses = coursesTaken.size;
  const approvedCourses = Array.from(coursesTaken.values()).filter(c => c.approved).length;

  return totalCourses > 0 ? approvedCourses / totalCourses : 0;
}

/**
 * 2. Academic Performance (Rendimiento académico)
 * Formula: Average Grade (best per course, Malla) / 7.0
 */
export function calculatePerformance(studentRecords) {
  const records = getMallaRecords(studentRecords);
  if (records.length === 0) return 0;

  const bestGrades = new Map();
  records.forEach(record => {
    const key = record.codigoMalla || record.codigoAsignatura || record.CODIGO_ASIGNATURA || normalizeText(record.nombreMalla || record.asignatura);
    if (!key) return;

    const nota = Number(record.nota);
    if (!Number.isFinite(nota)) return;

    if (!bestGrades.has(key) || nota > bestGrades.get(key)) {
      bestGrades.set(key, nota);
    }
  });

  const grades = Array.from(bestGrades.values()).filter(g => Number.isFinite(g) && g > 0);
  if (grades.length === 0) return 0;

  const average = grades.reduce((sum, g) => sum + g, 0) / grades.length;
  return average / 7.0;
}

/**
 * 3. Permanence (Permanencia)
 * Formula: 1 - (yearsStudied / 5)
 * yearsStudied = (maxYear - minYear + 1) over Malla records.
 */
export function calculatePermanence(studentRecords) {
  const records = getMallaRecords(studentRecords);
  if (records.length === 0) return 1;

  const years = records.map(r => Number(r.anio)).filter(y => Number.isFinite(y) && y > 0);
  if (years.length === 0) return 1;

  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const yearsStudied = maxYear - minYear + 1;

  const permanence = 1 - (yearsStudied / 5);
  return Math.max(0, Math.min(1, permanence));
}

/**
 * 4. Repetition Index (Repetición de ramos)
 * Formula: 1 - (sum(maxOportunidad - 1) / totalCursos)
 */
export function calculateRepetition(studentRecords) {
  const records = getMallaRecords(studentRecords);
  if (records.length === 0) return 1;

  const recordsByCourse = new Map();
  records.forEach(r => {
    const key = r.codigoMalla || r.codigoAsignatura || r.CODIGO_ASIGNATURA || normalizeText(r.nombreMalla || r.asignatura);
    if (!key) return;

    if (!recordsByCourse.has(key)) recordsByCourse.set(key, []);
    recordsByCourse.get(key).push(r);
  });

  let totalRepetitions = 0;
  recordsByCourse.forEach(courseRecords => {
    const explicitMax = Math.max(...courseRecords.map(r => Number(r.oportunidad) || 0));
    let attemptsCount = 1;

    if (Number.isFinite(explicitMax) && explicitMax > 0) {
      attemptsCount = explicitMax;
    } else {
      // infer attempts using record count
      attemptsCount = courseRecords.length;
    }

    totalRepetitions += Math.max(0, attemptsCount - 1);
  });

  const totalCourses = recordsByCourse.size;
  if (totalCourses === 0) return 1;

  const repetitionIndex = 1 - (totalRepetitions / totalCourses);
  return Math.max(0, Math.min(1, repetitionIndex));
}

/**
 * 5. Course Criticality (Criticidad de asignaturas)
 * Formula: 1 - (sum(criticalityScore) / (5 * totalCourses))
 *
 * Supports criticality JSON formats:
 * - [{ codigo|sigla|CODIGO_ASIGNATURA, criticidad|categoria|Categoría|Categoria, ... }]
 * - or object with arrays inside (e.g. { "2020": [...], "2021": [...] })
 * - or your generated list with fields: Asignatura, Categoría
 *
 * Matching priority:
 * 1) code match (codigo/sigla)
 * 2) normalized name match (Asignatura/nombre)
 */
export function calculateCriticality(studentRecords, criticalityData) {
  const records = getMallaRecords(studentRecords);
  if (records.length === 0) return 0.5;

  // Build lookup maps
  const critByCode = new Map();
  const critByName = new Map();

  const readCategoryToScore = (item) => {
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

      const score = readCategoryToScore(item);

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

  uniqueCourses.forEach(({ code, nameNorm }) => {
    count++;
    let score = 1;

    if (code && critByCode.has(code)) score = critByCode.get(code);
    else if (nameNorm && critByName.has(nameNorm)) score = critByName.get(nameNorm);
    else score = 1; // default Muy Baja

    totalCritSum += score;
  });

  if (count === 0) return 0.5;

  const c5 = 1 - (totalCritSum / (5 * count));
  return Math.max(0, Math.min(1, c5));
}

/**
 * 6. Semester Relevance (Relevancia de semestre)
 * Formula: ultimoSemestreCurricularAlcanzado / maxSemestrePlan
 */
export function calculateRelevance(studentRecords, curriculumData) {
  const records = getMallaRecords(studentRecords);
  if (records.length === 0) {
    calculateExitIndicator.ultimoSemestreAlcanzado = 0;
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

  return relevance;
}

/**
 * 7. Demographic Index (Índice demográfico) - Manual Input
 */
export function calculateDemographic(demographicData) {
  if (!demographicData) return 0.5;

  const { genero = '', ciudad = '', tipoColegio = '' } = demographicData;
  const g = String(genero).toLowerCase();
  const c = String(ciudad).toLowerCase();
  const t = String(tipoColegio).toLowerCase();

  let genderScore = 0;
  if (g === 'mujer' || g === 'female' || g === 'otro' || g === 'other') {
    genderScore = 1;
  }

  let cityScore = 0;
  if (c && !c.includes('santiago')) {
    cityScore = 1;
  }

  let schoolScore = 0;
  if (t === 'publico' || t === 'público' || t === 'public' || t === 'municipal' || t === 'subvencionado') {
    schoolScore = 1;
  }

  return (genderScore + cityScore + schoolScore) / 3;
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

  const bestGrades = new Map();
  records.forEach(r => {
    const key = r.codigoMalla || r.codigoAsignatura || r.CODIGO_ASIGNATURA || r.nombreMalla;
    const nota = Number(r.nota);
    if (!key || !Number.isFinite(nota)) return;
    if (!bestGrades.has(key) || nota > bestGrades.get(key)) bestGrades.set(key, nota);
  });

  const grades = Array.from(bestGrades.values()).filter(g => Number.isFinite(g) && g > 0);
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
