
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function App() {
  const navigate = useNavigate();
  const [sessionName, setSessionName] = useState('');
  const [centralTheme, setCentralTheme] = useState('');
  const [participants, setParticipants] = useState([]);
  const [newParticipant, setNewParticipant] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [completedSessions, setCompletedSessions] = useState([]);
  const [showPastSessions, setShowPastSessions] = useState(false);

  // Fetch completed sessions
  useEffect(() => {
    fetchCompletedSessions();
  }, []);

  const fetchCompletedSessions = async () => {
    try {
      const response = await fetch('http://localhost:5021/api/sessions/completed');
      if (!response.ok) throw new Error('Failed to fetch sessions');
      const data = await response.json();
      const sessions = Array.isArray(data) ? data : (data.$values || []);
      setCompletedSessions(sessions);
    } catch (err) {
      console.error('Error fetching sessions:', err);
    }
  };

  const addParticipant = () => {
    if (newParticipant.trim() !== '') {
      setParticipants([...participants, newParticipant.trim()]);
      setNewParticipant('');
    }
  };

  const removeParticipant = (idx) => {
    setParticipants(participants.filter((_, i) => i !== idx));
  };

  const startSession = async (e) => {
    e.preventDefault();

    if (participants.length === 0) {
      setError('Пожалуйста, добавьте хотя бы одного участника');
      return;
    }

    setIsLoading(true);
    setError(null);

    const data = {
      name: sessionName,
      centralTheme,
      method: 'association',
      participants: participants.map(name => ({ name }))
    };

    try {
      const response = await fetch('http://localhost:5021/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`Ошибка при создании сессии: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Session created successfully:', result);

      navigate(`/session/${result.id}`);
    } catch (error) {
      console.error('Error creating session:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSession = async (sessionId, e) => {
    e.stopPropagation();
    if (!confirm('Удалить эту сессию? Это действие нельзя отменить.')) return;

    try {
      const response = await fetch(`http://localhost:5021/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete');
      setCompletedSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      console.error('Error deleting session:', err);
      alert('Ошибка при удалении сессии');
    }
  };

  const resumeSession = async (sessionId, e) => {
    e.stopPropagation();
    try {
      const response = await fetch(`http://localhost:5021/api/sessions/${sessionId}/resume`, {
        method: 'PUT'
      });
      if (!response.ok) throw new Error('Failed to resume');
      navigate(`/session/${sessionId}`);
    } catch (err) {
      console.error('Error resuming session:', err);
      alert('Ошибка при возобновлении сессии');
    }
  };

  const exportSession = (sessionId, e) => {
    e.stopPropagation();
    navigate(`/recap/${sessionId}`);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('ru-RU');
  };

  const formatDuration = (started, ended) => {
    if (!started || !ended) return '—';
    const diff = new Date(ended) - new Date(started);
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}м ${secs}с`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-indigo-900 mb-4">
            VoxStorm
          </h1>
          <p className="text-xl text-indigo-700 font-light">
            Автоматизированное документирование брейнштормов на основе голосового ввода
          </p>
          <p className="text-lg text-indigo-600 mt-2">
            Методика: Ассоциативная карта
          </p>
        </div>

        {/* Past Sessions Section */}
        <div className="mb-8">
          <button
            onClick={() => setShowPastSessions(!showPastSessions)}
            className="w-full py-3 px-6 rounded-lg text-lg font-semibold transition-all bg-white text-indigo-700 border-2 border-indigo-300 hover:bg-indigo-50 flex items-center justify-center gap-2"
          >
            <span>{showPastSessions ? '▼' : '▶'}</span>
            Завершенные сессии ({completedSessions.length})
          </button>

          {showPastSessions && (
            <div className="mt-4 bg-white rounded-2xl shadow-xl p-6">
              {completedSessions.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Нет завершенных сессий</p>
              ) : (
                <div className="space-y-3">
                  {completedSessions.map((session) => {
                    const ideas = Array.isArray(session.ideas) ? session.ideas : (session.ideas?.$values || []);
                    const participants = Array.isArray(session.participants) ? session.participants : (session.participants?.$values || []);
                    return (
                      <div
                        key={session.id}
                        className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-indigo-50 rounded-xl border border-indigo-100 hover:border-indigo-300 transition-all"
                      >
                        <div className="flex-1 cursor-pointer" onClick={() => exportSession(session.id)}>
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-semibold text-indigo-800">{session.name || 'Без названия'}</h3>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">завершена</span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {session.centralTheme || 'Без темы'} • {ideas.length} идей • {participants.length} участников
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {formatDate(session.endedAt || session.createdAt)} • {formatDuration(session.startedAt, session.endedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={(e) => resumeSession(session.id, e)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
                            title="Возобновить"
                          >
                            ▶ Продолжить
                          </button>
                          <button
                            onClick={(e) => exportSession(session.id, e)}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors"
                            title="Экспорт"
                          >
                            📊 Экспорт
                          </button>
                          <button
                            onClick={(e) => deleteSession(session.id, e)}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium transition-colors"
                            title="Удалить"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-10">
          <h2 className="text-2xl font-semibold text-indigo-800 mb-8 text-center">
            Настройка новой сессии брейншторма
          </h2>

          <form onSubmit={startSession} className="space-y-6">
            {/* Session Name */}
            <div>
              <label className="block text-sm font-medium text-indigo-700 mb-2">
                Название сессии
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                required
                className="w-full px-4 py-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="Введите название сессии"
              />
            </div>

            {/* Central Theme */}
            <div>
              <label className="block text-sm font-medium text-indigo-700 mb-2">
                Центральная тема
              </label>
              <input
                type="text"
                value={centralTheme}
                onChange={(e) => setCentralTheme(e.target.value)}
                className="w-full px-4 py-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="Введите центральную тему"
              />
            </div>

            {/* Participants */}
            <div>
              <label className="block text-sm font-medium text-indigo-700 mb-2">
                Участники <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newParticipant}
                  onChange={(e) => setNewParticipant(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addParticipant())}
                  placeholder="Имя участника"
                  className="flex-1 px-4 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={addParticipant}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  +
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {participants.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-indigo-100 text-indigo-800 px-4 py-2 rounded-full">
                    <span className="text-sm">{p}</span>
                    <button
                      type="button"
                      onClick={() => removeParticipant(idx)}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Start Button */}
            <button
              type="submit"
              disabled={isLoading || participants.length === 0}
              className={`w-full py-4 px-6 rounded-lg text-lg font-semibold transition-all transform shadow-lg ${
                isLoading || participants.length === 0
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 hover:scale-105'
              }`}
            >
              {isLoading ? 'Создаем сессию...' : 'Начать сессию →'}
            </button>
          </form>
        </div>

        {/* Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <div className="bg-white rounded-xl shadow-lg p-6 text-center">
            <div className="text-indigo-600 text-4xl mb-3">🎤</div>
            <h3 className="font-semibold text-indigo-800 mb-2">Голосовой ввод</h3>
            <p className="text-sm text-gray-600">Распознавание речи в реальном времени</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6 text-center">
            <div className="text-indigo-600 text-4xl mb-3">🧠</div>
            <h3 className="font-semibold text-indigo-800 mb-2">AI-анализ</h3>
            <p className="text-sm text-gray-600">Семантический анализ и категоризация идей</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6 text-center">
            <div className="text-indigo-600 text-4xl mb-3">📊</div>
            <h3 className="font-semibold text-indigo-800 mb-2">Ментальные карты</h3>
            <p className="text-sm text-gray-600">Автоматическая визуализация результатов</p>
          </div>
        </div>
      </div>
    </div>
  );
}
