import * as XLSX from 'xlsx';
import { buildMallaIndex, matchAsignaturaToMalla, normalizeCourseName } from './mallaIndex.js';

// Helper to consolidate partial grades into single course records
function consolidateGradeRecords(records) {
  if (!records || records.length === 0) return [];

  // Group by unique course attempt
  const groups = new Map();

  records.forEach(r => {
    // Key components: RUT + Code/Name + Period + Opportunity
    // We strive to group partial evaluations of the SAME course instance.
    const rut = r.rut || 'UNKNOWN';
    const code = r.codigoAsignatura || r.codigoGenerico || 'NOCODE';
    const name = normalizeCourseName(r.nombreAsignatura || 'NONAME');
    const anio = r.anio || 0;
    const sem = r.semestre || 0;
    const oport = r.oportunidad || 1;

    // Composite key
    // Use code if available, otherwise name. Code is safer.
    const courseId = (code !== 'NOCODE') ? code : name;
    const key = `${rut}|${courseId}|${anio}|${sem}|${oport}`;

    if (!groups.has(key)) {
      groups.set(key, {
        meta: { ...r }, // Keep metadata from first row
        items: []
      });
    }

    const group = groups.get(key);
    // Add grade info
    const nota = parseFloat(r.nota) || 0;
    const peso = parseFloat(r.peso) || 0; // Will be 0 if not found
    group.items.push({ nota, peso });

    // Update metadata if current row has better info (e.g. valid code)
    if (group.meta.codigoAsignatura === undefined && r.codigoAsignatura) {
      group.meta.codigoAsignatura = r.codigoAsignatura;
    }
  });

  // Calculate final grades for each group
  const consolidated = Array.from(groups.values()).map(({ meta, items }) => {
    let finalGrade = 0;

    // Check if we have weights
    const totalWeight = items.reduce((sum, i) => sum + i.peso, 0);

    if (totalWeight > 0) {
      // Weighted Average
      const weightedSum = items.reduce((sum, i) => sum + (i.nota * i.peso), 0);
      finalGrade = weightedSum / totalWeight;
    } else {
      // Simple Average (if no weights, or all weights 0)
      const validItems = items.length;
      const sum = items.reduce((s, i) => s + i.nota, 0);
      finalGrade = validItems > 0 ? sum / validItems : 0;
    }

    // Standard academic rounding to 1 decimal place (e.g. 3.95 -> 4.0)
    finalGrade = Math.round(finalGrade * 10) / 10;

    return {
      ...meta,
      nota: finalGrade,
      _consolidatedCount: items.length // Debug info
    };
  });

  console.log(`[consolidateGradeRecords] Consolidated ${records.length} rows into ${consolidated.length} unique course attempts.`);
  return consolidated;
}

/**
 * Parse an Excel file (.xlsx) containing student grades
 */
