import * as XLSX from 'xlsx';
import { buildMallaIndex, matchAsignaturaToMalla, normalizeCourseName } from './mallaIndex.js';

/**
 * Parse an Excel file (.xlsx) containing student grades
 * Expected columns (flexibles):
 * - RUT
 * - Codigo Asignatura / Sigla Asignatura / CODIGO_ASIGNATURA
 * - Nombre Asignatura
 * - Nota
 * - Semestre
 * - Anio
 * - Oportunidad
 * - Malla
 * - Estado
 * - Periodo
 *
 * IMPORTANT:
 * - Si existe una columna "Código" (genérica), NO debe pisar codigoAsignatura.
 * - Priorizamos CODIGO_ASIGNATURA / SIGLA_ASIGNATURA / "Codigo Asignatura" por sobre "Código".
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

        // Find header row by looking for 'RUT' and ('NOTA' or 'ASIGNATURA')
        for (let i = 0; i < Math.min(20, rawData.length); i++) {
          const row = rawData[i].map(cell => String(cell).toUpperCase());
          const hasRut = row.some(cell => cell.includes('RUT'));
          const hasNota_Asig = row.some(cell => cell.includes('NOTA') || cell.includes('ASIGNATURA') || cell.includes('CODIGO'));

          if (hasRut && hasNota_Asig) {
            headerRowIndex = i;
            headers = rawData[i]; // Keep original casing for logging if needed, but we'll normalize later
            console.log(`[parseGradesExcel] Detected header at row ${i}:`, headers);
            break;
          }
        }

        // Re-parse with explicit range if header found, or use found headers manually
        // Using sheet_to_json with 'range' option is cleaner
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          range: headerRowIndex,
          defval: ''
        });

        const normalizedData = jsonData.map((row) => {
          const normalized = {};

          // 1) Pre-normalizamos headers para decidir prioridades sin depender del orden de columnas
          const entries = Object.entries(row).map(([key, value]) => {
            const normKey = normalizeCourseName(key, true); // sin espacios ni símbolos
            return { key, normKey, value };
          });

          // Helpers: buscar columnas por prioridad
          const pickFirst = (predicates) => {
            for (const pred of predicates) {
              const hit = entries.find(({ normKey }) => pred(normKey));
              if (hit) return hit.value;
            }
            return undefined;
          };

          // 2) RUT
          const rutVal = pickFirst([
            (k) => k.includes('RUT'),
          ]);
          if (rutVal !== undefined) {
            normalized.rut = String(rutVal).replace(/\./g, '').split('-')[0];
          }

          // 3) CÓDIGO ASIGNATURA (PRIORITARIO)
          //    Evitamos que "CODIGO" genérico (ej: "Código") pise esto.
          const codigoAsignaturaVal = pickFirst([
            (k) => k.includes('CODIGOASIGNATURA'),
            (k) => k.includes('SIGLAASIGNATURA'),
            (k) => (k.includes('CODIGO') && k.includes('ASIGNATURA')),
            (k) => (k.includes('SIGLA') && k.includes('ASIGNATURA')),
            // fallback: si solo existe "SIGLA" o "CODIGO" y no hay un genérico "CODIGO" sin contexto
            (k) => k === 'SIGLA',
            // OJO: NO incluimos k === 'CODIGO' aquí para no tomar "Código" genérico
          ]);

          if (codigoAsignaturaVal !== undefined && codigoAsignaturaVal !== null && codigoAsignaturaVal !== '') {
            normalized.codigoAsignatura = codigoAsignaturaVal;
          }

          // 4) NOMBRE ASIGNATURA
          const nombreAsignaturaVal = pickFirst([
            (k) => k.includes('NOMBREASIGNATURA'),
            (k) => k.includes('ASIGNATURA'),
            (k) => k.includes('NOMBRE'),
          ]);
          if (nombreAsignaturaVal !== undefined) {
            normalized.nombreAsignatura = nombreAsignaturaVal;
          }

          // 5) NOTA
          const notaVal = pickFirst([
            (k) => k === 'NOTA',
            (k) => k.includes('CALIFICACION'),
            (k) => k.includes('PROMEDIO') && !k.includes('PROMEDIOFINAL'),
          ]);
          normalized.nota = parseFloat(notaVal) || 0;

          // 6) SEMESTRE
          const semestreVal = pickFirst([
            (k) => k === 'SEMESTRE',
            (k) => k.includes('SEMESTRE'),
          ]);
          normalized.semestre = parseInt(semestreVal) || 0;

          // 7) AÑO
          const anioVal = pickFirst([
            (k) => k === 'ANIO',
            (k) => k === 'AÑO',
            (k) => k.includes('ANIO'),
            (k) => k.includes('YEAR'),
          ]);
          normalized.anio = parseInt(anioVal) || 0;

          // 8) OPORTUNIDAD / INTENTO
          const oportunidadVal = pickFirst([
            (k) => k.includes('OPORTUNIDAD'),
            (k) => k.includes('INTENTO'),
          ]);
          normalized.oportunidad = parseInt(oportunidadVal) || 1;

          // 9) MALLA / PLAN
          const mallaVal = pickFirst([
            (k) => k.includes('MALLA'),
            (k) => k.includes('PLAN'),
          ]);
          normalized.malla = mallaVal || 'default';

          // 10) ESTADO
          const estadoVal = pickFirst([
            (k) => k.includes('ESTADO'),
            (k) => k.includes('APROBADO'),
          ]);
          if (estadoVal !== undefined) normalized.estado = estadoVal;

          // 11) PERIODO
          const periodoVal = pickFirst([
            (k) => k.includes('PERIODO'),
          ]);
          if (periodoVal !== undefined) normalized.periodo = periodoVal;

          // 12) Columna "Código" genérica (si existe), la guardamos como extra (NO pisa codigoAsignatura)
          //     Esto sirve si después quieres usarlo para algo, pero no afecta match con malla.
          const codigoGenerico = pickFirst([
            (k) => k === 'CODIGO', // "Código"
          ]);
          if (codigoGenerico !== undefined) normalized.codigoGenerico = codigoGenerico;

          // Derivar anio/semestre desde PERIODO si faltan
          if (normalized.periodo) {
            const pStr = String(normalized.periodo).replace(/\D/g, '');

            if (!normalized.anio || normalized.anio === 0) {
              const year = parseInt(pStr.slice(0, 4), 10);
              if (!isNaN(year)) normalized.anio = year;
            }

            if (!normalized.semestre || normalized.semestre === 0) {
              const semCode = pStr.slice(-2);
              if (semCode === '10') normalized.semestre = 1;
              else if (semCode === '20') normalized.semestre = 2;
              else normalized.semestre = 1;
            }
          }

          // Fallback seguro
          normalized.semestre = normalized.semestre || 1;
          normalized.anio = normalized.anio || 0;
          normalized.oportunidad = normalized.oportunidad || 1;
          normalized.malla = normalized.malla || 'default';

          return normalized;
        });

        // Debug útil: % con codigoAsignatura
        const withCode = normalizedData.filter(r => r.codigoAsignatura && String(r.codigoAsignatura).trim() !== '').length;
        console.log(`[parseGradesExcel] Rows: ${normalizedData.length} | con codigoAsignatura: ${withCode} (${((withCode / Math.max(1, normalizedData.length)) * 100).toFixed(1)}%)`);

        resolve(normalizedData);
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

            // Priorizar CODIGOASIGNATURA / SIGLAASIGNATURA
            else if (header.includes('CODIGOASIGNATURA') || header.includes('SIGLAASIGNATURA') || (header.includes('CODIGO') && header.includes('ASIGNATURA'))) {
              row.codigoAsignatura = value;
            }
            // Evitar que CODIGO genérico pise
            else if (header === 'CODIGO') {
              row.codigoGenerico = value;
            }

            else if (header.includes('ASIGNATURA') || header.includes('NOMBRE')) row.nombreAsignatura = value;
            else if (header.includes('NOTA') || header.includes('CALIFICACION')) row.nota = parseFloat(value) || 0;
            else if (header.includes('SEMESTRE')) row.semestre = parseInt(value) || 1;
            else if (header.includes('ANIO') || header.includes('AÑO') || header.includes('YEAR')) row.anio = parseInt(value) || 0;
            else if (header.includes('OPORTUNIDAD') || header.includes('INTENTO')) row.oportunidad = parseInt(value) || 1;
            else if (header.includes('MALLA') || header.includes('PLAN')) row.malla = value;
            else if (header.includes('ESTADO')) row.estado = value;
            else if (header.includes('PERIODO')) row.periodo = value;
          });

          if (row.periodo) {
            const pStr = String(row.periodo).replace(/\D/g, '');

            if (!row.anio || row.anio === 0) {
              const year = parseInt(pStr.slice(0, 4), 10);
              if (!isNaN(year)) row.anio = year;
            }

            if (!row.semestre || row.semestre === 0) {
              const semCode = pStr.slice(-2);
              if (semCode === '10') row.semestre = 1;
              else if (semCode === '20') row.semestre = 2;
              else row.semestre = 1;
            }
          }

          row.semestre = row.semestre || 1;
          row.anio = row.anio || 0;
          row.oportunidad = row.oportunidad || 1;
          row.malla = row.malla || 'default';

          data.push(row);
        }

        resolve(data);
      } catch (error) {
        reject(new Error('Error parsing CSV file: ' + error.message));
      }
    };
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsText(file);
  });
}

/**
 * Parse JSON file (for criticality or curriculum structure)
 * Also handles grade files in JSON format
 */
