/**
 * RadarChart Component
 * Displays the 7 Exit Indicator components in a spider/radar chart visualization
 * Pure SVG implementation - no external dependencies
 */

export default function RadarChart({ components }) {
    const size = 300;
    const center = size / 2;
    const radius = 120;
    const levels = 5; // Concentric circles

    // Component keys and their short labels for the chart
    const componentKeys = Object.keys(components);
    const shortLabels = {
        approvalRate: 'Aprobación',
        performance: 'Rendimiento',
        permanence: 'Permanencia',
        repetition: 'Repetición',
        criticality: 'Criticidad',
        relevance: 'Semestre',
        demographic: 'Demográfico'
    };

    const numPoints = componentKeys.length;
    const angleStep = (2 * Math.PI) / numPoints;

    // Calculate point position on the radar
    const getPoint = (index, value) => {
        const angle = (index * angleStep) - (Math.PI / 2); // Start from top
        const r = radius * value;
        return {
            x: center + r * Math.cos(angle),
            y: center + r * Math.sin(angle)
        };
    };

    // Generate background polygon points (100% level)
    const bgPoints = componentKeys.map((_, i) => {
        const point = getPoint(i, 1);
        return `${point.x},${point.y}`;
    }).join(' ');

    // Generate data polygon points
    const dataPoints = componentKeys.map((key, i) => {
        const value = components[key].value;
        const point = getPoint(i, value);
        return `${point.x},${point.y}`;
    }).join(' ');

    // Generate concentric circles for scale
    const circles = [];
    for (let i = 1; i <= levels; i++) {
        const r = (radius / levels) * i;
        circles.push(
            <circle
                key={i}
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke="var(--border-color)"
                strokeWidth="1"
                opacity={0.5}
            />
        );
    }

    // Generate axis lines
    const axes = componentKeys.map((_, i) => {
        const point = getPoint(i, 1);
        return (
            <line
                key={i}
                x1={center}
                y1={center}
                x2={point.x}
                y2={point.y}
                className="radar-axis"
            />
        );
    });

    // Generate labels
    const labels = componentKeys.map((key, i) => {
        const point = getPoint(i, 1.25); // Position labels outside the chart
        const value = components[key].value;
        return (
            <g key={key}>
                <text
                    x={point.x}
                    y={point.y}
                    className="radar-label"
                    dominantBaseline="middle"
                >
                    {shortLabels[key] || key}
                </text>
                <text
                    x={point.x}
                    y={point.y + 14}
                    className="radar-value"
                    dominantBaseline="middle"
                >
                    {(value * 100).toFixed(0)}%
                </text>
            </g>
        );
    });

    // Generate data points (circles on the polygon vertices)
    const dataCircles = componentKeys.map((key, i) => {
        const value = components[key].value;
        const point = getPoint(i, value);
        return (
            <circle
                key={key}
                cx={point.x}
                cy={point.y}
                r={4}
                fill="var(--accent)"
                stroke="var(--bg-primary)"
                strokeWidth={2}
            />
        );
    });

    return (
        <div className="radar-chart-section">
            <h2 className="section-title">
                📊 Visualización Radar
            </h2>

            <div className="radar-container">
                <svg
                    viewBox={`0 0 ${size} ${size}`}
                    className="radar-chart"
                    style={{ overflow: 'visible' }}
                >
                    {/* Background circles */}
                    {circles}

                    {/* Axis lines */}
                    {axes}

                    {/* Background polygon (100% reference) */}
                    <polygon
                        points={bgPoints}
                        className="radar-polygon-bg"
                    />

                    {/* Data polygon */}
                    <polygon
                        points={dataPoints}
                        className="radar-polygon-data"
                    />

                    {/* Data points */}
                    {dataCircles}

                    {/* Labels */}
                    {labels}
                </svg>
            </div>
        </div>
    );
}
