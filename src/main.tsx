import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// فونت فارسی Vazirmatn به‌صورت محلی (بدون CDN)
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/vazirmatn/800.css';
import '@fontsource/vazirmatn/900.css';
import './styles/global.css';
import './styles/dark.generated.css';
import './styles/dark.css';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';
import { FeedbackProvider } from './context/FeedbackContext';
import { NotifProvider } from './context/NotifContext';
import { AreaModeProvider } from './context/AreaModeContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <FeedbackProvider>
          <NotifProvider>
            <AreaModeProvider>
              <App />
            </AreaModeProvider>
          </NotifProvider>
        </FeedbackProvider>
      </SettingsProvider>
    </ThemeProvider>
  </StrictMode>,
);