export function parseJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // Grade-like JSON array
        if (Array.isArray(data) && data.length > 0) {
          const sample = data[0];
          const hasGradeFields = sample.rut || sample.RUT || sample.nota || sample.Nota;

          if (hasGradeFields) {
            const normalizedData = data.map(row => {
              const obj = {};

              Object.keys(row).forEach(key => {
                const normKey = normalizeCourseName(key, true);

                if (normKey.includes('RUT')) obj.rut = String(row[key]).replace(/\./g, '').split('-')[0];

                else if (normKey.includes('CODIGOASIGNATURA') || normKey.includes('SIGLAASIGNATURA') || (normKey.includes('CODIGO') && normKey.includes('ASIGNATURA'))) {
                  obj.codigoAsignatura = row[key];
                }
                else if (normKey === 'CODIGO') {
                  obj.codigoGenerico = row[key];
                }

                else if (normKey.includes('ASIGNATURA') || normKey.includes('NOMBRE')) obj.nombreAsignatura = row[key];
                else if (normKey.includes('NOTA') || normKey.includes('CALIFICACION')) obj.nota = parseFloat(row[key]) || 0;
                else if (normKey.includes('SEMESTRE')) obj.semestre = parseInt(row[key]) || 0;
                else if (normKey.includes('ANIO') || normKey.includes('AÑO') || normKey.includes('YEAR')) obj.anio = parseInt(row[key]) || 0;
                else if (normKey.includes('OPORTUNIDAD') || normKey.includes('INTENTO')) obj.oportunidad = parseInt(row[key]) || 1;
                else if (normKey.includes('MALLA') || normKey.includes('PLAN')) obj.malla = row[key];
                else if (normKey.includes('ESTADO') || normKey.includes('APROBADO')) obj.estado = row[key];
                else if (normKey.includes('PERIODO')) obj.periodo = row[key] || row.PERIODO;
              });

              if (obj.periodo) {
                const pStr = String(obj.periodo).replace(/\D/g, '');

                if (!obj.anio || obj.anio === 0) {
                  const year = parseInt(pStr.slice(0, 4), 10);
                  if (!isNaN(year)) obj.anio = year;
                }

                if (!obj.semestre || obj.semestre === 0) {
                  const semCode = pStr.slice(-2);
                  if (semCode === '10') obj.semestre = 1;
                  else if (semCode === '20') obj.semestre = 2;
                  else obj.semestre = 1;
                }
              }

              obj.semestre = obj.semestre || 1;
              obj.anio = obj.anio || 0;
              obj.oportunidad = obj.oportunidad || 1;
              obj.malla = obj.malla || 'default';

              return obj;
            });

            resolve(normalizedData);
            return;
          }
        }

        resolve(data);
      } catch (error) {
        reject(new Error('Error parsing JSON file: ' + error.message));
      }
    };
    reader.onerror = () => reject(new Error('Error reading file'));
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

/**
 * Get unique students from grades data
 */
export function getUniqueStudents(gradesData) {
  const students = new Map();
  gradesData.forEach(record => {
    if (record.rut && !students.has(record.rut)) {
      students.set(record.rut, {
        rut: record.rut,
        malla: record.malla
      });
    }
  });
  return Array.from(students.values());
}

/**
 * Filter records for a specific student
 */
export function getStudentRecords(gradesData, rut) {
  const normalizedRut = String(rut).replace(/\./g, '').split('-')[0];
  return gradesData.filter(record =>
    String(record.rut).replace(/\./g, '').split('-')[0] === normalizedRut
  );
}

/**
 * Enrich grades data with curriculum info
 * Adds: enMalla (bool), semestreCurricular, codigoMalla, nombreMalla
 */
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

  const inMalla = enriched.filter(r => r.enMalla).length;
  console.log(`[enrichGradesWithTraza] Total rows: ${enriched.length} | En malla: ${inMalla} (${((inMalla / Math.max(1, enriched.length)) * 100).toFixed(1)}%)`);

  return enriched;
}
