import React, { useState } from 'react';
import './App.css';

export default function App() {
  const [sessionName, setSessionName] = useState('');
  const [centralTheme, setCentralTheme] = useState('');
  const [method, setMethod] = useState('association');
  const [participants, setParticipants] = useState([]);
  const [newParticipant, setNewParticipant] = useState('');

  const addParticipant = () => {
    if (newParticipant.trim() !== '') {
      setParticipants([...participants, newParticipant.trim()]);
      setNewParticipant('');
    }
  };

  const removeParticipant = (idx) => {
    setParticipants(participants.filter((_, i) => i !== idx));
  };

  const startSession = (e) => {
    e.preventDefault();
    const data = { sessionName, centralTheme, method, participants };
    console.log('Starting session with data', data);
    alert('Session created: ' + JSON.stringify(data, null, 2));
    // TODO: send to backend API
  };

  return (
    <div className="container">
      <h1>VoxStorm</h1>
      <h2>Настройка новой сессии брейншторма</h2>
      <form onSubmit={startSession}>
        <div className="field">
          <label>Название сессии</label>
          <input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Центральная тема</label>
          <input
            value={centralTheme}
            onChange={(e) => setCentralTheme(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Методика брейншторма</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            disabled
          >
            <option value="association">Ассоциативная карта</option>
          </select>
        </div>
        <div className="field">
          <label>Участники (опционально)</label>
          <div className="participants-input">
            <input
              value={newParticipant}
              onChange={(e) => setNewParticipant(e.target.value)}
              placeholder="Имя участника"
            />
            <button type="button" onClick={addParticipant}>+</button>
          </div>
          <ul className="participants-list">
            {participants.map((p, idx) => (
              <li key={idx}>
                {p} <button type="button" onClick={() => removeParticipant(idx)}>×</button>
              </li>
            ))}
          </ul>
        </div>
        <button type="submit" className="start-button">Начать сессию →</button>
      </form>
    </div>
  );
}
