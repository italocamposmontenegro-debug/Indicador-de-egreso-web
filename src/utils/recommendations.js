/**
 * UVM Kinesiology Personalized Recommendations Engine
 * Generates tailored improvement strategies based on student profile
 */

/**
 * Generate comprehensive recommendations based on Exit Indicator results
 */
export function generateRecommendations(indicatorResult, studentRecords, demographicData) {
    const recommendations = [];
    const { components, level, totalScore, stats } = indicatorResult;

    // A. Academic Achievement Recommendations
    recommendations.push(...getAcademicRecommendations(components, level, stats));

    // B. Curricular Structure Recommendations
    recommendations.push(...getCurriculumRecommendations(studentRecords, stats));

    // C. Contextual Factors Recommendations
    if (components.demographic.value < 0.5) {
        recommendations.push(...getContextualRecommendations(demographicData));
    }

    // D. Overall Profile Strategy
    recommendations.push(...getProfileStrategy(level, totalScore, components));

    return recommendations;
}

/**
 * A. Academic Achievement Recommendations
 */
function getAcademicRecommendations(components, level, stats) {
    const recommendations = [];

    if (level === 'Alto') {
        recommendations.push({
            category: 'Logros Académicos',
            type: 'success',
            icon: '🏆',
            title: 'Potenciación y Especialización',
            description: 'Tu rendimiento sobresaliente te posiciona para oportunidades avanzadas.',
            actions: [
                'Considera postular a programas de ayudantía en asignaturas de tu fortaleza',
                'Explora oportunidades de investigación con docentes del área',
                'Participa en congresos o seminarios de kinesiología',
                'Inicia networking con profesionales del campo para prácticas avanzadas'
            ]
        });
    } else if (level === 'Medio') {
        recommendations.push({
            category: 'Logros Académicos',
            type: 'warning',
            icon: '📊',
            title: 'Consolidación Académica',
            description: 'Tienes una base sólida que requiere fortalecimiento en áreas específicas.',
            actions: [
                'Identifica las 2-3 asignaturas con menor rendimiento y prioriza su mejora',
                'Establece un horario de estudio estructurado de al menos 2 horas diarias',
                'Forma o únete a grupos de estudio para las materias más desafiantes',
                'Utiliza las tutorías disponibles en la universidad'
            ]
        });
    } else {
        recommendations.push({
            category: 'Logros Académicos',
            type: 'danger',
            icon: '🚨',
            title: 'Recuperación y Apoyo Intensivo',
            description: 'Es necesario implementar estrategias urgentes de mejora académica.',
            actions: [
                'Solicita una reunión con el coordinador de carrera para revisar tu situación',
                'Inscríbete en el programa de acompañamiento académico de la universidad',
                'Considera reducir la carga académica el próximo semestre',
                'Busca apoyo del área de bienestar estudiantil',
                'Establece metas pequeñas y alcanzables semana a semana'
            ]
        });
    }

    // Specific component-based recommendations
    if (components.approvalRate.value < 0.7) {
        recommendations.push({
            category: 'Tasa de Aprobación',
            type: 'warning',
            icon: '📉',
            title: 'Mejorar Tasa de Aprobación',
            description: `Tu tasa actual es ${(components.approvalRate.value * 100).toFixed(1)}%. El objetivo mínimo es 70%.`,
            actions: [
                'Revisa las asignaturas reprobadas e identifica patrones de dificultad',
                'Planifica retomar estas asignaturas con estrategias diferentes',
                'Considera asistir a clases de reforzamiento antes de reinscribirte'
            ]
        });
    }

    if (components.performance.value < 0.6) {
        recommendations.push({
            category: 'Rendimiento',
            type: 'warning',
            icon: '📚',
            title: 'Elevar Promedio de Notas',
            description: `Tu promedio ponderado normalizado es ${(components.performance.value * 7).toFixed(2)}. Meta: sobre 4.5.`,
            actions: [
                'Revisa técnicas de estudio efectivas (método Pomodoro, mapas mentales)',
                'Prioriza la comprensión sobre la memorización',
                'Consulta material complementario y videos educativos'
            ]
        });
    }

    return recommendations;
}

