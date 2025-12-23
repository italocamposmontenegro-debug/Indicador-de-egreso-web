import { useState, useRef } from 'react';
import { Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react';
import { parseFile } from '../utils/parsers';
import { normalizeCourseName } from '../utils/mallaIndex';

export default function FileUpload({ onDataLoaded, loadedFiles }) {
    const [dragActive, setDragActive] = useState(false);
    const [errors, setErrors] = useState([]);
    const fileInputRef = useRef(null);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const processFiles = async (files) => {
        setErrors([]);
        const newErrors = [];

        for (const file of files) {
            try {
                const data = await parseFile(file);
                const fileType = detectFileType(file.name, data);

                // Hard validation for curriculum
                if (fileType === 'curriculum') {
                    const isValid = validateCurriculumStructure(data);
                    if (!isValid) {
                        newErrors.push({
                            file: file.name,
                            error: 'El archivo de malla curricular no tiene estructura válida (falta semestres o plan). Revisa que no estés subiendo el JSON de criticidad en el slot de malla.'
                        });
                        continue;
                    }
                }

                onDataLoaded(fileType, data, file.name);
            } catch (error) {
                newErrors.push({ file: file.name, error: error.message });
            }
        }

        if (newErrors.length > 0) {
            setErrors(newErrors);
        }
    };

    const validateCurriculumStructure = (data) => {
        if (!data || typeof data !== 'object') return false;

        // Check for common curriculum structures
        const keys = Object.keys(data).map(k => k.toLowerCase());
        const hasSemestres = keys.some(k => k.includes('semestre') || k.includes('plan') || k.includes('nivel'));

        if (Array.isArray(data)) {
            // If array, check if first item looks like a course or a semester container
            const first = data[0];
            if (!first) return false;
            const firstKeys = Object.keys(first).map(k => k.toLowerCase());
            return firstKeys.some(k => k.includes('codigo') || k.includes('asignatura') || k.includes('nombre') || k.includes('semestre'));
        }

        return hasSemestres || keys.length > 0;
    };

    const detectFileType = (filename, data) => {
        const lowerName = filename.toLowerCase();

        // Check data structure first (more reliable than filename)
        if (Array.isArray(data) && data.length > 0) {
            const sample = data[0];
            const keys = Object.keys(sample).map(k => normalizeCourseName(k, true));

            // Grades usually have RUT and NOTA
            if (keys.some(k => k.includes('RUT')) && keys.some(k => k.includes('NOTA') || k.includes('CALIFICACION'))) {
                return 'grades';
            }

            // Criticality usually has CODIGO and CRITICIDAD
            if (keys.some(k => k.includes('CODIGO')) && keys.some(k => k.includes('CRITICIDAD'))) {
                return 'criticality';
            }
        } else if (data && typeof data === 'object') {
            // Curriculum usually has semestres or nested structures
            const keys = Object.keys(data).map(k => k.toLowerCase());
            if (keys.some(k => k.includes('semestre') || k.includes('plan') || k.includes('malla'))) {
                return 'curriculum';
            }
        }

        // Fallback to filename
        if (lowerName.includes('criticidad') || lowerName.includes('critical')) {
            return 'criticality';
        }

        if (lowerName.includes('malla') || lowerName.includes('curriculum') || lowerName.includes('estructura')) {
            return 'curriculum';
        }

        if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.csv')) {
            return 'grades';
        }

        return 'unknown';
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const files = [...e.dataTransfer.files];
        await processFiles(files);
    };

    const handleFileInput = async (e) => {
        const files = [...e.target.files];
        await processFiles(files);
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="file-upload-container">
            <h2 className="section-title">
                <Upload size={24} />
                Carga de Archivos
            </h2>

            <div
                className={`dropzone ${dragActive ? 'active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={handleClick}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".xlsx,.xls,.csv,.json"
                    onChange={handleFileInput}
                    style={{ display: 'none' }}
                />

                <div className="dropzone-content">
                    <Upload size={48} className="dropzone-icon" />
                    <p className="dropzone-text">
                        Arrastra archivos aquí o <span className="dropzone-link">haz clic para seleccionar</span>
                    </p>
                    <p className="dropzone-hint">
                        Formatos aceptados: .xlsx, .csv, .json
                    </p>
                </div>
            </div>

            {errors.length > 0 && (
                <div className="upload-errors">
                    {errors.map((err, idx) => (
                        <div key={idx} className="error-item">
                            <AlertCircle size={16} />
                            <span><strong>{err.file}:</strong> {err.error}</span>
                        </div>
                    ))}
                </div>
            )}

            {loadedFiles && Object.keys(loadedFiles).length > 0 && (
                <div className="loaded-files">
                    <h3>Archivos cargados:</h3>
                    <div className="files-list">
                        {Object.entries(loadedFiles).map(([type, info]) => (
                            <div key={type} className="file-item">
                                <CheckCircle size={16} className="success-icon" />
                                <FileText size={16} />
                                <span className="file-name">{info.filename}</span>
                                <span className="file-type-badge">{getTypeLabel(type)}</span>
                                <span className="file-count">
                                    {Array.isArray(info.data) ? `${info.data.length} registros` : 'Datos cargados'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="file-types-info">
                <h4>Tipos de archivos esperados:</h4>
                <ul>
                    <li><strong>Notas académicas:</strong> Excel/CSV con columnas RUT, Asignatura, Nota, Semestre, etc.</li>
                    <li><strong>Criticidad:</strong> JSON con niveles de criticidad por asignatura</li>
                    <li><strong>Estructura curricular:</strong> JSON con definición de malla y semestres</li>
                </ul>
            </div>
        </div>
    );
}

function getTypeLabel(type) {
    const labels = {
        grades: 'Notas',
        criticality: 'Criticidad',
        curriculum: 'Malla',
        unknown: 'Desconocido'
    };
    return labels[type] || type;
}
