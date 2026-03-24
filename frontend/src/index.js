import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import ActiveSession from './pages/ActiveSession';
import Recap from './pages/Recap';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/session/:sessionId" element={<ActiveSession />} />
        <Route path="/session/:sessionId/recap" element={<Recap />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
