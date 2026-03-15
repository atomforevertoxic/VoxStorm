
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function App() {
  const navigate = useNavigate();
  const [sessionName, setSessionName] = useState('');
  const [centralTheme, setCentralTheme] = useState('');
  const [participants, setParticipants] = useState([]);
  const [newParticipant, setNewParticipant] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

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

      // Redirect to the session page
      navigate(`/session/${result.id}`);
    } catch (error) {
      console.error('Error creating session:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
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
