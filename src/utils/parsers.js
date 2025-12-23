import * as XLSX from 'xlsx';
import { buildMallaIndex, matchAsignaturaToMalla, normalizeCourseName } from './mallaIndex.js';

/**
 * Parse an Excel file (.xlsx) containing student grades
 * Expected columns: RUT, Codigo Asignatura (o CODIGO_ASIGNATURA), Nombre Asignatura, Nota, Semestre, Anio, Oportunidad, Malla, Estado, Periodo
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
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        // Normalize column names (handle Spanish variations)
        const normalizedData = jsonData.map(row => {
          const normalized = {};

          Object.keys(row).forEach(key => {
            const normKey = normalizeCourseName(key, true);

            // RUT
            if (normKey.includes('RUT')) {
              normalized.rut = String(row[key]).replace(/\./g, '').split('-')[0];
              return;
            }

            // CODIGO / SIGLA (incluye CODIGO_ASIGNATURA)
            if (normKey.includes('CODIGO') || normKey.includes('SIGLA')) {
              const val = row[key];
              // no pisar si viene vacío y ya hay un código previo
              if (val !== '' && val !== null && val !== undefined) {
                normalized.codigoAsignatura = val;
              }
              return;
            }

            // NOMBRE / ASIGNATURA
            if (normKey.includes('ASIGNATURA') || normKey.includes('NOMBRE')) {
              normalized.nombreAsignatura = row[key];
              return;
            }

            // NOTA
            if (normKey.includes('NOTA') || normKey.includes('CALIFICACION')) {
              normalized.nota = parseFloat(row[key]) || 0;
              return;
            }

            // SEMESTRE
            if (normKey.includes('SEMESTRE')) {
              normalized.semestre = parseInt(row[key]) || 0;
              return;
            }

            // AÑO
            if (normKey.includes('ANIO') || normKey.includes('AÑO') || normKey.includes('YEAR')) {
              normalized.anio = parseInt(row[key]) || 0;
              return;
            }

            // OPORTUNIDAD / INTENTO
            if (normKey.includes('OPORTUNIDAD') || normKey.includes('INTENTO')) {
              normalized.oportunidad = parseInt(row[key]) || 1;
              return;
            }

            // MALLA / PLAN
            if (normKey.includes('MALLA') || normKey.includes('PLAN')) {
              normalized.malla = row[key];
              return;
            }

            // ESTADO / APROBADO
            if (normKey.includes('ESTADO') || normKey.includes('APROBADO')) {
              normalized.estado = row[key];
              return;
            }

            // PERIODO
            if (normKey.includes('PERIODO')) {
              normalized.periodo = row[key];
              return;
            }
          });

          // Derivar anio y semestre desde PERIODO si no vienen explícitos
          if (normalized.periodo) {
            const pStr = String(normalized.periodo).replace(/\D/g, '');

            // Año
            if (!normalized.anio || normalized.anio === 0) {
              const year = parseInt(pStr.slice(0, 4), 10);
              if (!isNaN(year)) normalized.anio = year;
            }

            // Semestre académico
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

          // Default values
          normalized.oportunidad = normalized.oportunidad || 1;
          normalized.malla = normalized.malla || 'default';

          // Normalizar código (opcional, sin alterar el valor original)
          // normalized.codigoAsignatura = normalized.codigoAsignatura || '';

          return normalized;
        });

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

            if (header.includes('rut')) row.rut = value.replace(/\./g, '').split('-')[0];
            else if (header.includes('codigo') || header.includes('sigla')) row.codigoAsignatura = value;
            else if (header.includes('asignatura') || header.includes('nombre')) row.nombreAsignatura = value;
            else if (header.includes('nota')) row.nota = parseFloat(value) || 0;
            else if (header.includes('semestre')) row.semestre = parseInt(value) || 1;
            else if (header.includes('año') || header.includes('anio')) row.anio = parseInt(value) || 0;
            else if (header.includes('oportunidad') || header.includes('intento')) row.oportunidad = parseInt(value) || 1;
            else if (header.includes('malla') || header.includes('plan')) row.malla = value;
            else if (header.includes('estado')) row.estado = value;
            else if (header.includes('periodo')) row.periodo = value;
          });

          // Derivar anio y semestre desde PERIODO si no vienen explícitos
          if (row.periodo) {
            const pStr = String(row.periodo).replace(/\D/g, '');

            // Año
            if (!row.anio || row.anio === 0) {
              const year = parseInt(pStr.slice(0, 4), 10);
              if (!isNaN(year)) row.anio = year;
            }

            // Semestre académico
            if (!row.semestre || row.semestre === 0) {
              const semCode = pStr.slice(-2);
              if (semCode === '10') row.semestre = 1;
              else if (semCode === '20') row.semestre = 2;
              else row.semestre = 1;
            }
          }

          // Fallback seguro
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

        // Check if this looks like a grades file (array with rut/nota fields)
        if (Array.isArray(data) && data.length > 0) {
          const sample = data[0];
          const hasGradeFields = sample.rut || sample.RUT || sample.nota || sample.Nota;

          if (hasGradeFields) {
            const normalizedData = data.map(row => {
              const obj = {};
              Object.keys(row).forEach(key => {
                const normKey = normalizeCourseName(key, true);

                if (normKey.includes('RUT')) obj.rut = String(row[key]).replace(/\./g, '').split('-')[0];
                else if (normKey.includes('CODIGO') || normKey.includes('SIGLA')) obj.codigoAsignatura = row[key];
                else if (normKey.includes('ASIGNATURA') || normKey.includes('NOMBRE')) obj.nombreAsignatura = row[key];
                else if (normKey.includes('NOTA') || normKey.includes('CALIFICACION')) obj.nota = parseFloat(row[key]) || 0;
                else if (normKey.includes('SEMESTRE')) obj.semestre = parseInt(row[key]) || 0;
                else if (normKey.includes('ANIO') || normKey.includes('AÑO') || normKey.includes('YEAR')) obj.anio = parseInt(row[key]) || 0;
                else if (normKey.includes('OPORTUNIDAD') || normKey.includes('INTENTO')) obj.oportunidad = parseInt(row[key]) || 1;
                else if (normKey.includes('MALLA') || normKey.includes('PLAN')) obj.malla = row[key];
                else if (normKey.includes('ESTADO') || normKey.includes('APROBADO')) obj.estado = row[key];
                else if (normKey.includes('PERIODO')) obj.periodo = row[key] || row.PERIODO;
              });

              // Derivar anio y semestre desde PERIODO si no vienen explícitos
              if (obj.periodo) {
                const pStr = String(obj.periodo).replace(/\D/g, '');

                // Año
                if (!obj.anio || obj.anio === 0) {
                  const year = parseInt(pStr.slice(0, 4), 10);
                  if (!isNaN(year)) obj.anio = year;
                }

                // Semestre académico
                if (!obj.semestre || obj.semestre === 0) {
                  const semCode = pStr.slice(-2);
                  if (semCode === '10') obj.semestre = 1;
                  else if (semCode === '20') obj.semestre = 2;
                  else obj.semestre = 1;
                }
              }

              // Fallback seguro
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
 * Adds: enMalla (bool), semestreCurricular (number), codigoMalla, nombreMalla
 * PRIORIDAD: match por CODIGO_ASIGNATURA -> fallback por nombre
 */
