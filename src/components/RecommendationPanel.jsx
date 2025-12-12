import { Lightbulb, AlertTriangle, CheckCircle, Info, Target, TrendingUp } from 'lucide-react';

const iconMap = {
    '🏆': CheckCircle,
    '📊': TrendingUp,
    '🚨': AlertTriangle,
    '📉': TrendingUp,
    '📚': Lightbulb,
    '🎓': Target,
    '🔄': Info,
    '🤝': Info,
    '🏠': Info,
    '🎯': Target,
    '⚡': TrendingUp,
    '🚀': CheckCircle
};

export default function RecommendationPanel({ recommendations }) {
    if (!recommendations || recommendations.length === 0) {
        return null;
    }

    return (
        <div className="recommendations-container">
            <h2 className="section-title">
                <Lightbulb size={24} />
                Recomendaciones Personalizadas
            </h2>

            <div className="recommendations-grid">
                {recommendations.map((rec, index) => {
                    const IconComponent = iconMap[rec.icon] || Info;

                    return (
                        <div key={index} className={`recommendation-card ${rec.type}`}>
                            <div className="rec-header">
                                <div className="rec-icon-wrapper">
                                    <span className="rec-emoji">{rec.icon}</span>
                                </div>
                                <div className="rec-title-group">
                                    <span className="rec-category">{rec.category}</span>
                                    <h3 className="rec-title">{rec.title}</h3>
                                </div>
                            </div>

                            <p className="rec-description">{rec.description}</p>

                            {rec.actions && rec.actions.length > 0 && (
                                <ul className="rec-actions">
                                    {rec.actions.map((action, actionIdx) => (
                                        <li key={actionIdx}>{action}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
