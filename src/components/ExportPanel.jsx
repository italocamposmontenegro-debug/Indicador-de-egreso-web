/**
 * ExportPanel Component
 * Provides export functionality for indicator results
 * Supports: Copy to clipboard, PDF export
 */

import { useState } from 'react';
import { Copy, FileText, Check } from 'lucide-react';
import { jsPDF } from 'jspdf';

export default function ExportPanel({ indicatorResult, studentRut, demographicData }) {
    const [copied, setCopied] = useState(false);
    const [generating, setGenerating] = useState(false);

    const { components, totalScore, level, stats } = indicatorResult;

    const generateTextReport = () => {
        let report = `INDICADOR DE EGRESO - REPORTE\n`;
        report += `${'='.repeat(40)}\n\n`;
        report += `Estudiante RUT: ${studentRut}\n`;
        report += `Fecha de generación: ${new Date().toLocaleDateString('es-CL')}\n\n`;

        report += `RESULTADO GENERAL\n`;
        report += `${'-'.repeat(20)}\n`;
        report += `Indicador Final: ${totalScore.toFixed(1)}%\n`;
        report += `Nivel: ${level}\n`;
        report += `Cursos totales: ${stats.totalCourses}\n`;
        report += `Cursos aprobados: ${stats.approvedCourses}\n`;
        report += `Promedio: ${stats.averageGrade}\n\n`;

        report += `DESGLOSE DE COMPONENTES\n`;
        report += `${'-'.repeat(20)}\n`;

        Object.entries(components).forEach(([key, comp]) => {
            report += `${comp.label}: ${(comp.value * 100).toFixed(1)}% (peso: ${comp.weight * 100}%)\n`;
        });

        if (demographicData) {
            report += `\nDATOS DEMOGRÁFICOS\n`;
            report += `${'-'.repeat(20)}\n`;
            report += `Género: ${demographicData.genero || 'No especificado'}\n`;
            report += `Ciudad: ${demographicData.ciudad || 'No especificada'}\n`;
            report += `Tipo de colegio: ${demographicData.tipoColegio || 'No especificado'}\n`;
        }

        report += `\n${'='.repeat(40)}\n`;
        report += `Universidad Viña del Mar - Kinesiología\n`;
        report += `Sistema de Analítica Académica\n`;

        return report;
    };

    const handleCopyToClipboard = async () => {
        const report = generateTextReport();
        try {
            await navigator.clipboard.writeText(report);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const generatePDF = () => {
        setGenerating(true);

        try {
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'letter'
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 20;
            const contentWidth = pageWidth - (margin * 2);
            let y = margin;

            // Colors
            const primaryColor = [26, 54, 93]; // #1a365d
            const accentColor = [0, 180, 216]; // #00b4d8
            const textColor = [51, 51, 51];
            const mutedColor = [128, 128, 128];

            // Level colors
            const levelColors = {
                'Alto': [16, 185, 129],
                'Medio': [245, 158, 11],
                'Bajo': [239, 68, 68]
            };

            // Header
            doc.setFillColor(...primaryColor);
            doc.rect(0, 0, pageWidth, 35, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('INDICADOR DE EGRESO', margin, 15);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text('Universidad Viña del Mar • Escuela de Kinesiología', margin, 23);

            doc.setFontSize(9);
            doc.text(`Generado: ${new Date().toLocaleDateString('es-CL', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })}`, margin, 30);

            y = 50;

            // Student Info Box
            doc.setDrawColor(...accentColor);
            doc.setLineWidth(0.5);
            doc.rect(margin, y - 5, contentWidth, 20, 'S');

            doc.setTextColor(...textColor);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Estudiante', margin + 5, y + 3);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(14);
            doc.text(`RUT: ${studentRut}`, margin + 5, y + 11);

            y += 30;

            // Main Result Section
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text('RESULTADO GENERAL', margin, y);

            y += 5;
            doc.setDrawColor(...accentColor);
            doc.setLineWidth(1);
            doc.line(margin, y, margin + 50, y);

            y += 15;

            // Score Circle (simulated with text)
            const scoreX = margin + 25;
            doc.setFillColor(...(levelColors[level] || accentColor));
            doc.circle(scoreX, y + 10, 18, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.text(`${totalScore.toFixed(0)}%`, scoreX, y + 12, { align: 'center' });

            // Level Badge
            const levelX = scoreX + 40;
            doc.setTextColor(...textColor);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(`Nivel ${level}`, levelX, y + 5);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(...mutedColor);

            const levelDescriptions = {
                'Alto': 'Excelente desempeño académico',
                'Medio': 'Desempeño satisfactorio con oportunidades de mejora',
                'Bajo': 'Requiere atención prioritaria'
            };
            doc.text(levelDescriptions[level] || '', levelX, y + 12);

            // Stats
            doc.setTextColor(...textColor);
            doc.setFontSize(9);
            doc.text(`Cursos: ${stats.totalCourses} | Aprobados: ${stats.approvedCourses} | Promedio: ${stats.averageGrade}`, levelX, y + 20);

            y += 40;

            // Components Table
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text('DESGLOSE DE COMPONENTES', margin, y);

            y += 5;
            doc.setLineWidth(1);
            doc.line(margin, y, margin + 70, y);

            y += 10;

            // Table Header
            doc.setFillColor(245, 245, 245);
            doc.rect(margin, y - 4, contentWidth, 8, 'F');

            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...textColor);
            doc.text('Componente', margin + 2, y);
            doc.text('Valor', margin + 85, y);
            doc.text('Peso', margin + 110, y);
            doc.text('Aporte', margin + 135, y);

            y += 8;
            doc.setLineWidth(0.2);
            doc.setDrawColor(200, 200, 200);
            doc.line(margin, y, margin + contentWidth, y);

            y += 6;

            // Table Rows
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);

            Object.entries(components).forEach(([key, comp], index) => {
                if (index % 2 === 0) {
                    doc.setFillColor(250, 250, 250);
                    doc.rect(margin, y - 4, contentWidth, 7, 'F');
                }

                doc.setTextColor(...textColor);
                doc.text(comp.label, margin + 2, y);

                // Color-coded value
                const valuePercent = comp.value * 100;
                if (valuePercent >= 80) {
                    doc.setTextColor(16, 185, 129);
                } else if (valuePercent >= 60) {
                    doc.setTextColor(245, 158, 11);
                } else {
                    doc.setTextColor(239, 68, 68);
                }
                doc.text(`${valuePercent.toFixed(1)}%`, margin + 85, y);

                doc.setTextColor(...mutedColor);
                doc.text(`${(comp.weight * 100).toFixed(0)}%`, margin + 110, y);

                doc.setTextColor(...textColor);
                doc.text(`${(comp.weightedValue * 100).toFixed(1)}%`, margin + 135, y);

                y += 7;
            });

            // Total row
            y += 2;
            doc.setLineWidth(0.5);
            doc.line(margin, y, margin + contentWidth, y);
            y += 6;

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...textColor);
            doc.text('TOTAL', margin + 2, y);
            doc.setTextColor(...(levelColors[level] || accentColor));
            doc.text(`${totalScore.toFixed(1)}%`, margin + 135, y);

            y += 15;

            // Demographic Data (if available)
            if (demographicData && (demographicData.genero || demographicData.ciudad || demographicData.tipoColegio)) {
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...primaryColor);
                doc.text('DATOS DEMOGRÁFICOS', margin, y);

                y += 8;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...textColor);

                if (demographicData.genero) {
                    doc.text(`• Género: ${demographicData.genero}`, margin + 5, y);
                    y += 5;
                }
                if (demographicData.ciudad) {
                    doc.text(`• Ciudad: ${demographicData.ciudad}`, margin + 5, y);
                    y += 5;
                }
                if (demographicData.tipoColegio) {
                    doc.text(`• Tipo de colegio: ${demographicData.tipoColegio}`, margin + 5, y);
                    y += 5;
                }
            }

            // Footer
            const footerY = doc.internal.pageSize.getHeight() - 15;
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.3);
            doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

            doc.setFontSize(8);
            doc.setTextColor(...mutedColor);
            doc.text('Sistema de Analítica Académica • UVM Analytics', margin, footerY);
            doc.text('Documento generado automáticamente', pageWidth - margin, footerY, { align: 'right' });

            // Save PDF
            const filename = `indicador_egreso_${studentRut}_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(filename);

        } catch (err) {
            console.error('Error generating PDF:', err);
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="export-panel">
            <h3 className="subsection-title">
                <FileText size={20} />
                Exportar Resultados
            </h3>

            <div className="export-actions">
                <button
                    className={`export-btn ${copied ? 'success' : ''}`}
                    onClick={handleCopyToClipboard}
                >
                    {copied ? <Check size={18} /> : <Copy size={18} />}
                    {copied ? 'Copiado!' : 'Copiar al Portapapeles'}
                </button>

                <button
                    className={`export-btn ${generating ? 'loading' : ''}`}
                    onClick={generatePDF}
                    disabled={generating}
                >
                    <FileText size={18} />
                    {generating ? 'Generando...' : 'Descargar PDF'}
                </button>
            </div>
        </div>
    );
}
