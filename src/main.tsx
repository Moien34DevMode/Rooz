import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/global.css';
import './styles/themes.css';
import { initializeInstall, registerOfflineApp } from './features/install/install';

initializeInstall();
registerOfflineApp();

const loader = document.getElementById('startup-loader');
const status = document.getElementById('startup-status');
const root = document.getElementById('root')!;

async function prepareFonts() {
  if (!document.fonts) return;
  try {
    await Promise.all([400, 500, 600, 700].map(weight => document.fonts.load(`${weight} 14px Vazirmatn`, 'روز')));
  } catch (error) {
    // A failed remote font must not prevent using the planner with its local fallback.
    console.warn('Using fallback font', error);
  }
  await document.fonts.ready;
}

async function start() {
  try {
    if (status) status.textContent = 'در حال دریافت اجزای برنامه و قلم‌ها…';
    const [{ App }] = await Promise.all([
      import('./app/App'),
      prepareFonts()
    ]);
    if (status) status.textContent = 'در حال باز کردن حافظه و آماده‌سازی برنامه…';
    const ready = () => {
      if (!loader?.isConnected) return;
      loader.remove();
      root.removeAttribute('inert');
      root.removeAttribute('aria-hidden');
    };
    ReactDOM.createRoot(root).render(<React.StrictMode><App onReady={ready}/></React.StrictMode>);
  } catch (error) {
    console.error('Rooz startup failed', error);
    if (status) status.textContent = 'بارگذاری برنامه انجام نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.';
    const retry = document.getElementById('startup-retry');
    if (retry) { retry.hidden = false; retry.onclick = () => window.location.reload(); }
  }
}
void start();
