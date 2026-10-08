import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, HardDrive, Palette, Plus, Trash2, X } from 'lucide-react';
import type { CalendarSystem } from '../domain/models';
import { CalendarSwitch } from './CalendarSwitch';
import {
  applyTheme, createCustomTheme, defaultThemePreferences, normalizeThemeAppearance,
  normalizeThemePreferences, parentThemes, resolveTheme, themeAnimations, themeEffects,
  type CustomTheme, type ParentThemeId, type ThemeAnimation, type ThemeAppearance,
  type ThemeEffect, type ThemePreferences
} from '../features/themes';
import { useDialogFocus } from '../features/themes/useDialogFocus';

export interface SettingsDialogProps {
  open: boolean;
  calendar: CalendarSystem;
  onCalendarChange: (calendar: CalendarSystem) => void | Promise<void>;
  onClose: () => void;
  theme: ThemePreferences;
  onThemeChange: (value: ThemePreferences) => Promise<void>;
  onClearMemory: () => Promise<void>;
}
const animationLabels: Record<ThemeAnimation, string> = { none: 'بدون حرکت', subtle: 'ملایم', full: 'کامل', tech: 'فنی' };
const effectLabels: Record<ThemeEffect, string> = { none: 'بدون افکت', acrylic: 'اکریلیک', 'liquid-glass': 'شیشه‌ی مایع' };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'عملیات انجام نشد؛ دوباره تلاش کنید.';

export function SettingsDialog(props: SettingsDialogProps) {
  return props.open ? <SettingsContent {...props}/> : null;
}

