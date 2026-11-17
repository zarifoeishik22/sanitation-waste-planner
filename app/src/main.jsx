import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/anek-bangla';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import App from './App.jsx';

// Remove the offline copy an earlier version left behind (see public/sw.js).
if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.update().catch(() => {}))).catch(() => {});

createRoot(document.getElementById('root')).render(<App />);
