import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { Download, X } from 'lucide-react';
import { getInstallState, getServerInstallState, hideInstallRecommendation, isAppleMobile, promptInstall, subscribeInstall } from '../features/install/install';
import '../styles/install.css';

export function InstallApp({ placement = 'recommendation' }: { placement?: 'recommendation' | 'settings' }) {
  const { installed, recommendationHidden, checking, prompting, prompt } = useSyncExternalStore(subscribeInstall, getInstallState, getServerInstallState);
  const [guide, setGuide] = useState(false);
  const [message, setMessage] = useState('');
  const guideId = useId();
  const settings = placement === 'settings';
  useEffect(() => {
    if (prompt) { setGuide(false); setMessage(''); }
  }, [prompt]);
  if (installed || placement === 'recommendation' && recommendationHidden) return null;

  async function install() {
    if (!prompt) { if (!checking && !prompting) setGuide(value => !value); return; }
    setGuide(false);
    try {
      const outcome = await promptInstall();
      setMessage(outcome === 'accepted' ? 'درخواست نصب به مرورگر ارسال شد.' : 'نصب انجام نشد؛ برای تلاش دوباره از گزینهٔ نصب در منوی مرورگر استفاده کنید.');
    } catch {
      setMessage('مرورگر درخواست نصب را نپذیرفت؛ از راهنمای نصب استفاده کنید.');
      setGuide(true);
    }
  }

  const native = !!prompt;
  const mode = prompting ? 'prompting' : native ? 'ready' : checking ? 'checking' : 'manual';
  return <section className={`${settings ? 'theme-settings-section ' : ''}install-app install-app--${placement}`} data-install-placement={placement} data-install-mode={mode} aria-label="نصب روز روی دستگاه">
    <div className={`install-app-row${settings ? ' setting-row' : ''}`}>
      <span className={`install-app-icon${settings ? ' setting-icon' : ''}`}><Download size={20} aria-hidden="true"/></span>
      <div className={`install-app-copy${settings ? ' setting-copy' : ''}`}><strong>{settings ? 'نصب برنامه' : 'روز را روی دستگاهتان نصب کنید'}</strong><p>دسترسی مستقیم از دسکتاپ یا صفحهٔ اصلی؛ قابل استفاده بدون اینترنت.</p></div>
      <div className="install-app-actions">
        <button type="button" className="install-app-button" onClick={() => { void install(); }} disabled={checking || prompting} aria-expanded={!native ? guide : undefined} aria-controls={!native ? guideId : undefined}>{prompting ? 'در انتظار مرورگر…' : native ? 'نصب برنامه' : checking ? 'در حال آماده‌سازی…' : 'راهنمای نصب'}</button>
        {(native || checking) && <button type="button" className="install-app-help" aria-expanded={guide} aria-controls={guideId} onClick={() => setGuide(value => !value)}>روش نصب</button>}
      </div>
      {placement === 'recommendation' && <button type="button" className="install-app-hide" aria-label="پنهان کردن پیشنهاد نصب" onClick={hideInstallRecommendation}><X size={18} aria-hidden="true"/></button>}
    </div>
    {message && <p className="install-app-message" role="status">{message}</p>}
    {guide && <div className="install-app-guide" id={guideId}>
      <div className="install-app-guide-heading"><strong>راهنمای نصب</strong><button type="button" className="install-app-dismiss" aria-label="بستن راهنمای نصب" onClick={() => setGuide(false)}><X size={18} aria-hidden="true"/></button></div>
      {isAppleMobile() ? <ol><li>این صفحه را در Safari باز کنید.</li><li>از منوی اشتراک‌گذاری <span lang="en" dir="ltr">(Share)</span>، «افزودن به صفحهٔ اصلی» <span lang="en" dir="ltr">(Add to Home Screen)</span> و سپس «افزودن» را انتخاب کنید.</li></ol> : typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) ? <ol><li>این صفحه را در Chrome یا Edge باز کنید.</li><li>از منوی ⋮، «نصب برنامه» یا «افزودن به صفحهٔ اصلی» <span lang="en" dir="ltr">(Add to Home Screen)</span> را انتخاب کنید.</li></ol> : <ol><li>در Windows، این صفحه را در Edge یا Chrome باز کنید.</li><li>نشان نصب در نوار آدرس یا گزینهٔ «نصب این سایت به‌عنوان برنامه» در منوی مرورگر را انتخاب کنید. در Edge این گزینه در بخش Apps است.</li></ol>}
      <p className="install-app-note">نصب خودکار به تأیید مرورگر وابسته است، نه اندازهٔ پنجره. اگر برنامه از قبل نصب است یا درخواست را لغو کرده‌اید، از منوی مرورگر اقدام کنید.</p>
      {typeof window !== 'undefined' && !window.isSecureContext && <p>برای نصب، نسخهٔ منتشرشدهٔ برنامه را با آدرس امن HTTPS باز کنید.</p>}
      <p className="install-app-note">اطلاعات روی همین دستگاه می‌ماند؛ پیش از حذف برنامه یا داده‌های سایت، از تنظیمات فایل پشتیبان بگیرید.</p>
    </div>}
  </section>;
}
