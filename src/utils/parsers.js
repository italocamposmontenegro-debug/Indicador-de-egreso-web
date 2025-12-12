import * as XLSX from 'xlsx';

/**
 * Parse an Excel file (.xlsx) containing student grades
 * Expected columns: RUT, Codigo Asignatura, Nombre Asignatura, Nota, Semestre, Anio, Oportunidad, Malla
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
                        const lowerKey = key.toLowerCase().trim();
                        if (lowerKey.includes('rut')) normalized.rut = String(row[key]).replace(/\./g, '').split('-')[0];
                        else if (lowerKey.includes('codigo') || lowerKey.includes('sigla')) normalized.codigoAsignatura = row[key];
                        else if (lowerKey.includes('asignatura') || lowerKey.includes('nombre')) normalized.nombreAsignatura = row[key];
                        else if (lowerKey.includes('nota') || lowerKey.includes('calificacion')) normalized.nota = parseFloat(row[key]) || 0;
                        else if (lowerKey.includes('semestre')) normalized.semestre = parseInt(row[key]) || 1;
                        else if (lowerKey.includes('año') || lowerKey.includes('anio') || lowerKey.includes('year')) normalized.anio = parseInt(row[key]) || 0;
                        else if (lowerKey.includes('oportunidad') || lowerKey.includes('intento')) normalized.oportunidad = parseInt(row[key]) || 1;
                        else if (lowerKey.includes('malla') || lowerKey.includes('plan')) normalized.malla = row[key];
                        else if (lowerKey.includes('estado') || lowerKey.includes('aprobado')) normalized.estado = row[key];
                    });
                    // Default values
                    normalized.oportunidad = normalized.oportunidad || 1;
                    normalized.malla = normalized.malla || 'default';
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

                const headers = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase());
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
                    });

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
                        // Normalize the grade data
                        const normalizedData = data.map(row => {
                            return {
                                rut: String(row.rut || row.RUT || '').replace(/\./g, '').split('-')[0],
                                codigoAsignatura: row.codigoAsignatura || row.codigo || row.sigla || row.Codigo || '',
                                nombreAsignatura: row.nombreAsignatura || row.nombre || row.Nombre || row.asignatura || '',
                                nota: parseFloat(row.nota || row.Nota || row.calificacion || 0) || 0,
                                semestre: parseInt(row.semestre || row.Semestre || row.semester || 1, 10) || 1,
                                anio: parseInt(row.anio || row.año || row.Anio || row.year || 0, 10) || 0,
                                oportunidad: parseInt(row.oportunidad || row.intento || row.Oportunidad || 1, 10) || 1,
                                malla: row.malla || row.plan || row.Malla || 'default',
                                estado: row.estado || row.Estado || ''
                            };
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
