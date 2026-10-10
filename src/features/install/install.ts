interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface InstallState {
  installed: boolean;
  recommendationHidden: boolean;
  checking: boolean;
  prompting: boolean;
  prompt: InstallPromptEvent | null;
}

const initialState: InstallState = { installed: false, recommendationHidden: false, checking: false, prompting: false, prompt: null };
const dismissalKey = 'rooz-install-recommendation-hidden';
let state = initialState;
let initialized = false;
let readinessTimer: ReturnType<typeof setTimeout> | undefined;

function finishChecking() {
  clearTimeout(readinessTimer);
  update({ checking: false });
}
const listeners = new Set<() => void>();

function update(patch: Partial<InstallState>) {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const getInstallState = () => state;
export const getServerInstallState = () => initialState;

export function hideInstallRecommendation() {
  update({ recommendationHidden: true });
  try { window.localStorage.setItem(dismissalKey, 'true'); } catch { /* Keep dismissal in memory when storage is unavailable. */ }
}

export function isAppleMobile() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Bootstrap before the lazy app loads so an early browser install event is not lost.
export function initializeInstall() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const iosInstalled = () => (navigator as Navigator & { standalone?: boolean }).standalone === true;
  let recommendationHidden = false;
  try { recommendationHidden = window.localStorage.getItem(dismissalKey) === 'true'; } catch { /* Storage can be blocked in private browsing. */ }
  const installed = standalone.matches || iosInstalled();
  const checking = !installed && !isAppleMobile() && import.meta.env.PROD && window.isSecureContext && 'onbeforeinstallprompt' in window;
  update({ installed, recommendationHidden, checking });
  // The browser decides installability asynchronously; never infer it from viewport size.
  if (checking) readinessTimer = setTimeout(finishChecking, 8000);
  standalone.addEventListener('change', () => update({ installed: standalone.matches || iosInstalled() }));
  window.addEventListener('beforeinstallprompt', event => {
    if (typeof (event as InstallPromptEvent).prompt !== 'function') return;
    event.preventDefault();
    finishChecking();
    if (!isAppleMobile() && !state.installed) update({ prompt: event as InstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    finishChecking();
    update({ installed: true, prompt: null });
  });
}

export async function promptInstall() {
  const prompt = state.prompt;
  if (!prompt || state.prompting) return null;
  // A deferred browser event can be used only once, even if the user cancels.
  update({ prompt: null, prompting: true });
  try {
    await prompt.prompt();
    return (await prompt.userChoice).outcome;
  } finally { update({ prompting: false }); }
}

export function registerOfflineApp() {
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  const register = () => {
    const url = new URL(`${import.meta.env.BASE_URL}sw.js`, document.baseURI);
    void navigator.serviceWorker.register(url.href, { scope: new URL('./', url).href, updateViaCache: 'none' })
      .catch(error => console.warn('Offline installation is unavailable', error));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
