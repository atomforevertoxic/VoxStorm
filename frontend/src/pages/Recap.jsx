import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function Recap() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const recapRef = useRef(null);
  const mindMapRef = useRef(null);

  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`http://localhost:5021/api/sessions/${sessionId}/stats`);
        if (!response.ok) throw new Error('Session not found');
        const data = await response.json();
        const normalizedData = {
          ...data,
          participants: data.participants?.$values || data.participants || [],
          ideas: data.ideas?.$values || data.ideas || []
        };
        setStats(normalizedData);
        setIsLoading(false);
      } catch (err) {
        setError(err.message);
        setIsLoading(false);
      }
    };
    fetchStats();
  }, [sessionId]);

  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '0с';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}ч ${mins}м`;
    if (mins > 0) return `${mins}м ${secs}с`;
    return `${secs}с`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('ru-RU');
  };

  const captureElement = async (element) => {
    if (!element) return null;
    const { default: html2canvas } = await import('html2canvas');
    return html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false
    });
  };

  const exportMindMapToPng = async () => {
    setIsExporting(true);
    try {
      const canvas = await captureElement(mindMapRef.current);
      if (!canvas) throw new Error('Mind map not found');

      const link = document.createElement('a');
      link.download = `voxstorm-${sessionId}-mindmap.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
      alert('Ошибка экспорта: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const exportRecapAndMindMapToPdf = async () => {
    setIsExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');

      const recapCanvas = await captureElement(recapRef.current);
      const mindMapCanvas = await captureElement(mindMapRef.current);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      if (recapCanvas) {
        const imgData = recapCanvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (recapCanvas.height * pdfWidth) / recapCanvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      }

      if (mindMapCanvas) {
        pdf.addPage();
        const imgData = mindMapCanvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (mindMapCanvas.height * pdfWidth) / mindMapCanvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      }

      pdf.save(`voxstorm-${sessionId}-recap.pdf`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Ошибка экспорта: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToDocx = async () => {
    if (!stats) return;
    setIsExporting(true);

    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } = await import('docx');

      const mindMapCanvas = await captureElement(mindMapRef.current);
      let imageRun = null;
      if (mindMapCanvas) {
        const imageData = mindMapCanvas.toDataURL('image/png');
        const base64 = imageData.split(',')[1];
        // Convert base64 to Uint8Array for browser compatibility
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        imageRun = new ImageRun({
          data: bytes,
          transformation: { width: 500, height: 350 }
        });
      }

      const children = [
        new Paragraph({
          text: `VoxStorm: ${stats.sessionName}`,
          heading: HeadingLevel.TITLE
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Центральная тема: ', bold: true }),
            new TextRun(stats.centralTheme || 'Не указана')
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Дата: ', bold: true }),
            new TextRun(formatDate(stats.createdAt))
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Длительность: ', bold: true }),
            new TextRun(formatDuration(stats.durationSeconds))
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Статус: ', bold: true }),
            new TextRun(stats.status === 'completed' ? 'Завершена' : stats.status)
          ]
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          text: 'Статистика',
          heading: HeadingLevel.HEADING_1
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Всего идей: ', bold: true }),
            new TextRun(String(stats.totalIdeas))
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Участников: ', bold: true }),
            new TextRun(String(stats.participantCount))
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Категорий: ', bold: true }),
            new TextRun(String(Object.keys(stats.categories || {}).length))
          ]
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          text: 'Идеи',
          heading: HeadingLevel.HEADING_1
        }),
        ...stats.ideas.map((idea, idx) => new Paragraph({
          children: [
            new TextRun({ text: `${idx + 1}. `, bold: true }),
            new TextRun(idea.text)
          ]
        }))
      ];

      if (imageRun) {
        children.push(
          new Paragraph({ text: '' }),
          new Paragraph({
            text: 'Интеллект-карта',
            heading: HeadingLevel.HEADING_1
          }),
          new Paragraph({
            children: [imageRun]
          })
        );
      }

      const doc = new Document({
        sections: [{
          properties: {},
          children: children
        }]
      });

      const blob = await Packer.toBlob(doc);
      const link = document.createElement('a');
      link.download = `voxstorm-${sessionId}-recap.docx`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Ошибка экспорта: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '24px', color: '#4f46e5' }}>Загрузка статистики...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '24px', color: '#dc2626' }}>Ошибка: {error}</div>
      </div>
    );
  }

  const ideasListStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  };

  const ideaCardStyle = {
    backgroundColor: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px'
  };

  const statCardStyle = {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '16px',
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  };

  const participantStyle = {
    backgroundColor: '#e0e7ff',
    color: '#4338ca',
    padding: '8px 16px',
    borderRadius: '9999px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px'
  };

  const mindMapNodeStyle = {
    backgroundColor: '#ecfdf5',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    border: '2px solid #a7f3d0',
    maxWidth: '200px'
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#e0e7ff', padding: '16px' }}>
      <div style={{ maxWidth: '1152px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <button
            onClick={() => navigate('/')}
            style={{ color: '#4f46e5', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: '500' }}
          >
            На главную
          </button>
          <span style={{ backgroundColor: '#f3e8ff', color: '#7c3aed', padding: '8px 16px', borderRadius: '9999px', fontSize: '14px', fontWeight: '500' }}>
            Сессия завершена
          </span>
        </div>

        {/* Export Buttons */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 10px 15px rgba(0,0,0,0.1)', padding: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#4338ca' }}>
              Экспорт результатов
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              <button
                onClick={exportMindMapToPng}
                disabled={isExporting}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: isExporting ? 'not-allowed' : 'pointer', opacity: isExporting ? 0.5 : 1, fontSize: '14px', fontWeight: '500' }}
              >
                PNG (Карта)
              </button>
              <button
                onClick={exportRecapAndMindMapToPdf}
                disabled={isExporting}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#ef4444', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: isExporting ? 'not-allowed' : 'pointer', opacity: isExporting ? 0.5 : 1, fontSize: '14px', fontWeight: '500' }}
              >
                PDF
              </button>
              <button
                onClick={exportToDocx}
                disabled={isExporting}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: isExporting ? 'not-allowed' : 'pointer', opacity: isExporting ? 0.5 : 1, fontSize: '14px', fontWeight: '500' }}
              >
                DOCX
              </button>
            </div>
          </div>
        </div>

        {/* Recap Content */}
        <div ref={recapRef} style={{ backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 10px 15px rgba(0,0,0,0.1)', padding: '32px', marginBottom: '32px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '32px', paddingBottom: '24px', borderBottom: '2px solid #e5e7eb' }}>
            <h1 style={{ fontSize: '36px', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '8px' }}>
              VoxStorm
            </h1>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#4338ca' }}>
              {stats.sessionName}
            </h2>
            <p style={{ color: '#6366f1', marginTop: '8px' }}>
              Результаты брейншторма
            </p>
          </div>

          {/* Session Info */}
          <div style={{ backgroundColor: '#e0e7ff', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '24px' }}>
              <div>
                <h3 style={{ fontSize: '12px', fontWeight: '500', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Центральная тема</h3>
                <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#312e81' }}>
                  {stats.centralTheme || 'Не указана'}
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: '12px', fontWeight: '500', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Статус</h3>
                <span style={{ display: 'inline-block', backgroundColor: '#dcfce7', color: '#166534', padding: '4px 12px', borderRadius: '9999px', fontSize: '14px', fontWeight: '500' }}>
                  Завершена
                </span>
              </div>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              <div style={statCardStyle}>
                <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#4f46e5' }}>{formatDuration(stats.durationSeconds)}</p>
                <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>Длительность</p>
              </div>
              <div style={statCardStyle}>
                <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#4f46e5' }}>{stats.totalIdeas}</p>
                <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>Всего идей</p>
              </div>
              <div style={statCardStyle}>
                <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#4f46e5' }}>{stats.participantCount}</p>
                <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>Участников</p>
              </div>
              <div style={statCardStyle}>
                <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#4f46e5' }}>{Object.keys(stats.categories || {}).length}</p>
                <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>Категорий</p>
              </div>
            </div>
          </div>

          {/* Participants */}
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#4338ca', marginBottom: '16px' }}>Участники</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {stats.participants.map((participant, idx) => {
                const ideaCount = stats.ideasPerParticipant?.[participant.id] || 0;
                return (
                  <div key={idx} style={participantStyle}>
                    <span style={{ fontWeight: '500' }}>{participant.name}</span>
                    <span style={{ backgroundColor: '#c7d2fe', color: '#4338ca', padding: '2px 8px', borderRadius: '9999px', fontSize: '12px' }}>
                      {ideaCount} идей
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ideas List */}
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#4338ca', marginBottom: '16px' }}>
              Идеи ({stats.ideas.length})
            </h3>
            <div style={ideasListStyle}>
              {stats.ideas.map((idea, idx) => (
                <div key={idx} style={ideaCardStyle}>
                  <span style={{ width: '32px', height: '32px', backgroundColor: '#10b981', color: '#ffffff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', flexShrink: 0 }}>
                    {idx + 1}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#1f2937', fontWeight: '500' }}>{idea.text}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px', fontSize: '14px', color: '#6b7280' }}>
                      <span>{formatDate(idea.createdAt)}</span>
                      {idea.category && (
                        <span style={{ backgroundColor: '#f3e8ff', color: '#7c3aed', padding: '2px 8px', borderRadius: '4px' }}>
                          {idea.category}
                        </span>
                      )}
                      {idea.isApproved && (
                        <span style={{ color: '#059669' }}>Подтверждена</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '2px solid #e5e7eb', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
            Создано с помощью VoxStorm
          </div>
        </div>

        {/* Mind Map Section - Visible in Recap */}
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#4338ca', marginBottom: '16px' }}>Интеллект-карта</h3>
          <div
            ref={mindMapRef}
            style={{ backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 10px 15px rgba(0,0,0,0.1)', padding: '24px' }}
          >
            <div
              style={{ position: 'relative', borderRadius: '12px', backgroundColor: '#f8fafc', height: '450px' }}
            >
              {/* Central Theme */}
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 20 }}>
                <div style={{ minWidth: '240px', position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: '-12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)', borderRadius: '24px', opacity: 0.4, filter: 'blur(16px)' }}></div>
                  <div style={{ position: 'relative', background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)', borderRadius: '16px', padding: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', border: '2px solid rgba(255,255,255,0.3)' }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                        Центральная тема
                      </p>
                      <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#ffffff', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                        {stats.centralTheme || 'Без темы'}
                      </h3>
                    </div>
                  </div>
                </div>
              </div>

              {/* Idea Nodes */}
              {stats.ideas.map((idea, idx) => {
                const count = stats.ideas.length || 1;
                const angle = (idx * (360 / count)) * (Math.PI / 180);
                const radius = 160;
                const offsetX = Math.cos(isFinite(angle) ? angle : 0) * radius;
                const offsetY = Math.sin(isFinite(angle) ? angle : 0) * radius;

                return (
                  <div
                    key={`node-${idx}`}
                    style={{
                      position: 'absolute',
                      left: `calc(50% + ${offsetX}px)`,
                      top: `calc(50% + ${offsetY}px)`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    <div style={mindMapNodeStyle}>
                      <p style={{ color: '#1f2937', fontSize: '14px', fontWeight: '500', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                        {idea.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Back Button */}
        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <button
            onClick={() => navigate('/')}
            style={{ padding: '12px 24px', backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: '500' }}
          >
            Новая сессия
          </button>
        </div>
      </div>
    </div>
  );
}