/**
 * B. Curriculum Structure Recommendations
 */
function getCurriculumRecommendations(studentRecords, stats) {
    const recommendations = [];

    // Determine formative stage
    const currentSemester = stats.currentSemester;
    let stage, stageDescription;

    if (currentSemester <= 2) {
        stage = 'Básica';
        stageDescription = 'Etapa de fundamentos científicos y ciencias básicas';
    } else if (currentSemester <= 6) {
        stage = 'Intermedia';
        stageDescription = 'Etapa de formación disciplinar y especialización';
    } else {
        stage = 'Profesionalizante';
        stageDescription = 'Etapa de integración clínica y práctica profesional';
    }

    recommendations.push({
        category: 'Estructura Curricular',
        type: 'info',
        icon: '🎓',
        title: `Etapa Formativa: ${stage}`,
        description: stageDescription,
        actions: getStageActions(stage)
    });

    // Check for courses with multiple attempts
    const courseAttempts = new Map();
    studentRecords.forEach(record => {
        const key = record.codigoAsignatura || record.nombreAsignatura;
        const attempt = record.oportunidad || 1;
        if (!courseAttempts.has(key) || attempt > courseAttempts.get(key)) {
            courseAttempts.set(key, attempt);
        }
    });

    const repeatedCourses = Array.from(courseAttempts.entries())
        .filter(([, attempts]) => attempts > 1)
        .map(([name, attempts]) => ({ name, attempts }));

    if (repeatedCourses.length > 0) {
        recommendations.push({
            category: 'Asignaturas Repetidas',
            type: 'warning',
            icon: '🔄',
            title: 'Asignaturas con Múltiples Intentos',
            description: `Tienes ${repeatedCourses.length} asignatura(s) cursada(s) más de una vez.`,
            actions: [
                ...repeatedCourses.slice(0, 3).map(c =>
                    `${c.name}: ${c.attempts} intentos - Considera apoyo especializado`
                ),
                repeatedCourses.length > 3 ? `... y ${repeatedCourses.length - 3} más` : null
            ].filter(Boolean)
        });
    }

    return recommendations;
}

function getStageActions(stage) {
    switch (stage) {
        case 'Básica':
            return [
                'Enfócate en construir bases sólidas en anatomía y fisiología',
                'Desarrolla hábitos de estudio que te acompañarán toda la carrera',
                'Aprovecha los laboratorios prácticos al máximo',
                'Conecta con compañeros de semestres superiores para orientación'
            ];
        case 'Intermedia':
            return [
                'Comienza a identificar áreas de especialización que te interesen',
                'Participa en actividades prácticas y simulaciones clínicas',
                'Fortalece habilidades de evaluación y diagnóstico funcional',
                'Considera iniciar observación en centros de práctica'
            ];
        case 'Profesionalizante':
            return [
                'Prepárate intensivamente para las prácticas profesionales',
                'Desarrolla tu portafolio de casos clínicos',
                'Investiga opciones de especialización post-título',
                'Construye tu red profesional activamente'
            ];
        default:
            return ['Consulta con tu coordinador académico para orientación personalizada'];
    }
}

/**
 * C. Contextual Factors Recommendations
 */
function getContextualRecommendations(demographicData) {
    const recommendations = [];

    recommendations.push({
        category: 'Apoyo Institucional',
        type: 'info',
        icon: '🤝',
        title: 'Recursos de Apoyo Disponibles',
        description: 'Basado en tu perfil, podrías beneficiarte de programas institucionales.',
        actions: [
            'Consulta sobre becas de mantención y apoyo económico',
            'Revisa programas de tutoría entre pares',
            'Accede a servicios de orientación vocacional y psicológica',
            'Participa en programas de integración universitaria'
        ]
    });

    if (demographicData?.ciudad && !demographicData.ciudad.toLowerCase().includes('viña') &&
        !demographicData.ciudad.toLowerCase().includes('valparaiso')) {
        recommendations.push({
            category: 'Estudiante Foráneo',
            type: 'info',
            icon: '🏠',
            title: 'Apoyo para Estudiantes de Otras Ciudades',
            description: 'Como estudiante de fuera de la región, existen recursos especiales.',
            actions: [
                'Infórmate sobre residencias estudiantiles y convenios de alojamiento',
                'Únete a grupos de estudiantes de tu región de origen',
                'Planifica viajes con anticipación para optimizar tiempos'
            ]
        });
    }

    return recommendations;
}

