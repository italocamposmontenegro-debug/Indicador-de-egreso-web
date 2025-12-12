export default function ScoreCard({ component, showDetails = true }) {
    const { label, value, weight, weightedValue, description } = component;
    const percentage = (value * 100).toFixed(1);
    const weightedPercentage = (weightedValue * 100).toFixed(1);
    const weightPercentage = (weight * 100).toFixed(0);

    // Determine color based on value
    let colorClass = 'medium';
    if (value >= 0.8) colorClass = 'high';
    else if (value < 0.5) colorClass = 'low';

    return (
        <div className={`score-card ${colorClass}`}>
            <div className="score-card-header">
                <h4 className="score-label">{label}</h4>
                <span className="score-weight">{weightPercentage}%</span>
            </div>

            <div className="score-value-container">
                <div className="score-main-value">
                    <span className="score-percentage">{percentage}%</span>
                </div>
                <div className="score-bar-container">
                    <div
                        className="score-bar"
                        style={{ width: `${Math.min(100, percentage)}%` }}
                    />
                </div>
            </div>

            {showDetails && (
                <div className="score-details">
                    <p className="score-description">{description}</p>
                    <p className="score-contribution">
                        Aporte al indicador: <strong>{weightedPercentage}%</strong>
                    </p>
                </div>
            )}
        </div>
    );
}