export function parseGradesExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to array of arrays to find header row
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        let headerRowIndex = 0;
        let headers = [];

        // Find header row by looking for known columns
        for (let i = 0; i < Math.min(20, rawData.length); i++) {
          const row = rawData[i].map(cell => String(cell).toUpperCase());
          const hasRut = row.some(cell => cell.includes('RUT'));
          // Add 'MATERIA' check for the partial notes file format
          const hasTarget = row.some(cell =>
            cell.includes('NOTA') || cell.includes('ASIGNATURA') || cell.includes('CODIGO') || cell.includes('MATERIA')
          );

          if (hasRut && hasTarget) {
            headerRowIndex = i;
            headers = rawData[i];
            console.log(`[parseGradesExcel] Detected header at row ${i}:`, headers);
            break;
          }
        }

        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          range: headerRowIndex,
          defval: ''
        });

        const normalizedData = jsonData.map((row) => {
          const normalized = {};

          // 1) Pre-normalizamos headers
          const entries = Object.entries(row).map(([key, value]) => {
            const normKey = normalizeCourseName(key, true);
            return { key, normKey, value };
          });

          // Helpers
          const pickFirst = (predicates) => {
            for (const pred of predicates) {
              const hit = entries.find(({ normKey }) => pred(normKey));
              if (hit) return hit.value;
            }
            return undefined;
          };

          // --- EXTRACT FIELDS ---

          // RUT
          const rutVal = pickFirst([(k) => k.includes('RUT')]);
          if (rutVal) normalized.rut = String(rutVal).replace(/\./g, '').split('-')[0];

          // CODE: MATERIA + CURSO (Special Case for Partial Notes File)
          const materiaVal = pickFirst([(k) => k === 'MATERIA']);
          const cursoVal = pickFirst([(k) => k === 'CURSO']);

          let codigoAsignaturaVal = pickFirst([
            (k) => k.includes('CODIGOASIGNATURA'),
            (k) => k.includes('SIGLAASIGNATURA'),
            (k) => (k.includes('CODIGO') && k.includes('ASIGNATURA')),
            (k) => (k.includes('SIGLA') && k.includes('ASIGNATURA')),
            (k) => k === 'SIGLA',
            (k) => k === 'COD_PROGRAMA',
          ]);

          // If we have distinct MATERIA and CURSO columns (e.g. 'KINE' and '1052'), combine them
          if (!codigoAsignaturaVal && materiaVal && cursoVal) {
            codigoAsignaturaVal = `${materiaVal}${cursoVal}`;
          }

          if (codigoAsignaturaVal) normalized.codigoAsignatura = codigoAsignaturaVal;

          // NAME
          const nombreVal = pickFirst([
            (k) => k.includes('NOMBREASIGNATURA'), // Prefer specific
            (k) => k === 'ASIGNATURA', // Common in partial file
            (k) => k.includes('ASIGNATURA'),
            (k) => k.includes('NOMBRE') && !k.includes('NOMBRE_1'), // Avoid 'NOMBRE_1' (evaluation name)
          ]);
          if (nombreVal) normalized.nombreAsignatura = nombreVal;

          // GRADE
          const notaVal = pickFirst([
            (k) => k === 'NOTA',
            (k) => k.includes('CALIFICACION'),
            (k) => k.includes('PROMEDIO') && !k.includes('PROMEDIOFINAL'),
          ]);
          normalized.nota = parseFloat(notaVal) || 0;

          // WEIGHT (Important for partial consolidation)
          const pesoVal = pickFirst([
            (k) => k === 'PESO',
            (k) => k.includes('PONDERACION'),
            (k) => k.includes('PORCENTAJE'),
          ]);
          normalized.peso = parseFloat(pesoVal) || 0;

          // SEMESTRE / ANIO / PERIODO
          const periodoVal = pickFirst([(k) => k.includes('PERIODO')]);
          if (periodoVal) normalized.periodo = periodoVal;

          const semestreVal = pickFirst([(k) => k === 'SEMESTRE', (k) => k.includes('SEMESTRE')]);
          normalized.semestre = parseInt(semestreVal) || 0;

          const anioVal = pickFirst([(k) => k === 'ANIO', (k) => k === 'AÑO', (k) => k.includes('ANIO')]);
          normalized.anio = parseInt(anioVal) || 0;

          // OPORTUNIDAD
          const oportVal = pickFirst([(k) => k.includes('OPORTUNIDAD'), (k) => k.includes('INTENTO')]);
          normalized.oportunidad = parseInt(oportVal) || 1;

          // MALLA
          const mallaVal = pickFirst([(k) => k.includes('MALLA'), (k) => k.includes('PLAN')]);
          normalized.malla = mallaVal || 'default';

          // ESTADO (Usually not present in partial files until calculated)
          const estadoVal = pickFirst([(k) => k.includes('ESTADO'), (k) => k.includes('APROBADO')]);
          if (estadoVal) normalized.estado = estadoVal;

          // GENERIC CODE
          const codGen = pickFirst([(k) => k === 'CODIGO']);
          if (codGen) normalized.codigoGenerico = codGen;

          // Derive Period logic
          if (normalized.periodo) {
            const pStr = String(normalized.periodo).replace(/\D/g, '');
            if (!normalized.anio && pStr.length >= 4) normalized.anio = parseInt(pStr.slice(0, 4), 10);
            if (!normalized.semestre && pStr.length >= 6) {
              const suffix = pStr.slice(-2);
              normalized.semestre = (suffix === '10') ? 1 : (suffix === '20') ? 2 : 1;
            }
          }

          // Safe defaults
          normalized.semestre = normalized.semestre || 1;
          normalized.anio = normalized.anio || 0;
          normalized.oportunidad = normalized.oportunidad || 1;

          return normalized;
        });

        // CONSOLIDATION STEP: Aggregate partial records
        const consolidatedData = consolidateGradeRecords(normalizedData);

        console.log(`[parseGradesExcel] Final valid course records: ${consolidatedData.length}`);

        resolve(consolidatedData);
      } catch (error) {
        reject(new Error('Error parsing Excel file: ' + error.message));
      }
    };

    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse a CSV file containing student grades
 * (Also updated with consolidation)
 */
