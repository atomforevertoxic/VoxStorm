import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function ActiveSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);

  // Fetch session data
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`http://localhost:5021/api/sessions/${sessionId}`);
        if (!response.ok) throw new Error('Session not found');
        const data = await response.json();
        setSession(data);
        setIdeas(data.ideas || []);
        setIsLoading(false);
      } catch (err) {
        setError(err.message);
        setIsLoading(false);
      }
    };
    fetchSession();
  }, [sessionId]);

  // Setup Web Speech API
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ru-RU';

      recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscript(prev => prev + ' ' + finalTranscript);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert('Голосовой ввод не поддерживается в этом браузере');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const submitIdea = async (text) => {
    if (!text.trim()) return;

    try {
      const response = await fetch('http://localhost:5021/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          sessionId: parseInt(sessionId),
          participantId: null,
          category: null
        })
      });

      if (!response.ok) throw new Error('Failed to add idea');

      const newIdea = await response.json();
      setIdeas([...ideas, newIdea]);
      setTranscript('');
      setManualInput('');
    } catch (err) {
      console.error('Error adding idea:', err);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    submitIdea(manualInput);
  };

  const handleVoiceSubmit = () => {
    submitIdea(transcript);
  };

  const finishSession = async () => {
    try {
      await fetch(`http://localhost:5021/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...session,
          status: 'completed',
          endedAt: new Date().toISOString()
        })
      });
      navigate('/');
    } catch (err) {
      console.error('Error finishing session:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-2xl text-indigo-600">Загрузка сессии...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-2xl text-red-600">Ошибка: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => navigate('/')}
            className="text-indigo-600 hover:text-indigo-800 font-medium"
          >
            ← Назад к списку
          </button>
          <div className="flex items-center gap-4">
            <span className="bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium">
              Сессия активна
            </span>
            <button
              onClick={finishSession}
              className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
            >
              Завершить сессию
            </button>
          </div>
        </div>

        {/* Main Content - Two Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Central Theme */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-xl p-6 h-full">
              <h2 className="text-xl font-semibold text-indigo-800 mb-4">
                Центральная тема
              </h2>
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-8 text-center">
                <h3 className="text-3xl font-bold text-white">
                  {session?.centralTheme || 'Без темы'}
                </h3>
              </div>

              {/* Session Info */}
              <div className="mt-6">
                <h4 className="text-lg font-medium text-indigo-800 mb-3">
                  Информация о сессии
                </h4>
                <div className="space-y-2 text-gray-600">
                  <p><span className="font-medium">Название:</span> {session?.name}</p>
                  <p><span className="font-medium">Метод:</span> {session?.method}</p>
                  <p><span className="font-medium">Участников:</span> {session?.participants?.length || 0}</p>
                  <p><span className="font-medium">Идей:</span> {ideas.length}</p>
                </div>
              </div>

              {/* Participants */}
              {session?.participants?.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-lg font-medium text-indigo-800 mb-3">
                    Участники
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {session.participants.map((p, idx) => (
                      <span
                        key={idx}
                        className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm"
                      >
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Center - Ideas Visualization */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl p-6 min-h-[600px]">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-indigo-800">
                  Идеи ({ideas.length})
                </h2>
              </div>

              {/* Ideas Grid - Mind Map Style */}
              {ideas.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {ideas.map((idea, idx) => (
                    <div
                      key={idea.id || idx}
                      className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100 hover:shadow-md transition-shadow"
                    >
                      <p className="text-gray-800">{idea.text}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {idea.createdAt ? new Date(idea.createdAt).toLocaleTimeString() : ''}
                        </span>
                        {idea.category && (
                          <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs">
                            {idea.category}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-400">
                  <p>Идеи появятся здесь после голосового или текстового ввода</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom - Input Section */}
        <div className="mt-6 bg-white rounded-2xl shadow-xl p-6">
          <h3 className="text-lg font-semibold text-indigo-800 mb-4">
            Добавить идею
          </h3>

          {/* Voice Input Status */}
          <div className="mb-4 flex items-center gap-4">
            <button
              onClick={toggleVoiceInput}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              <span>{isListening ? '⏹ Стоп' : '🎤 Голосовой ввод'}</span>
            </button>

            {isListening && (
              <span className="text-red-500 font-medium animate-pulse">
                Слушаю... Говорите
              </span>
            )}
          </div>

          {/* Transcript Display */}
          {transcript && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-gray-700">{transcript}</p>
              <button
                onClick={handleVoiceSubmit}
                className="mt-2 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600"
              >
                ✓ Добавить идею
              </button>
            </div>
          )}

          {/* Manual Input */}
          <form onSubmit={handleManualSubmit} className="flex gap-4">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Введите идею вручную..."
              className="flex-1 px-4 py-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <button
              type="submit"
              className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              Добавить
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