/**
 * D. Overall Profile Strategy
 */
function getProfileStrategy(level, totalScore, components) {
    const recommendations = [];

    // Find weakest components
    const sortedComponents = Object.entries(components)
        .map(([key, comp]) => ({ key, ...comp }))
        .sort((a, b) => a.value - b.value);

    const weakestComponents = sortedComponents.slice(0, 2);

    if (level === 'Bajo') {
        recommendations.push({
            category: 'Estrategia General',
            type: 'danger',
            icon: '🎯',
            title: 'Plan de Estabilización',
            description: `Indicador actual: ${totalScore.toFixed(1)}%. Prioridad: estabilizar y recuperar.`,
            actions: [
                'Agenda una cita urgente con tu jefe de carrera',
                `Área crítica 1: ${weakestComponents[0].label} (${(weakestComponents[0].value * 100).toFixed(0)}%)`,
                `Área crítica 2: ${weakestComponents[1].label} (${(weakestComponents[1].value * 100).toFixed(0)}%)`,
                'Considera un semestre de consolidación con carga reducida',
                'Establece un sistema de acompañamiento cercano con tutor asignado'
            ]
        });
    } else if (level === 'Medio') {
        recommendations.push({
            category: 'Estrategia General',
            type: 'warning',
            icon: '⚡',
            title: 'Plan de Optimización',
            description: `Indicador actual: ${totalScore.toFixed(1)}%. Objetivo: superar el 80%.`,
            actions: [
                `Fortalece: ${weakestComponents[0].label} (${(weakestComponents[0].value * 100).toFixed(0)}%)`,
                `Mejora: ${weakestComponents[1].label} (${(weakestComponents[1].value * 100).toFixed(0)}%)`,
                'Mantén las fortalezas mientras trabajas en las debilidades',
                'Establece metas mensuales de mejora medibles'
            ]
        });
    } else {
        recommendations.push({
            category: 'Estrategia General',
            type: 'success',
            icon: '🚀',
            title: 'Plan de Proyección Profesional',
            description: `Indicador sobresaliente: ${totalScore.toFixed(1)}%. Momento de proyectarte.`,
            actions: [
                'Explora programas de intercambio o pasantías internacionales',
                'Considera postular a becas de posgrado o especialización',
                'Desarrolla un proyecto de investigación o innovación',
                'Inicia tu marca profesional (LinkedIn, portafolio digital)',
                'Busca mentores en el área de kinesiología que te interese'
            ]
        });
    }

    return recommendations;
}

/**
 * Get a summary text for the student's overall situation
 */
export function getSummaryText(indicatorResult, demographicData) {
    const { level, totalScore, stats, malla } = indicatorResult;

    let levelText;
    switch (level) {
        case 'Alto':
            levelText = 'excelente desempeño';
            break;
        case 'Medio':
            levelText = 'desempeño satisfactorio con oportunidades de mejora';
            break;
        case 'Bajo':
            levelText = 'desempeño que requiere atención prioritaria';
            break;
        default:
            levelText = 'desempeño evaluado';
    }

    const demographicNote = demographicData ?
        `\n\n📋 Datos demográficos considerados: Género: ${demographicData.genero || 'No especificado'}, ` +
        `Ciudad: ${demographicData.ciudad || 'No especificada'}, ` +
        `Tipo de colegio: ${demographicData.tipoColegio || 'No especificado'}.` : '';

    return `El estudiante presenta un **${levelText}** con un Indicador de Egreso de **${totalScore.toFixed(1)}%** ` +
        `(Nivel ${level}). Ha cursado ${stats.totalCourses} asignaturas, ` +
        `aprobando ${stats.approvedCourses} con un promedio de ${stats.averageGrade}. ` +
        demographicNote;
}