function SettingsContent({ calendar, onCalendarChange, onClose, theme, onThemeChange, onClearMemory }: SettingsDialogProps) {
  const id = useId();
  const dialog = useRef<HTMLElement>(null);
  const saved = useRef(normalizeThemePreferences(theme));
  const [draft, setDraft] = useState(() => normalizeThemePreferences(theme));
  const [editorId, setEditorId] = useState<string | null>(null);
  const beforeEdit = useRef<ThemePreferences | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState('');
  const { parent } = resolveTheme(draft);
  const selected = draft.customThemes.find(custom => custom.id === draft.activeThemeId);
  const editing = draft.customThemes.find(custom => custom.id === editorId);

  // External persistence remains authoritative on cancel, without replacing an in-progress draft.
  useEffect(() => { saved.current = normalizeThemePreferences(theme); }, [theme]);
  useEffect(() => {
    // An empty name is valid while typing, but must not change the live appearance.
    applyTheme({ ...draft, customThemes: draft.customThemes.map(custom => ({ ...custom, name: custom.name.trim() || 'تم شخصی' })) });
  }, [draft]);
  const previousEditorId = useRef(editorId);
  useEffect(() => {
    if (previousEditorId.current === editorId) return;
    previousEditorId.current = editorId;
    dialog.current?.querySelector<HTMLElement>(editorId ? '[data-theme-name]' : '[data-theme-edit], [data-theme-create]')?.focus();
  }, [editorId]);
  useEffect(() => {
    mounted.current = true;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      mounted.current = false;
      body.style.overflow = previousOverflow;
      applyTheme(saved.current);
    };
  }, []);

  function cancel() {
    if (lock.current) return;
    applyTheme(saved.current);
    onClose();
  }
  useDialogFocus(dialog, cancel, confirmClear);

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (failure) { if (mounted.current) setError(errorText(failure)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function changeDraft(next: ThemePreferences) {
    setDraft(normalizeThemePreferences(next)); setError('');
  }
  function startEditor(custom?: CustomTheme) {
    beforeEdit.current = normalizeThemePreferences(draft);
    if (custom) { setEditorId(custom.id); changeDraft({ ...draft, activeThemeId: custom.id }); }
    else {
      const uniqueId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const newTheme = createCustomTheme(`custom-${uniqueId}`, 'تم شخصی', parent.id);
      setEditorId(newTheme.id);
      changeDraft({ ...draft, activeThemeId: newTheme.id, customThemes: [...draft.customThemes, newTheme] });
    }
  }
  function updateCustom(next: CustomTheme) {
    // Retain a temporarily empty name in the editor; validate it before normalization/save.
    setDraft({ ...draft, customThemes: draft.customThemes.map(custom => custom.id === next.id ? next : custom) });
    setError('');
  }
  function updateAppearance(patch: Partial<ThemeAppearance>) {
    if (!editing) return;
    updateCustom({ ...editing, modes: { ...editing.modes, [draft.mode]: normalizeThemeAppearance({ ...editing.modes[draft.mode], ...patch }, editing.parentId, draft.mode) } });
  }
  function finishEditor() {
    if (!editing?.name.trim()) { setError('نام تم را وارد کنید.'); return; }
    changeDraft(draft); setEditorId(null); beforeEdit.current = null;
  }
  function cancelEditor() {
    if (beforeEdit.current) changeDraft(beforeEdit.current);
    setEditorId(null); beforeEdit.current = null;
  }
  function deleteCustom(custom: CustomTheme) {
    changeDraft({ ...draft, activeThemeId: draft.activeThemeId === custom.id ? custom.parentId : draft.activeThemeId, customThemes: draft.customThemes.filter(item => item.id !== custom.id) });
  }
  async function save() {
    await run(async () => {
      const next = normalizeThemePreferences(draft);
      await onThemeChange(next);
      saved.current = next;
      if (mounted.current) { applyTheme(next); onClose(); }
    });
  }
  async function clearMemory() {
    await run(async () => {
      await onClearMemory();
      saved.current = normalizeThemePreferences(defaultThemePreferences);
      if (mounted.current) { applyTheme(saved.current); onClose(); }
    });
  }
  const appearance = editing?.modes[draft.mode];
  const mini = editing?.parentId === 'mini';

  return <div className="modal-backdrop theme-settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !confirmClear) cancel(); }}>
    <section ref={dialog} className="settings-dialog theme-settings-dialog" role="dialog" aria-modal={confirmClear ? undefined : true} aria-hidden={confirmClear || undefined} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={busy} tabIndex={-1} dir="rtl">
      <header className="dialog-top"><div><span className="eyebrow">شخصی‌سازی روز</span><h2 id={`${id}-title`}>تنظیمات</h2></div><button type="button" className="icon-button" aria-label="بستن تنظیمات و لغو تغییرات تم" disabled={busy} onClick={cancel}><X size={18}/></button></header>
      <p className="theme-help" id={`${id}-description`}>تغییرات تم را زنده ببینید؛ تا زمان ذخیره، فقط پیش‌نمایش هستند. بستن پنجره تغییرات تم را لغو می‌کند.</p>
      <fieldset className="theme-settings-fields" disabled={busy}>
        <div className="setting-row"><span className="setting-icon"><CalendarDays size={17}/></span><div className="setting-copy"><strong>تقویم نمایش</strong><small>تغییر تقویم بلافاصله ذخیره می‌شود.</small></div><CalendarSwitch value={calendar} onChange={value => { void run(async () => { await onCalendarChange(value); }); }}/></div>
        <section className="theme-settings-section" aria-labelledby={`${id}-themes`}>
          <h3 id={`${id}-themes`}><Palette size={17}/>تم و ظاهر</h3>
          <div className="theme-mode-switch" role="group" aria-label="حالت نمایش">
            <button type="button" aria-pressed={draft.mode === 'light'} onClick={() => setDraft({ ...draft, mode: 'light' })}>روشن</button>
            <button type="button" aria-pressed={draft.mode === 'dark'} onClick={() => setDraft({ ...draft, mode: 'dark' })}>تیره</button>
          </div>
          {!editing && <>
            <div className="theme-choices" role="group" aria-label="تم‌های پایه">
              {parentThemes.map(item => <button type="button" key={item.id} className="theme-choice" aria-pressed={draft.activeThemeId === item.id} onClick={() => changeDraft({ ...draft, activeThemeId: item.id })}><strong>{item.name}</strong><small>{item.description}</small></button>)}
            </div>
            {draft.customThemes.length > 0 && <div className="theme-choices" role="group" aria-label="تم‌های شخصی">
              {draft.customThemes.map(custom => <button type="button" key={custom.id} className="theme-choice" aria-pressed={draft.activeThemeId === custom.id} onClick={() => changeDraft({ ...draft, activeThemeId: custom.id })}><strong>{custom.name}</strong><small>بر پایه‌ی {parentThemes.find(item => item.id === custom.parentId)?.name}</small></button>)}
            </div>}
            <div className="theme-tools"><button className="button secondary" type="button" data-theme-create onClick={() => startEditor()}><Plus size={15}/>ساخت تم شخصی</button>{selected && <><button type="button" className="button secondary" data-theme-edit onClick={() => startEditor(selected)}>ویرایش تم</button><button type="button" className="button theme-danger" onClick={() => deleteCustom(selected)}><Trash2 size={15}/>حذف تم</button></>}</div>
          </>}
          {editing && appearance && <div className="theme-editor">
            <h4>ویرایش تم شخصی — {draft.mode === 'light' ? 'روشن' : 'تیره'}</h4>
            <p className="theme-help">رنگ‌ها، حرکت و افکت هر حالت جداگانه ذخیره می‌شوند.</p>
            <label className="theme-field">نام تم<input data-theme-name maxLength={60} value={editing.name} onChange={event => updateCustom({ ...editing, name: event.target.value })}/></label>
            <label className="theme-field">تم پایه<select value={editing.parentId} onChange={event => {
              const parentId = event.target.value as ParentThemeId;
              updateCustom({ ...editing, parentId, modes: {
                light: normalizeThemeAppearance(editing.modes.light, parentId, 'light'),
                dark: normalizeThemeAppearance(editing.modes.dark, parentId, 'dark')
              } });
            }}>{parentThemes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <div className="theme-controls-grid">
              <label className="theme-field">پس‌زمینه<select value={appearance.background.kind} onChange={event => updateAppearance({ background: { ...appearance.background, kind: event.target.value === 'gradient' ? 'gradient' : 'solid' } })}><option value="solid">تک‌رنگ</option><option value="gradient">گرادیان</option></select></label>
              <label className="theme-field">رنگ پس‌زمینه<input type="color" value={appearance.background.color} onChange={event => updateAppearance({ background: { ...appearance.background, color: event.target.value } })}/></label>
              {appearance.background.kind === 'gradient' && <>
                <label className="theme-field">رنگ دوم<input type="color" value={appearance.background.endColor} onChange={event => updateAppearance({ background: { ...appearance.background, endColor: event.target.value } })}/></label>
                <label className="theme-field">زاویه‌ی گرادیان ({appearance.background.angle}°)<input type="range" min={0} max={360} value={appearance.background.angle} onChange={event => updateAppearance({ background: { ...appearance.background, angle: Number(event.target.value) } })}/></label>
              </>}
              <label className="theme-field">رنگ تأکید<input type="color" value={appearance.accent} onChange={event => updateAppearance({ accent: event.target.value })}/></label>
              <label className="theme-field">حرکت<select disabled={mini} aria-describedby={mini ? `${id}-mini` : undefined} value={mini ? 'none' : appearance.animation} onChange={event => updateAppearance({ animation: event.target.value as ThemeAnimation })}>{themeAnimations.map(value => <option key={value} value={value}>{animationLabels[value]}</option>)}</select></label>
              <label className="theme-field">افکت<select disabled={mini} aria-describedby={mini ? `${id}-mini` : undefined} value={mini ? 'none' : appearance.effect} onChange={event => updateAppearance({ effect: event.target.value as ThemeEffect })}>{themeEffects.map(value => <option key={value} value={value}>{effectLabels[value]}</option>)}</select></label>
            </div>
            {mini && <p id={`${id}-mini`} className="theme-help">مینی همیشه بدون حرکت و افکت است؛ این محدودیت برای تم‌های شخصی هم اعمال می‌شود.</p>}
            <div className="theme-tools"><button type="button" className="button primary" onClick={finishEditor}>تأیید تم در پیش‌نویس</button><button type="button" className="button secondary" onClick={cancelEditor}>لغو ویرایش</button></div>
          </div>}
        </section>
        <section className="theme-settings-section"><div className="setting-row"><span className="setting-icon"><HardDrive size={17}/></span><div className="setting-copy"><strong>حافظه‌ی محلی</strong><small>اطلاعات فقط در همین مرورگر و دستگاه نگهداری می‌شود.</small></div></div><p className="theme-help">پاک‌کردن حافظه، همه‌ی هدف‌ها، کارها، بازه‌ها، یادداشت‌ها، تنظیمات و تم‌های شخصی را برای همیشه حذف می‌کند.</p><button type="button" className="button theme-danger" onClick={() => { setError(''); setConfirmClear(true); }}><Trash2 size={15}/>پاک‌کردن تمام حافظه</button></section>
      </fieldset>
      {error && !confirmClear && <p className="theme-error" role="alert">{error}</p>}
      <footer className="dialog-actions"><button type="button" className="button primary" disabled={busy || !!editing} onClick={() => { void save(); }}>{busy ? 'در حال انجام…' : 'ذخیره‌ی تم و بستن'}</button><button type="button" className="button secondary" disabled={busy} onClick={cancel}>لغو</button></footer>
    </section>
    {confirmClear && <ClearConfirmation busy={busy} error={error} onCancel={() => { if (!lock.current) { setConfirmClear(false); setError(''); } }} onConfirm={() => { void clearMemory(); }}/>}
  </div>;
}

function ClearConfirmation({ busy, error, onCancel, onConfirm }: { busy: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const id = useId();
  useDialogFocus(dialog, onCancel);
  return <div className="theme-confirm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}><section ref={dialog} className="theme-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-warning`} aria-busy={busy} tabIndex={-1} dir="rtl">
    <h2 id={`${id}-title`}>همه‌ی اطلاعات پاک شوند؟</h2><p id={`${id}-warning`}>تمام اطلاعات محلی برنامه‌ریز، از جمله هدف‌ها، کارها، برنامه‌ها، یادداشت‌ها، تنظیمات و همه‌ی تم‌های شخصی حذف خواهند شد. این کار برگشت‌پذیر نیست و نسخه‌ی پشتیبانی ساخته نمی‌شود.</p>
    {error && <p className="theme-error" role="alert">{error}</p>}
    <div className="theme-tools"><button type="button" className="button secondary" data-autofocus disabled={busy} onClick={onCancel}>نه، نگه‌دار</button><button type="button" className="button theme-danger" disabled={busy} onClick={onConfirm}>{busy ? 'در حال پاک‌کردن…' : 'بله، همه را برای همیشه پاک کن'}</button></div>
  </section></div>;
}
