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
  const [aiEnhancementEnabled, setAiEnhancementEnabled] = useState(false);
  const [isLLmProcessing, setIsLLmProcessing] = useState(false);
  const [silenceTimer, setSilenceTimer] = useState(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [nodePositions, setNodePositions] = useState({});
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [draggingNodeOffset, setDraggingNodeOffset] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState('center');
  const selectedNodeIdRef = useRef('center');
  const [deletingNodeId, setDeletingNodeId] = useState(null);
  const [ideaConnections, setIdeaConnections] = useState({});
  const containerRef = useRef(null);

  const recognitionRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const accumulatedTranscriptRef = useRef('');
  const sessionStartedAtRef = useRef(null);

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
        const loadedIdeas = Array.isArray(data.ideas?.$values) ? data.ideas.$values : Array.isArray(data.ideas) ? data.ideas : [];
        setIdeas(loadedIdeas);

        // Load saved data from localStorage
        const positionsKey = `voxstorm-positions-${sessionId}`;
        let savedData = null;
        try {
          const raw = localStorage.getItem(positionsKey);
          if (raw) savedData = JSON.parse(raw);
        } catch (e) { /* ignore */ }

        // Initialize connections — use saved connections or fallback to center
        const initConnections = {};
        loadedIdeas.forEach(idea => {
          initConnections[idea.id] = savedData?.connections?.[idea.id] ?? 'center';
        });
        setIdeaConnections(initConnections);

        // Initialize logging
        window.sessionDebugLogs = [];
        log(`=== SESSION ${sessionId} LOADED ===`);
        log(`Center position from DB: x=${data.centerPositionX}, y=${data.centerPositionY}`);
        log(`Number of ideas: ${loadedIdeas.length}`);
        log(`Saved data from localStorage: ${savedData ? 'FOUND' : 'NOT FOUND'}`);

        // Initialize positions — prefer localStorage, then DB, then circular fallback
        const initialPositions = {};
        if (savedData?.centerPosition) {
          initialPositions['center'] = savedData.centerPosition;
        } else if (data.centerPositionX != null && data.centerPositionY != null) {
          initialPositions['center'] = { x: data.centerPositionX, y: data.centerPositionY };
        }
        loadedIdeas.forEach((idea, idx) => {
          if (savedData?.ideaPositions?.[idea.id]) {
            initialPositions[idea.id] = savedData.ideaPositions[idea.id];
          } else if (idea.positionX != null && idea.positionY != null) {
            initialPositions[idea.id] = { x: idea.positionX, y: idea.positionY };
          } else {
            const count = loadedIdeas.length || 1;
            const angle = (idx * (360 / count)) * (Math.PI / 180);
            const radius = 280;
            initialPositions[idea.id] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
          }
        });
        setNodePositions(prev => ({ ...prev, ...initialPositions }));
        setIsLoading(false);
      } catch (err) {
        setError(err.message);
        setIsLoading(false);
      }
    };
    fetchSession();
  }, [sessionId]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  // Submit idea to API
  const submitIdea = useCallback(async (text, clearManual = false, extra = {}) => {
    if (!text.trim()) return;

    // Set startedAt on first idea submission
    if (!sessionStartedAtRef.current && !session?.startedAt) {
      sessionStartedAtRef.current = new Date().toISOString();
      try {
        await fetch(`http://localhost:5021/api/sessions/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startedAt: sessionStartedAtRef.current })
        });
        setSession(prev => ({ ...prev, startedAt: sessionStartedAtRef.current }));
      } catch (err) {
        console.error('Error setting startedAt:', err);
      }
    }

    try {
      const payload = {
        text: text.trim(),
        sessionId: parseInt(sessionId),
        category: extra.category || '',
        relevance: extra.relevance || 100
      };
      console.log('Sending payload:', payload);

      const response = await fetch('http://localhost:5021/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.log('Response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error('Failed to add idea: ' + errorText);
      }

      const newIdea = await response.json();
      console.log('New idea added:', newIdea);
      setIdeaConnections(prev => ({ ...prev, [newIdea.id]: selectedNodeIdRef.current }));
      setIdeas(prevIdeas => {
        console.log('Previous ideas:', prevIdeas);
        const updated = [...(prevIdeas || []), newIdea];
        console.log('Updated ideas:', updated);
        // Set initial position near the connected target node
        const connTarget = selectedNodeIdRef.current;
        const targetPos = nodePositions[connTarget];
        const offset = 200;
        const existingCount = updated.filter(i => ideaConnections[i.id] === connTarget || (connTarget === 'center' && !ideaConnections[i.id])).length;
        const spreadAngle = ((existingCount - 1) * (60)) * (Math.PI / 180);
        const baseAngle = connTarget === 'center' ? -Math.PI / 2 : Math.random() * Math.PI * 2;
        const posX = (targetPos?.x ?? 0) + Math.cos(baseAngle + spreadAngle) * offset;
        const posY = (targetPos?.y ?? 0) + Math.sin(baseAngle + spreadAngle) * offset;
        setNodePositions(prev => ({
          ...prev,
          [newIdea.id]: { x: posX, y: posY }
        }));
        return updated;
      });

      if (clearManual) {
        setManualInput('');
      }
    } catch (err) {
      console.error('Error adding idea:', err);
      alert('Ошибка при добавлении идеи: ' + err.message);
    }
  }, [sessionId]);

  // Process accumulated transcript - add to pending list after 3 seconds of silence
  const processTranscript = useCallback(() => {
    const text = accumulatedTranscriptRef.current.trim();
    if (text) {
      if (aiEnhancementEnabled) {
        // Call LLM to process raw transcript into structured ideas
        setIsLLmProcessing(true);
        console.log(`[AI Request] Sending transcript to LLM (length: ${text.length}), sessionId: ${sessionId}`);
        fetch('http://localhost:5021/api/ideas/process-raw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Transcript: text,
            SessionId: parseInt(sessionId)
          })
        })
        .then(res => {
          if (!res.ok) throw new Error('LLM processing failed');
          return res.json();
        })
        .then(data => {
          console.log('LLM processed ideas:', data);
          // Normalize ideas - EF Core may wrap arrays in $values
          const ideasArray = data.ideas?.$values || (Array.isArray(data.ideas) ? data.ideas : []);
          if (ideasArray.length > 0) {
            const newPendingIdeas = ideasArray.map((idea, idx) => ({
              id: Date.now() + idx,
              text: idea.text,
              createdAt: new Date().toISOString(),
              category: idea.category,
              relevance: idea.relevance
            }));
            setPendingIdeas(prev => [...prev, ...newPendingIdeas]);
          }
          accumulatedTranscriptRef.current = '';
          setTranscript('');
          setIsLLmProcessing(false);
        })
        .catch(err => {
          console.error('LLM processing error:', err);
          // Fallback: add raw text as single idea
          const newPendingIdea = {
            id: Date.now(),
            text: text,
            createdAt: new Date().toISOString(),
            relevance: 100
          };
          setPendingIdeas(prev => [...prev, newPendingIdea]);
          accumulatedTranscriptRef.current = '';
          setTranscript('');
          setIsLLmProcessing(false);
        });
      } else {
        // Original flow: add raw text as single pending idea
        const newPendingIdea = {
          id: Date.now(),
          text: text,
          createdAt: new Date().toISOString(),
          relevance: 100
        };
        setPendingIdeas(prev => [...prev, newPendingIdea]);
        accumulatedTranscriptRef.current = '';
        setTranscript('');
      }
    }
  }, [aiEnhancementEnabled, sessionId]);

  // Confirm a pending idea - save to database
  const confirmPendingIdea = useCallback(async (pendingId) => {
    console.log('Confirming pending idea:', pendingId);
    const pending = pendingIdeas.find(p => p.id === pendingId);
    console.log('Pending idea found:', pending);
    if (!pending) return;

    setIsProcessing(true);
    console.log('Calling submitIdea with text:', pending.text);
    await submitIdea(pending.text, false, { category: pending.category, relevance: pending.relevance });
    console.log('submitIdea completed');
    setPendingIdeas(prev => prev.filter(p => p.id !== pendingId));
    setIsProcessing(false);
    console.log('Confirming done');
  }, [pendingIdeas, submitIdea]);

  // Reject a pending idea - delete from list
  const rejectPendingIdea = useCallback((pendingId) => {
    setPendingIdeas(prev => prev.filter(p => p.id !== pendingId));
  }, []);

  // Keep processTranscript in a ref so the recognition instance always calls the latest version
  const processTranscriptRef = useRef(processTranscript);
  processTranscriptRef.current = processTranscript;

  // Reset silence timer when speech is detected
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }

    silenceTimeoutRef.current = setTimeout(() => {
      processTranscriptRef.current();
    }, 3000);
  }, []);

  // Setup Web Speech API with continuous listening and silence detection
  // Created once; restart is handled by onend when isListeningRef is true
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ru-RU';
    recognitionRef.current = recognition;

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

      if (finalTranscript) {
        accumulatedTranscriptRef.current += finalTranscript;
        setTranscript(accumulatedTranscriptRef.current.trim() + (interimTranscript ? ' ' + interimTranscript : ''));
        resetSilenceTimer();
      } else if (interimTranscript) {
        setTranscript(accumulatedTranscriptRef.current.trim() + ' ' + interimTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      if (isListeningRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.log('Recognition restart failed:', e);
        }
      }
    };

    return () => {
      recognitionRef.current = null;
      recognition.stop();
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, [resetSilenceTimer]);

  // Keep isListening in a ref so onend always reads the current value
  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;

  // Helper function for logging
  const log = (message) => {
    console.log(message);
    if (!window.sessionDebugLogs) {
      window.sessionDebugLogs = [];
    }
    window.sessionDebugLogs.push(`[${new Date().toISOString()}] ${message}`);
  };

  // Save logs to file
  const saveLogsToFile = () => {
    const logs = window.sessionDebugLogs || [];
    const logText = logs.join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voxstorm-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Pan handlers
  const handleMouseDown = (e) => {
    if (e.target === containerRef.current || e.target.closest('.mind-map-content')) {
      if (!e.target.closest('.mind-map-node')) {
        setSelectedNodeId('center');
      }
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
    if (draggingNodeId !== null) {
      handleNodeMouseMove(e);
    }
  };

  const handleMouseUp = useCallback(() => {
    // Just clear dragging state - positions are kept in memory only
    if (draggingNodeId != null) {
      const pos = nodePositions[draggingNodeId];
      if (pos) {
        log(`Mouse UP - ${draggingNodeId === 'center' ? 'center' : 'idea ' + draggingNodeId} position: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}`);
      }
    }
    setIsDragging(false);
    setDraggingNodeId(null);
  }, [draggingNodeId, nodePositions]);

  const handleDeleteIdea = async (ideaId) => {
    if (deletingNodeId) return;
    setDeletingNodeId(ideaId);
    try {
      const res = await fetch(`http://localhost:5021/api/ideas/${ideaId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setIdeas(prev => prev.filter(i => i.id !== ideaId));
      setNodePositions(prev => {
        const next = { ...prev };
        delete next[ideaId];
        return next;
      });
      setIdeaConnections(prev => {
        const next = { ...prev };
        delete next[ideaId];
        return next;
      });
      if (selectedNodeId === ideaId) setSelectedNodeId('center');
    } catch (err) {
      console.error('Failed to delete idea:', err);
      alert('Не удалось удалить идею');
    } finally {
      setDeletingNodeId(null);
    }
  };

  // Node-specific drag handlers
  const handleNodeMouseDown = (e, nodeId, currentX, currentY) => {
    e.stopPropagation();
    e.preventDefault();
    log(`Starting drag for node: ${nodeId}`);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const containerCenterX = rect.width / 2;
      const containerCenterY = rect.height / 2;
      setDraggingNodeId(nodeId);
      setDraggingNodeOffset({
        x: e.clientX - containerCenterX - currentX,
        y: e.clientY - containerCenterY - currentY
      });
    }
  };

  const handleNodeMouseMove = (e) => {
    if (draggingNodeId !== null) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const containerCenterX = rect.width / 2;
        const containerCenterY = rect.height / 2;
        const newX = e.clientX - containerCenterX - draggingNodeOffset.x;
        const newY = e.clientY - containerCenterY - draggingNodeOffset.y;
        setNodePositions(prev => ({
          ...prev,
          [draggingNodeId]: { x: newX, y: newY }
        }));
      }
    }
  };

  // Attach wheel event with passive: false to allow preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(prev => Math.max(0.5, Math.min(3, prev + delta)));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Global mouse up listener to ensure positions are saved when dragging ends
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      handleMouseUp();
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [handleMouseUp]);

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

  // Categorize single text via LLM
  const categorizeText = async (text) => {
    try {
      const response = await fetch('http://localhost:5021/api/ideas/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, centralTheme: session?.centralTheme || '' })
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.error('Categorization error:', err);
    }
    return { category: 'Общее', relevance: 100 };
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualInput.trim()) return;

    const text = manualInput.trim();
    let category = 'Общее';
    let relevance = 100;

    if (aiEnhancementEnabled) {
      const result = await categorizeText(text);
      category = result.category || 'Общее';
      relevance = result.relevance || 100;
    }

    const newPendingIdea = {
      id: Date.now(),
      text,
      createdAt: new Date().toISOString(),
      category,
      relevance
    };
    setPendingIdeas(prev => [...prev, newPendingIdea]);
    setManualInput('');
  };

  const finishSession = async (navigateTo = null) => {
    try {
      // Stop voice input
      setIsListening(false);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
        recognitionRef.current = null;
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }

      // Save all current positions to localStorage before finishing
      const positionsData = {
        sessionId: sessionId,
        scale: scale,
        centerPosition: nodePositions['center'] || { x: 0, y: 0 },
        ideaPositions: {},
        connections: ideaConnections
      };
      ideas.forEach(idea => {
        if (nodePositions[idea.id]) {
          positionsData.ideaPositions[idea.id] = nodePositions[idea.id];
        }
      });
      localStorage.setItem(`voxstorm-positions-${sessionId}`, JSON.stringify(positionsData));
      log(`Saved ${Object.keys(positionsData.ideaPositions).length} idea positions to localStorage`);

      await fetch(`http://localhost:5021/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          startedAt: session?.startedAt || sessionStartedAtRef.current,
          endedAt: new Date().toISOString()
        })
      });
      navigate(navigateTo || `/session/${sessionId}/recap`);
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
            onClick={() => finishSession('/')}
            className="text-indigo-600 hover:text-indigo-800 font-medium"
          >
            ← Назад к списку
          </button>
          <div className="flex items-center gap-4">
            <span className="bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium">
              Сессия активна
            </span>
            <button
              onClick={() => finishSession()}
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
                    height: '600px'
                  }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
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
                    {/* Connection lines */}
                    {ideas.map((idea, idx) => {
                      const count = ideas.length || 1;
                      const angle = (idx * (360 / count)) * (Math.PI / 180);
                      const radius = 280;
                      const customPos = nodePositions[idea.id];
                      const offsetX = customPos?.x ?? Math.cos(angle) * radius;
                      const offsetY = customPos?.y ?? Math.sin(angle) * radius;
                      // Resolve target position based on this idea's connection
                      const connectedTo = ideaConnections[idea.id] ?? 'center';
                      let targetX, targetY;
                      if (connectedTo === 'center') {
                        targetX = nodePositions['center']?.x ?? 0;
                        targetY = nodePositions['center']?.y ?? 0;
                      } else {
                        const tIdx = ideas.findIndex(i => i.id === connectedTo);
                        const tCount = ideas.length || 1;
                        const tAngle = (tIdx * (360 / tCount)) * (Math.PI / 180);
                        const tPos = nodePositions[connectedTo];
                        targetX = tPos?.x ?? Math.cos(tAngle) * 280;
                        targetY = tPos?.y ?? Math.sin(tAngle) * 280;
                      }
                      const dx = offsetX - targetX;
                      const dy = offsetY - targetY;
                      const distance = Math.sqrt(dx * dx + dy * dy);
                      const lineAngle = Math.atan2(dy, dx);
                      return (
                        <div
                          key={`line-${idx}`}
                          className="absolute pointer-events-none"
                          style={{
                            left: `calc(50% + ${targetX}px)`,
                            top: `calc(50% + ${targetY}px)`,
                            width: `${distance}px`,
                            height: '3px',
                            background: 'linear-gradient(to right, rgba(99, 102, 241, 0.7), rgba(139, 92, 246, 0.35))',
                            borderRadius: '2px',
                            transform: `rotate(${lineAngle}rad)`,
                            transformOrigin: '0 50%',
                          }}
                        />
                      );
                    })}

                    {/* Central Theme - Root Node (MAIN ELEMENT) */}
                    <div
                      className={`mind-map-node absolute z-20 cursor-grab active:cursor-grabbing ${selectedNodeId === 'center' ? 'ring-4 ring-indigo-400 rounded-2xl' : ''}`}
                      style={{
                        left: `calc(50% + ${nodePositions['center']?.x ?? 0}px)`,
                        top: `calc(50% + ${nodePositions['center']?.y ?? 0}px)`,
                        transform: 'translate(-50%, -50%)'
                      }}
                      onMouseDown={(e) => handleNodeMouseDown(e, 'center', nodePositions['center']?.x ?? 0, nodePositions['center']?.y ?? 0)}
                      onClick={(e) => { e.stopPropagation(); setSelectedNodeId('center'); }}
                    >
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
                      const radius = 280;
                      const defaultOffsetX = Math.cos(angle) * radius;
                      const defaultOffsetY = Math.sin(angle) * radius;
                      const customPos = nodePositions[idea.id];
                      const offsetX = customPos?.x ?? defaultOffsetX;
                      const offsetY = customPos?.y ?? defaultOffsetY;

                      return (
                        <div
                          key={idea.id || idx}
                          className={`mind-map-node absolute transform -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-110 hover:z-30 cursor-grab active:cursor-grabbing ${selectedNodeId === idea.id ? 'ring-4 ring-indigo-400 rounded-xl z-30' : ''}`}
                          style={{
                            left: `calc(50% + ${offsetX}px)`,
                            top: `calc(50% + ${offsetY}px)`
                          }}
                          onMouseDown={(e) => handleNodeMouseDown(e, idea.id, offsetX, offsetY)}
                          onClick={(e) => { e.stopPropagation(); setSelectedNodeId(idea.id); }}
                        >
                          <div className="relative bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-5 shadow-lg border-2 border-emerald-200 hover:border-emerald-400 hover:shadow-xl transition-all max-w-[280px]">
                            {selectedNodeId === idea.id && (
                              <button
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-all z-40"
                                onClick={(e) => { e.stopPropagation(); handleDeleteIdea(idea.id); }}
                                title="Удалить идею"
                                disabled={deletingNodeId === idea.id}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                            <p className="text-gray-800 text-sm font-medium" style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 5,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}>{idea.text}</p>
                            <div className="mt-3 pt-2 border-t border-emerald-200 flex items-center justify-between">
                              <span className="text-xs text-gray-400">
                                {idea.createdAt ? new Date(idea.createdAt).toLocaleTimeString() : ''}
                              </span>
                              <div className="flex items-center gap-2">
                                {idea.category && (
                                  <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs">
                                    {idea.category}
                                  </span>
                                )}
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                  idea.relevance >= 70 ? 'bg-green-100 text-green-700' :
                                  idea.relevance >= 40 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {idea.relevance >= 70 ? 'Высокий' : idea.relevance >= 40 ? 'Средний' : 'Низкий'} приоритет
                                </span>
                              </div>
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
          <div className="mb-4 flex items-center gap-4 flex-wrap">
            {/* AI Enhancement Toggle */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-200 ${isListening ? 'bg-gray-100' : 'bg-gradient-to-r from-purple-50 to-indigo-50'}`}>
              <span className={`text-sm font-medium ${isListening ? 'text-gray-400' : 'text-purple-700'}`}>AI:</span>
              <button
                onClick={() => {
                  const newValue = !aiEnhancementEnabled;
                  console.log(`[AI Toggle] ${newValue ? 'ON' : 'OFF'}`);
                  setAiEnhancementEnabled(newValue);
                }}
                disabled={isListening}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  isListening ? 'bg-gray-300 cursor-not-allowed' : aiEnhancementEnabled ? 'bg-purple-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    aiEnhancementEnabled ? 'translate-x-6' : ''
                  }`}
                />
              </button>
              <span className={`text-xs ${isListening ? 'text-gray-400' : 'text-purple-600'}`}>
                {isListening ? '⚠️ Идет запись' : aiEnhancementEnabled ? 'Вкл' : 'Выкл'}
              </span>
            </div>

            <button
              onClick={toggleVoiceInput}
              disabled={isProcessing || isLLmProcessing}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                isProcessing || isLLmProcessing
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              <span>{isProcessing || isLLmProcessing ? '⏳ Обработка...' : isListening ? '⏹ Стоп' : '🎤 Голосовой ввод'}</span>
            </button>

            {/* Fix button - appears when there's accumulated transcript */}
            {isListening && transcript && (
              <button
                onClick={() => {
                  if (silenceTimeoutRef.current) {
                    clearTimeout(silenceTimeoutRef.current);
                  }
                  processTranscript();
                }}
                className="flex items-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Зафиксировать
              </button>
            )}

            {isListening && (
              <span className="text-green-600 font-medium animate-pulse flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Слушаю...
              </span>
            )}
          </div>

          {/* Transcript Display - Show while capturing */}
          {transcript && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-gray-700">{transcript}</p>
              <p className="text-xs text-gray-400 mt-2">
                Идея сохранится автоматически после 3 секунд молчания или по кнопке "Зафиксировать"
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
                    <input
                      type="text"
                      value={pending.text}
                      onChange={(e) => setPendingIdeas(prev => prev.map(p => p.id === pending.id ? { ...p, text: e.target.value } : p))}
                      className="w-full text-gray-800 bg-transparent border-b border-transparent hover:border-orange-300 focus:border-orange-400 focus:outline-none transition-colors"
                    />
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-400">
                        {new Date(pending.createdAt).toLocaleTimeString()}
                      </p>
                      {pending.category && (
                        <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs">
                          {pending.category}
                        </span>
                      )}
                      {pending.relevance && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          pending.relevance >= 70 ? 'bg-green-100 text-green-700' :
                          pending.relevance >= 40 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {pending.relevance >= 70 ? 'Высокий' : pending.relevance >= 40 ? 'Средний' : 'Низкий'} приоритет
                        </span>
                      )}
                    </div>
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
