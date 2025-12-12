import { useState, useMemo } from 'react';
import { Search, User, MapPin, School, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { getStudentRecords, getUniqueStudents } from '../utils/parsers';

export default function StudentSearch({ gradesData, onStudentSelect, onDemographicChange }) {
    const [rut, setRut] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [demographic, setDemographic] = useState({
        genero: '',
        ciudad: '',
        tipoColegio: ''
    });
    const [showAllStudents, setShowAllStudents] = useState(false);
    const [sortColumn, setSortColumn] = useState('rut');
    const [sortDirection, setSortDirection] = useState('asc');

    // Calculate student statistics for the table
    const studentStats = useMemo(() => {
        if (!gradesData || gradesData.length === 0) return [];

        const statsMap = new Map();

        gradesData.forEach(record => {
            if (!record.rut) return;

            if (!statsMap.has(record.rut)) {
                statsMap.set(record.rut, {
                    rut: record.rut,
                    malla: record.malla || 'default',
                    courses: new Set(),
                    grades: [],
                    approvedCount: 0
                });
            }

            const stats = statsMap.get(record.rut);
            const courseKey = record.codigoAsignatura || record.nombreAsignatura;

            if (!stats.courses.has(courseKey)) {
                stats.courses.add(courseKey);
            }

            if (record.nota > 0) {
                stats.grades.push(record.nota);
            }

            if (record.nota >= 4.0) {
                stats.approvedCount++;
            }
        });

        return Array.from(statsMap.values()).map(s => ({
            rut: s.rut,
            malla: s.malla,
            totalCourses: s.courses.size,
            avgGrade: s.grades.length > 0
                ? (s.grades.reduce((a, b) => a + b, 0) / s.grades.length).toFixed(2)
                : '0.00'
        }));
    }, [gradesData]);

    // Filter and sort students
    const filteredStudents = useMemo(() => {
        let filtered = studentStats;

        // Filter by RUT search
        if (rut.trim()) {
            filtered = filtered.filter(s =>
                s.rut.toLowerCase().includes(rut.trim().toLowerCase())
            );
        }

        // Sort
        filtered.sort((a, b) => {
            let comparison = 0;
            switch (sortColumn) {
                case 'rut':
                    comparison = a.rut.localeCompare(b.rut);
                    break;
                case 'courses':
                    comparison = a.totalCourses - b.totalCourses;
                    break;
                case 'grade':
                    comparison = parseFloat(a.avgGrade) - parseFloat(b.avgGrade);
                    break;
                default:
                    comparison = 0;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return filtered;
    }, [studentStats, rut, sortColumn, sortDirection]);

    // Students to display (limited unless "show all" is clicked)
    const displayedStudents = showAllStudents
        ? filteredStudents
        : filteredStudents.slice(0, 10);

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const handleRowClick = (studentRut) => {
        setRut(studentRut);
        handleSearch(studentRut);
    };

    const handleSearch = (searchRut = rut) => {
        if (!searchRut.trim()) {
            setSearchResult({ error: 'Ingresa un RUT para buscar' });
            return;
        }

        if (!gradesData || gradesData.length === 0) {
            setSearchResult({ error: 'No hay datos cargados. Carga un archivo de notas primero.' });
            return;
        }

        const records = getStudentRecords(gradesData, searchRut);

        if (records.length === 0) {
            setSearchResult({ error: `No se encontraron registros para el RUT ${searchRut}` });
            return;
        }

        setSearchResult({
            success: true,
            count: records.length,
            malla: records[0].malla || 'No especificada'
        });
    };

    const handleCalculate = () => {
        if (!searchResult?.success) return;

        const records = getStudentRecords(gradesData, rut);
        onStudentSelect(records, rut);
        onDemographicChange(demographic);
    };

    const handleDemographicChange = (field, value) => {
        const updated = { ...demographic, [field]: value };
        setDemographic(updated);
    };

    const SortIcon = ({ column }) => {
        if (sortColumn !== column) return null;
        return sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
    };

    return (
        <div className="student-search-container">
            <h2 className="section-title">
                <Search size={24} />
                Consulta de Estudiante
            </h2>

            <div className="search-form">
                <div className="search-input-group">
                    <label htmlFor="rut-input">RUT (sin dígito verificador)</label>
                    <div className="input-with-button">
                        <input
                            id="rut-input"
                            type="text"
                            value={rut}
                            onChange={(e) => setRut(e.target.value)}
                            placeholder="Ej: 12345678"
                            className="search-input"
                            list="rut-suggestions"
                        />
                        <datalist id="rut-suggestions">
                            {filteredStudents.slice(0, 5).map(s => (
                                <option key={s.rut} value={s.rut} />
                            ))}
                        </datalist>
                        <button onClick={() => handleSearch()} className="btn btn-secondary">
                            <Search size={18} />
                            Buscar
                        </button>
                    </div>
                </div>

                {searchResult && (
                    <div className={`search-result ${searchResult.error ? 'error' : 'success'}`}>
                        {searchResult.error ? (
                            <p>{searchResult.error}</p>
                        ) : (
                            <p>
                                ✓ Encontrados <strong>{searchResult.count}</strong> registros
                                | Malla: <strong>{searchResult.malla}</strong>
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Student Table */}
            {studentStats.length > 0 && (
                <div className="students-table-section">
                    <h3 className="subsection-title">
                        <Users size={20} />
                        Estudiantes Disponibles ({studentStats.length})
                    </h3>

                    <div className="table-container">
                        <table className="students-table">
                            <thead>
                                <tr>
                                    <th onClick={() => handleSort('rut')} className="sortable">
                                        RUT <SortIcon column="rut" />
                                    </th>
                                    <th onClick={() => handleSort('courses')} className="sortable">
                                        Cursos <SortIcon column="courses" />
                                    </th>
                                    <th onClick={() => handleSort('grade')} className="sortable">
                                        Promedio <SortIcon column="grade" />
                                    </th>
                                    <th>Malla</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedStudents.map(student => (
                                    <tr
                                        key={student.rut}
                                        onClick={() => handleRowClick(student.rut)}
                                        className={rut === student.rut ? 'selected' : ''}
                                    >
                                        <td className="rut-cell">{student.rut}</td>
                                        <td>{student.totalCourses}</td>
                                        <td className={parseFloat(student.avgGrade) >= 4.0 ? 'grade-pass' : 'grade-fail'}>
                                            {student.avgGrade}
                                        </td>
                                        <td>{student.malla}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {filteredStudents.length > 10 && (
                        <button
                            className="btn btn-ghost show-more-btn"
                            onClick={() => setShowAllStudents(!showAllStudents)}
                        >
                            {showAllStudents
                                ? `Mostrar menos`
                                : `Mostrar todos (${filteredStudents.length})`}
                        </button>
                    )}
                </div>
            )}

            {searchResult?.success && (
                <div className="demographic-form">
                    <h3 className="subsection-title">
                        <Users size={20} />
                        Datos Demográficos
                    </h3>
                    <p className="hint-text">Completa estos datos para calcular el índice demográfico (5%)</p>

                    <div className="demographic-grid">
                        <div className="form-group">
                            <label>
                                <User size={16} />
                                Género
                            </label>
                            <div className="radio-group">
                                <label className="radio-label">
                                    <input
                                        type="radio"
                                        name="genero"
                                        value="mujer"
                                        checked={demographic.genero === 'mujer'}
                                        onChange={(e) => handleDemographicChange('genero', e.target.value)}
                                    />
                                    <span>Mujer</span>
                                </label>
                                <label className="radio-label">
                                    <input
                                        type="radio"
                                        name="genero"
                                        value="hombre"
                                        checked={demographic.genero === 'hombre'}
                                        onChange={(e) => handleDemographicChange('genero', e.target.value)}
                                    />
                                    <span>Hombre</span>
                                </label>
                                <label className="radio-label">
                                    <input
                                        type="radio"
                                        name="genero"
                                        value="otro"
                                        checked={demographic.genero === 'otro'}
                                        onChange={(e) => handleDemographicChange('genero', e.target.value)}
                                    />
                                    <span>Otro</span>
                                </label>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>
                                <MapPin size={16} />
                                Ciudad de Origen
                            </label>
                            <div className="radio-group">
                                <label className="radio-label">
                                    <input
                                        type="radio"
                                        name="ciudad"
                                        value="santiago"
                                        checked={demographic.ciudad === 'santiago'}
                                        onChange={(e) => handleDemographicChange('ciudad', e.target.value)}
                                    />
                                    <span>Santiago</span>
                                </label>
                                <label className="radio-label">
                                    <input
                                        type="radio"
                                        name="ciudad"
                                        value="otra"
                                        checked={demographic.ciudad === 'otra'}
                                        onChange={(e) => handleDemographicChange('ciudad', e.target.value)}
                                    />
                                    <span>Fuera de Santiago</span>
                                </label>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>
                                <School size={16} />
                                Tipo de Colegio
                            </label>
                            <div className="radio-group">
                                <label className="radio-label">
                                    <input
                                        type="radio"
                                        name="tipoColegio"
                                        value="publico"
                                        checked={demographic.tipoColegio === 'publico'}
                                        onChange={(e) => handleDemographicChange('tipoColegio', e.target.value)}
                                    />
                                    <span>Público/Municipal</span>
                                </label>
                                <label className="radio-label">
                                    <input
                                        type="radio"
                                        name="tipoColegio"
                                        value="privado"
                                        checked={demographic.tipoColegio === 'privado'}
                                        onChange={(e) => handleDemographicChange('tipoColegio', e.target.value)}
                                    />
                                    <span>Privado</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <button onClick={handleCalculate} className="btn btn-primary btn-lg">
                        Calcular Indicador de Egreso
                    </button>
                </div>
            )}
        </div>
    );
}
