import { Award, BookOpen, GraduationCap, TrendingUp, BarChart3, Clock, Users, AlertCircle } from 'lucide-react';
import ScoreCard from './ScoreCard';
import RecommendationPanel from './RecommendationPanel';
import RadarChart from './RadarChart';
import ExportPanel from './ExportPanel';
import { calculateExitIndicator } from '../utils/calculators';
import { generateRecommendations, getSummaryText } from '../utils/recommendations';
import { enrichGradesWithTraza } from '../utils/parsers';

const componentIcons = {
    approvalRate: BookOpen,
    performance: TrendingUp,
    permanence: Clock,
    repetition: BarChart3,
    criticality: Award,
    relevance: GraduationCap,
    demographic: Users
};

export default function Dashboard({ studentRecords, criticalityData, curriculumData, demographicData, studentRut }) {
    if (!studentRecords || studentRecords.length === 0) {
        return (
            <div className="dashboard-empty">
                <GraduationCap size={64} />
                <h2>Carga datos y busca un estudiante</h2>
                <p>Los resultados del Indicador de Egreso aparecerán aquí</p>
            </div>
        );
    }

    // FIX: Enriquecer registros antes del cálculo
    const enrichedGrades = enrichGradesWithTraza(studentRecords, curriculumData);

    const inMalla = enrichedGrades.filter(r => r.enMalla);
    const totalFilasNotas = studentRecords.length;
    const totalAsignaturasUnicasNotas = new Set(studentRecords.map(r => r.codigoAsignatura || r.nombreAsignatura)).size;
    const totalRamosMalla = curriculumData ? (Array.isArray(curriculumData) ? curriculumData.length : Object.keys(curriculumData).length) : 0;
    const uniqueMatchedCourses = new Set(inMalla.map(r => r.codigoMalla || r.nombreMalla)).size;

    // Top 20 unmatched
    const unmatched = enrichedGrades.filter(r => !r.enMalla);
    const unmatchedCounts = {};
    unmatched.forEach(r => {
        const key = r.nombreAsignatura || r.codigoAsignatura;
        unmatchedCounts[key] = (unmatchedCounts[key] || 0) + 1;
    });
    const topUnmatched = Object.entries(unmatchedCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    // Validación temporal extendida (Console)
    console.log("--- DEBUG IE CALCULATION ---");
    console.log("Total filas notas:", totalFilasNotas);
    console.log("Total asignaturas únicas notas:", totalAsignaturasUnicasNotas);
    console.log("Total ramos malla (aprox):", totalRamosMalla);
    console.log("Match count (filas):", inMalla.length);
    console.log("Unique matched courses:", uniqueMatchedCourses);
    console.log("Top unmatched:", topUnmatched);
    console.log("----------------------------");

    if (inMalla.length === 0) {
        return (
            <div className="dashboard-error" style={{ padding: '2rem', textAlign: 'center' }}>
                <AlertCircle size={64} color="var(--error-color)" />
                <h2 style={{ marginTop: '1rem' }}>No se logró mapear ningún ramo a la malla</h2>
                <p style={{ color: 'var(--text-muted)', maxWidth: '600px', margin: '1rem auto' }}>
                    El sistema no pudo encontrar coincidencias entre las asignaturas del Excel de notas y la estructura curricular cargada.
                </p>
                <div style={{
                    textAlign: 'left',
                    background: 'var(--card-bg)',
                    padding: '1.5rem',
                    borderRadius: '8px',
                    maxWidth: '800px',
                    margin: '2rem auto',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.9rem'
                }}>
                    <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>Información de Diagnóstico:</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div>
                            <strong>Total filas notas:</strong> {totalFilasNotas}<br />
                            <strong>Asignaturas únicas:</strong> {totalAsignaturasUnicasNotas}<br />
                            <strong>Ramos en malla:</strong> {totalRamosMalla}
                        </div>
                        <div>
                            <strong>Curriculum cargado:</strong> {curriculumData ? 'Sí' : 'No'}<br />
                            <strong>Estructura:</strong> {Array.isArray(curriculumData) ? 'Array' : 'Objeto'}<br />
                        </div>
                    </div>

                    <h5 style={{ marginBottom: '0.5rem' }}>Top 10 Asignaturas no encontradas en malla:</h5>
                    <ul style={{ paddingLeft: '1.5rem', marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
                        {topUnmatched.slice(0, 10).map(([name, count], i) => (
                            <li key={i}>{name} ({count} registros)</li>
                        ))}
                    </ul>

                    <h4 style={{ marginBottom: '1rem' }}>Sugerencias:</h4>
                    <ul style={{ paddingLeft: '1.5rem', lineHeight: '1.6' }}>
                        <li>Verifica que el archivo de <strong>Malla Curricular</strong> sea el correcto.</li>
                        <li>Asegúrate de no haber subido el JSON de criticidad en el espacio de la malla.</li>
                        <li>Revisa que los nombres o códigos de las asignaturas en el Excel coincidan con los de la malla.</li>
                    </ul>
                </div>
            </div>
        );
    }

    const indicatorResult = calculateExitIndicator(
        enrichedGrades,
        criticalityData,
        curriculumData,
        demographicData
    );

    const recommendations = generateRecommendations(indicatorResult, studentRecords, demographicData);
    const summaryText = getSummaryText(indicatorResult, demographicData);

    const { components, totalScore, level, levelClass, stats, malla } = indicatorResult;

    return (
        <div className="dashboard">
            {/* Main Score Display */}
            <div className="main-score-section">
                <div className="student-header">
                    <h2>
                        <GraduationCap size={28} />
                        Estudiante RUT: {studentRut}
                    </h2>
                    <span className="malla-badge">Malla: {malla}</span>
                </div>

                {stats.coveragePct < 80 && (
                    <div className="alert-warning" style={{
                        margin: '1rem 0',
                        padding: '1rem',
                        backgroundColor: 'rgba(255, 193, 7, 0.1)',
                        border: '1px solid #ffc107',
                        borderRadius: '8px',
                        display: 'flex',
                        gap: '10px',
                        color: 'var(--text-color)'
                    }}>
                        <span>⚠️</span>
                        <span>
                            <strong>Baja cobertura de malla ({Math.round(stats.coveragePct)}%)</strong>:
                            Solo se detectaron {stats.totalCourses} cursos de malla.
                            Revise que los nombres/códigos en el Excel coincidan con la estructura curricular cargada.
                        </span>
                    </div>
                )}

                <div className={`main-score-card ${levelClass}`}>
                    <div className="main-score-visual">
                        <div className="score-circle">
                            <svg viewBox="0 0 100 100">
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="45"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="8"
                                    opacity="0.2"
                                />
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="45"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="8"
                                    strokeDasharray={`${totalScore * 2.83} 283`}
                                    strokeLinecap="round"
                                    transform="rotate(-90 50 50)"
                                    className="score-circle-progress"
                                />
                            </svg>
                            <div className="score-circle-text">
                                <span className="score-number">{totalScore.toFixed(1)}</span>
                                <span className="score-symbol">%</span>
                            </div>
                        </div>
                    </div>

                    <div className="main-score-info">
                        <h3 className="score-title">Indicador de Egreso</h3>
                        <div className={`level-badge ${levelClass}`}>
                            Nivel {level}
                        </div>
                        <div className="quick-stats">
                            <div className="stat-item">
                                <span className="stat-value">{stats.totalCourses}</span>
                                <span className="stat-label">Cursos</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{stats.approvedCourses}</span>
                                <span className="stat-label">Aprobados</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{stats.averageGrade}</span>
                                <span className="stat-label">Promedio</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Summary Text */}
            <div className="summary-section">
                <div className="summary-card">
                    <h3>Resumen del Análisis</h3>
                    <p dangerouslySetInnerHTML={{ __html: summaryText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                </div>
            </div>

            {/* Components Breakdown */}
            <div className="components-section">
                <h2 className="section-title">
                    <BarChart3 size={24} />
                    Desglose de Componentes
                </h2>

                <div className="components-grid">
                    {Object.entries(components).map(([key, component]) => {
                        const Icon = componentIcons[key] || BarChart3;
                        return (
                            <div key={key} className="component-wrapper">
                                <ScoreCard component={component} />
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Classification Legend */}
            <div className="classification-legend">
                <h4>Clasificación:</h4>
                <div className="legend-items">
                    <div className="legend-item high">
                        <span className="legend-dot"></span>
                        ≥ 80% Nivel Alto
                    </div>
                    <div className="legend-item medium">
                        <span className="legend-dot"></span>
                        60-79.9% Nivel Medio
                    </div>
                    <div className="legend-item low">
                        <span className="legend-dot"></span>
                        &lt; 60% Nivel Bajo
                    </div>
                </div>
            </div>

            {/* Recommendations */}
            <RecommendationPanel recommendations={recommendations} />

            {/* Radar Chart Visualization */}
            <RadarChart components={components} />

            {/* Export Panel */}
            <ExportPanel
                indicatorResult={indicatorResult}
                studentRut={studentRut}
                demographicData={demographicData}
            />

            {/* Demographic Note */}
            {demographicData && (
                <div className="demographic-note">
                    <h4>📋 Datos demográficos utilizados:</h4>
                    <ul>
                        <li><strong>Género:</strong> {demographicData.genero || 'No especificado'}</li>
                        <li><strong>Ciudad:</strong> {demographicData.ciudad || 'No especificada'}</li>
                        <li><strong>Tipo de colegio:</strong> {demographicData.tipoColegio || 'No especificado'}</li>
                    </ul>
                </div>
            )}
        </div>
    );
}
