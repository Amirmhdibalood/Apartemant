import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// فونت فارسی Vazirmatn به‌صورت محلی (بدون CDN)
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/vazirmatn/800.css';
import './styles/global.css';
import App from './App';
import { SettingsProvider } from './context/SettingsContext';
import { FeedbackProvider } from './context/FeedbackContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <FeedbackProvider>
        <App />
      </FeedbackProvider>
    </SettingsProvider>
  </StrictMode>,
);