export function enrichGradesWithTraza(gradesData, curriculumData) {
  if (!curriculumData || !gradesData) return gradesData;

  const mallaIndex = buildMallaIndex(curriculumData);
  console.log(`Enrichment: Malla Index built with ${mallaIndex.allCourses.length} courses`);

  // Normaliza códigos para que KINE1010 / "KINE 1010" / "kine-1010" matcheen igual
  const normalizeCode = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');
  };

  // Índice rápido por código desde la malla
  const byCode = new Map();
  (mallaIndex.allCourses || []).forEach(c => {
    const code = normalizeCode(c.codigo);
    if (code) byCode.set(code, c);
  });

  return gradesData.map(record => {
    const rawCode =
      record.codigoAsignatura ||
      record.CODIGO_ASIGNATURA ||
      record.codigo ||
      record.sigla ||
      '';

    const code = normalizeCode(rawCode);

    // 1) Match por código (preferido)
    let match = null;
    if (code && byCode.has(code)) {
      match = byCode.get(code);
    }

    // 2) Fallback por nombre (matcher existente)
    if (!match) {
      match = matchAsignaturaToMalla(record, mallaIndex);
    }

    return {
      ...record,
      enMalla: !!match,
      semestreCurricular: match ? Number(match.semestre) : null,
      codigoMalla: match ? match.codigo : null,
      nombreMalla: match ? match.nombre : null
    };
  });
}