export function parseGradesCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          resolve([]);
          return;
        }

        const headers = lines[0].split(/[,;]/).map(h => normalizeCourseName(h, true));
        const data = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(/[,;]/);
          const row = {};

          headers.forEach((header, index) => {
            const value = values[index]?.trim() || '';

            if (header.includes('RUT')) row.rut = value.replace(/\./g, '').split('-')[0];

            // Basic mapping (simplified for CSV compared to Excel logic above, assuming cleaner data usually)
            else if (header.includes('CODIGOASIGNATURA') || header.includes('SIGLA')) row.codigoAsignatura = value;
            else if (header.includes('ASIGNATURA') || header.includes('NOMBRE')) row.nombreAsignatura = value;
            else if (header.includes('NOTA') || header.includes('CALIFICACION')) row.nota = parseFloat(value) || 0;
            else if (header.includes('PESO') || header.includes('PONDERACION')) row.peso = parseFloat(value) || 0;
            else if (header.includes('SEMESTRE')) row.semestre = parseInt(value) || 1;
            else if (header.includes('ANIO') || header.includes('AÑO')) row.anio = parseInt(value) || 0;
            else if (header.includes('OPORTUNIDAD')) row.oportunidad = parseInt(value) || 1;
            else if (header.includes('PERIODO')) row.periodo = value;

            // Handle MATERIA/CURSO in CSV if needed? Less likely, keeping simple.
          });

          if (row.periodo) {
            const pStr = String(row.periodo).replace(/\D/g, '');
            if (!row.anio) row.anio = parseInt(pStr.slice(0, 4)) || 0;
            if (!row.semestre) row.semestre = pStr.endsWith('20') ? 2 : 1;
          }

          data.push(row);
        }

        const consolidated = consolidateGradeRecords(data);
        resolve(consolidated);
      } catch (error) {
        reject(new Error('Error parsing CSV file: ' + error.message));
      }
    };
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsText(file);
  });
}

/**
 * Parse JSON file (for grades or config)
 */
export function parseJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data) && data.length > 0) {
          const sample = data[0];
          // Heuristic: is this a grades file?
          if (sample.rut || sample.RUT || sample.nota || sample.Nota) {
            // If JSON grades, assume they might need normalization but typically JSON is cleaner.
            // We'll wrap them in our normalization structure if keys match.
            // Implemented simplistic mapping for JSON grades:
            const normalized = data.map(r => ({
              rut: r.rut || r.RUT,
              codigoAsignatura: r.codigoAsignatura || r.CODIGO_ASIGNATURA || r.codigo,
              nombreAsignatura: r.nombreAsignatura || r.ASIGNATURA || r.nombre,
              nota: parseFloat(r.nota || r.NOTA) || 0,
              peso: parseFloat(r.peso || r.PESO) || 0,
              anio: parseInt(r.anio || r.ANIO) || 0,
              semestre: parseInt(r.semestre || r.SEMESTRE) || 1,
              oportunidad: parseInt(r.oportunidad || r.OPORTUNIDAD) || 1
            }));
            const consolidated = consolidateGradeRecords(normalized);
            resolve(consolidated);
            return;
          }
        }
        resolve(data);
      } catch (error) {
        reject(new Error('Error parsing JSON file: ' + error.message));
      }
    };
    reader.readAsText(file);
  });
}

/**
 * Detect file type and parse accordingly
 */
export async function parseFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();

  switch (extension) {
    case 'xlsx':
    case 'xls':
      return await parseGradesExcel(file);
    case 'csv':
      return await parseGradesCSV(file);
    case 'json':
      return await parseJSON(file);
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}

export function getUniqueStudents(gradesData) {
  const students = new Map();
  gradesData.forEach(record => {
    if (record.rut && !students.has(record.rut)) {
      students.set(record.rut, { rut: record.rut, malla: record.malla || 'default' });
    }
  });
  return Array.from(students.values());
}

export function getStudentRecords(gradesData, rut) {
  const normalizedRut = String(rut).replace(/\./g, '').split('-')[0];
  return gradesData.filter(record =>
    String(record.rut).replace(/\./g, '').split('-')[0] === normalizedRut
  );
}

export function enrichGradesWithTraza(gradesData, curriculumData) {
  if (!curriculumData || !gradesData) return gradesData;

  const mallaIndex = buildMallaIndex(curriculumData);
  console.log(`Enrichment: Malla Index built with ${mallaIndex.allCourses.length} courses`);

  const enriched = gradesData.map(record => {
    const match = matchAsignaturaToMalla(record, mallaIndex);

    return {
      ...record,
      enMalla: Boolean(match),
      semestreCurricular: match ? match.semestre : null,
      codigoMalla: match ? match.codigo : null,
      nombreMalla: match ? match.nombre : null
    };
  });

  // Debug info
  const inMalla = enriched.filter(r => r.enMalla).length;
  console.log(`[enrichGradesWithTraza] Records processed: ${enriched.length}, Matches: ${inMalla}`);

  return enriched;
}
