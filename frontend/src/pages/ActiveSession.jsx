import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function ActiveSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [pendingIdeas, setPendingIdeas] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [silenceTimer, setSilenceTimer] = useState(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const recognitionRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const accumulatedTranscriptRef = useRef('');

  // Fetch session data
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`http://localhost:5021/api/sessions/${sessionId}`);
        if (!response.ok) throw new Error('Session not found');
        const data = await response.json();
        // Normalize participants (EF Core returns $values wrapper)
        const participants = data.participants?.$values || data.participants || [];
        const normalizedData = { ...data, participants };
        setSession(normalizedData);
        // Ensure ideas is always an array
        setIdeas(Array.isArray(data.ideas?.$values) ? data.ideas.$values : Array.isArray(data.ideas) ? data.ideas : []);
        setIsLoading(false);
      } catch (err) {
        setError(err.message);
        setIsLoading(false);
      }
    };
    fetchSession();
  }, [sessionId]);

  // Submit idea to API
  const submitIdea = useCallback(async (text, clearManual = false) => {
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
      setIdeas(prevIdeas => [...(prevIdeas || []), newIdea]);

      if (clearManual) {
        setManualInput('');
      }
    } catch (err) {
      console.error('Error adding idea:', err);
    }
  }, [sessionId]);

  // Process accumulated transcript - add to pending list after 3 seconds of silence
  const processTranscript = useCallback(() => {
    const text = accumulatedTranscriptRef.current.trim();
    if (text) {
      const newPendingIdea = {
        id: Date.now(),
        text: text,
        createdAt: new Date().toISOString()
      };
      setPendingIdeas(prev => [...prev, newPendingIdea]);
      accumulatedTranscriptRef.current = '';
      setTranscript('');
    }
  }, []);

  // Confirm a pending idea - save to database
  const confirmPendingIdea = useCallback(async (pendingId) => {
    const pending = pendingIdeas.find(p => p.id === pendingId);
    if (!pending) return;

    setIsProcessing(true);
    await submitIdea(pending.text);
    setPendingIdeas(prev => prev.filter(p => p.id !== pendingId));
    setIsProcessing(false);
  }, [pendingIdeas, submitIdea]);

  // Reject a pending idea - delete from list
  const rejectPendingIdea = useCallback((pendingId) => {
    setPendingIdeas(prev => prev.filter(p => p.id !== pendingId));
  }, []);

  // Reset silence timer when speech is detected
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }

    silenceTimeoutRef.current = setTimeout(() => {
      // 3 seconds of silence - process the accumulated transcript
      processTranscript();
    }, 3000);
  }, [processTranscript]);

  // Setup Web Speech API with continuous listening and silence detection
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const createRecognition = () => {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ru-RU';

        recognition.onresult = (event) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              finalTranscript += result[0].transcript + ' ';
            } else {
              interimTranscript += result[0].transcript;
            }
          }

          // Accumulate final transcripts
          if (finalTranscript) {
            accumulatedTranscriptRef.current += finalTranscript;
            // Show current accumulated text + interim
            setTranscript(accumulatedTranscriptRef.current.trim() + (interimTranscript ? ' ' + interimTranscript : ''));
            // Reset silence timer on new speech
            resetSilenceTimer();
          } else if (interimTranscript) {
            // Just show interim results while speaking
            setTranscript(accumulatedTranscriptRef.current.trim() + ' ' + interimTranscript);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          // Don't stop on common errors like 'no-speech' - restart instead
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            setIsListening(false);
          }
        };

        recognition.onend = () => {
          // Restart recognition to keep continuous listening
          if (isListening && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              console.log('Recognition restart failed:', e);
            }
          }
        };

        return recognition;
      };

      recognitionRef.current = createRecognition();
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, [isListening, resetSilenceTimer]);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert('Голосовой ввод не поддерживается в этом браузере');
      return;
    }

    if (isListening) {
      // Stop listening - process any remaining transcript
      recognitionRef.current.stop();
      setIsListening(false);
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      // Submit any remaining text
      processTranscript();
    } else {
      // Clear previous transcript and start fresh
      accumulatedTranscriptRef.current = '';
      setTranscript('');
      recognitionRef.current.start();
      setIsListening(true);
      // Start silence timer
      resetSilenceTimer();
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    submitIdea(manualInput, true);
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

  // Zoom controls
  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const resetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  // Pan handlers
  const handleMouseDown = (e) => {
    if (e.target === containerRef.current || e.target.closest('.mind-map-content')) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev + delta)));
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
          {/* Left Panel - Session Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-xl p-6 h-full">
              <h2 className="text-xl font-semibold text-indigo-800 mb-4">
                Информация о сессии
              </h2>

              {/* Session Info */}
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
                  <span className="text-xs font-medium text-indigo-400 uppercase tracking-wider">Центральная тема</span>
                  <h3 className="text-xl font-bold text-indigo-800 mt-1">
                    {session?.centralTheme || 'Без темы'}
                  </h3>
                </div>

                <div className="space-y-2 text-gray-600">
                  <p><span className="font-medium">Название:</span> {session?.name}</p>
                  <p><span className="font-medium">Метод:</span> Ассоциативный</p>
                  <p><span className="font-medium">Участников:</span> {session?.participants?.length || 0}</p>
                  <p><span className="font-medium">Идей:</span> {ideas?.length || 0}</p>
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

          {/* Center - Mind Map Visualization */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl p-4 min-h-[600px] relative overflow-hidden flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-indigo-800">
                  Интеллект-карта
                </h2>
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium">
                    {session?.centralTheme || 'Без темы'}
                  </span>
                </div>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={zoomOut}
                  className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors flex items-center justify-center font-bold"
                  title="Увеличить"
                >
                  −
                </button>
                <span className="text-sm text-gray-600 w-14 text-center">{Math.round(scale * 100)}%</span>
                <button
                  onClick={zoomIn}
                  className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors flex items-center justify-center font-bold"
                  title="Уменьшить"
                >
                  +
                </button>
                <button
                  onClick={resetView}
                  className="ml-2 px-3 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                  title="Сбросить вид"
                >
                  Сбросить
                </button>
                <span className="text-xs text-gray-400 ml-2">Колёсико мыши или перетаскивание для навигации</span>
              </div>

              {/* Mind Map Container */}
              {Array.isArray(ideas) && (ideas.length > 0 || session?.centralTheme) ? (
                <div
                  ref={containerRef}
                  className="relative flex-1 rounded-xl bg-gradient-to-br from-slate-50 to-indigo-50 overflow-hidden cursor-grab active:cursor-grabbing"
                  style={{
                    height: '500px'
                  }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onWheel={handleWheel}
                >
                  {/* Scaled content */}
                  <div
                    className="mind-map-content absolute inset-0"
                    style={{
                      transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`,
                      transformOrigin: 'center center',
                      transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                    }}
                  >
                    {/* SVG for connection lines */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                      <defs>
                        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.7" />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.35" />
                        </linearGradient>
                      </defs>
                      {ideas.map((idea, idx) => {
                        const count = ideas.length || 1;
                        const angle = (idx * (360 / count)) * (Math.PI / 180);
                        const radius = 160;
                        const centerX = '50%';
                        const centerY = '50%';
                        const lineX = `calc(50% + ${radius * Math.cos(angle)}px)`;
                        const lineY = `calc(50% + ${radius * Math.sin(angle)}px)`;
                        return (
                          <line
                            key={`line-${idx}`}
                            x1={centerX}
                            y1={centerY}
                            x2={lineX}
                            y2={lineY}
                            stroke="url(#lineGradient)"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        );
                      })}
                    </svg>

                    {/* Central Theme - Root Node (MAIN ELEMENT) */}
                    <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
                      <div className="relative min-w-[240px]">
                        {/* Glow effect */}
                        <div className="absolute -inset-3 bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 rounded-3xl blur-lg opacity-40 animate-pulse"></div>
                        {/* Main card */}
                        <div className="relative bg-gradient-to-br from-indigo-600 via-violet-500 to-purple-600 rounded-2xl p-6 shadow-2xl border-2 border-white/30 overflow-hidden">
                          {/* Shine effect */}
                          <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/20"></div>
                          {/* Inner glow border */}
                          <div className="absolute inset-0 rounded-2xl ring-4 ring-white/20"></div>
                          <div className="relative text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <svg className="w-6 h-6 text-indigo-200" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                              </svg>
                              <span className="text-xs font-bold text-indigo-100 uppercase tracking-widest">Центральная тема</span>
                              <svg className="w-6 h-6 text-indigo-200" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                              </svg>
                            </div>
                            <h3 className="text-2xl font-extrabold text-white drop-shadow-lg leading-tight">
                              {session?.centralTheme || 'Без темы'}
                            </h3>
                            <div className="mt-3 flex items-center justify-center gap-3">
                              <div className="h-1 w-8 bg-white/30 rounded-full"></div>
                              <div className="h-1 w-12 bg-white/50 rounded-full"></div>
                              <div className="h-1 w-8 bg-white/30 rounded-full"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Idea Nodes - Connected to center theme */}
                    {ideas.map((idea, idx) => {
                      const count = ideas.length || 1;
                      const angle = (idx * (360 / count)) * (Math.PI / 180);
                      const radius = 160;
                      const offsetX = Math.cos(angle) * radius;
                      const offsetY = Math.sin(angle) * radius;

                      return (
                        <div
                          key={idea.id || idx}
                          className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-110 hover:z-30"
                          style={{
                            left: `calc(50% + ${offsetX}px)`,
                            top: `calc(50% + ${offsetY}px)`
                          }}
                        >
                          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 shadow-lg border-2 border-emerald-200 hover:border-emerald-400 hover:shadow-xl transition-all max-w-[200px]">
                            <p className="text-gray-800 text-sm font-medium" style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}>{idea.text}</p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-xs text-gray-400">
                                {idea.createdAt ? new Date(idea.createdAt).toLocaleTimeString() : ''}
                              </span>
                              {idea.category && (
                                <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs">
                                  {idea.category}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <svg className="w-16 h-16 mb-4 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p className="text-center">Идеи появятся здесь после голосового или текстового ввода</p>
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
              disabled={isProcessing}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                isProcessing
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              <span>{isProcessing ? '⏳ Сохранение...' : isListening ? '⏹ Стоп' : '🎤 Голосовой ввод'}</span>
            </button>

            {isListening && (
              <span className="text-green-600 font-medium animate-pulse flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Слушаю... Говорите (3 сек молчания = авто-сохранение)
              </span>
            )}
          </div>

          {/* Transcript Display - Show while capturing */}
          {transcript && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-gray-700">{transcript}</p>
              <p className="text-xs text-gray-400 mt-2">
                Идея сохранится автоматически после 3 секунд молчания
              </p>
            </div>
          )}

          {/* Pending Ideas - require confirmation */}
          {pendingIdeas.length > 0 && (
            <div className="mb-4 space-y-3">
              <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                Распознанные идеи ({pendingIdeas.length})
              </h4>
              {pendingIdeas.map((pending) => (
                <div
                  key={pending.id}
                  className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="text-gray-800">{pending.text}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(pending.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmPendingIdea(pending.id)}
                      disabled={isProcessing}
                      className="px-3 py-1.5 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors flex items-center gap-1"
                    >
                      <span>✓</span> Добавить
                    </button>
                    <button
                      onClick={() => rejectPendingIdea(pending.id)}
                      className="px-3 py-1.5 bg-red-400 text-white text-sm rounded-lg hover:bg-red-500 transition-colors flex items-center gap-1"
                    >
                      <span>✕</span> Отклонить
                    </button>
                  </div>
                </div>
              ))}
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
