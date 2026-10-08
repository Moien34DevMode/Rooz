import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, HardDrive, Palette, Plus, Trash2, X } from 'lucide-react';
import type { CalendarSystem } from '../domain/models';
import { CalendarSwitch } from './CalendarSwitch';
import { SelectField } from './SelectField';
import { ThemeColorField, type ThemeColorPreset } from './ThemeColorField';
import '../styles/themeControls.css';
import '../styles/settingsLayout.css';
import {
  applyTheme, createCustomTheme, defaultThemePreferences, normalizeThemeAppearance,
  normalizeThemePreferences, parentThemes, resolveTheme, setCustomModeLink,
  themeAnimations, themeEffects, updateCustomAppearance, switchThemeMode,
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
const effectDescriptions: Record<ThemeEffect, string> = {
  none: 'سطح یکدست و بدون محوشدن پس‌زمینه.',
  acrylic: 'سطح نیمه‌شفاف با محوشدن پس‌زمینه؛ مات‌تر از شیشه‌ی مایع.',
  'liquid-glass': 'سطح شفاف‌تر با محوشدن بیشتر، اشباع رنگ و درخشش لبه‌ها.'
};
const animationDescriptions: Record<ThemeAnimation, string> = {
  none: 'بدون حرکت و گذار.',
  subtle: 'گذارهای کوتاه و نرم.',
  full: 'گذارهای طولانی‌تر و حرکت دکمه‌ها هنگام اشاره.',
  tech: 'گذارهای پله‌ای و کادر خط‌چین هنگام اشاره.'
};
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
  const [expandedColor, setExpandedColor] = useState<string | null>(null);
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

    return () => {
      mounted.current = false;

      applyTheme(saved.current);
    };
  }, []);

  function cancel() {
    if (lock.current) return;
    applyTheme(saved.current);
    onClose();
  }
  useDialogFocus(dialog, () => {
    // The trap handles Escape in capture phase, before SelectField's key handler.
    const expanded = dialog.current?.querySelector<HTMLButtonElement>('[role="combobox"][aria-expanded="true"]');
    if (expanded) { expanded.click(); expanded.focus(); }
    else if (expandedColor) {
      dialog.current?.querySelector<HTMLButtonElement>('.theme-color-toggle[aria-expanded="true"]')?.focus();
      setExpandedColor(null);
    } else cancel();
  }, confirmClear);

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (failure) { if (mounted.current) setError(errorText(failure)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function changeDraft(update: (current: ThemePreferences) => ThemePreferences) {
    setDraft(update); setError('');
  }
  function startEditor(custom?: CustomTheme) {
    beforeEdit.current = draft;
    setExpandedColor(null);
    if (custom) { setEditorId(custom.id); changeDraft(current => ({ ...current, activeThemeId: custom.id })); }
    else {
      const uniqueId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const newTheme = setCustomModeLink(createCustomTheme(`custom-${uniqueId}`, 'تم شخصی', parent.id), draft.mode, true);
      setEditorId(newTheme.id);
      changeDraft(current => ({ ...current, activeThemeId: newTheme.id, customThemes: [...current.customThemes, newTheme] }));
    }
  }
  function updateCustom(update: (custom: CustomTheme, current: ThemePreferences) => CustomTheme) {
    // Retain a temporarily empty name; normalization belongs at the save boundary.
    changeDraft(current => ({ ...current, customThemes: current.customThemes.map(custom => custom.id === editorId ? update(custom, current) : custom) }));
  }
  function updateAppearance(patch: Partial<ThemeAppearance> | ((appearance: ThemeAppearance) => Partial<ThemeAppearance>)) {
    updateCustom((custom, current) => updateCustomAppearance(custom, current.mode, typeof patch === 'function' ? patch(custom.modes[current.mode]) : patch));
  }
  function validateColors() {
    const invalidHex = dialog.current?.querySelector<HTMLInputElement>('.theme-color-hex:enabled:invalid');
    if (!invalidHex) return true;
    invalidHex.focus();
    setError('کد رنگ نامعتبر را اصلاح کنید؛ مانند #517365.');
    return false;
  }
  function cancelEditor() {
    const snapshot = beforeEdit.current;
    if (snapshot) changeDraft(() => snapshot);
    setEditorId(null); setExpandedColor(null); beforeEdit.current = null;
  }
  function deleteCustom(custom: CustomTheme) {
    changeDraft(current => ({ ...current, activeThemeId: current.activeThemeId === custom.id ? custom.parentId : current.activeThemeId, customThemes: current.customThemes.filter(item => item.id !== custom.id) }));
  }
  async function save() {
    if (lock.current || !validateColors()) return;
    if (editing && !editing.name.trim()) {
      dialog.current?.querySelector<HTMLInputElement>('[data-theme-name]')?.focus();
      setError('نام تم را وارد کنید.'); return;
    }
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
  const previewTheme = resolveTheme({ ...draft, customThemes: draft.customThemes.map(custom => ({ ...custom, name: custom.name.trim() || 'تم شخصی' })) });
  const palette = previewTheme.palette;
  const presets: ThemeColorPreset[] = [
    { label: 'تأکید', value: appearance?.accent ?? previewTheme.appearance.accent, token: '--theme-accent' },
    { label: 'بوم', value: appearance?.background.color ?? previewTheme.appearance.background.color, token: '--theme-canvas' },
    { label: 'سطح', value: palette.surface, token: '--theme-surface' },
    { label: 'سطح برجسته', value: palette.surfaceRaised, token: '--theme-surface-raised' },
    { label: 'متن', value: palette.text, token: '--theme-text' },
    { label: 'رنگ فرعی', value: palette.muted, token: '--theme-muted' },
    { label: 'هشدار', value: palette.danger, token: '--theme-danger' }
  ];

  return <div className="modal-backdrop theme-settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !confirmClear) cancel(); }}>
    <section ref={dialog} className="settings-dialog theme-settings-dialog" role="dialog" aria-modal={confirmClear ? undefined : true} aria-hidden={confirmClear || undefined} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={busy} tabIndex={-1} dir="rtl">
      <header className="settings-header">
        <div className="dialog-top"><div><span className="eyebrow">شخصی‌سازی روز</span><h2 id={`${id}-title`}>{editing ? 'ویرایش تم شخصی' : 'تنظیمات'}</h2></div><button type="button" className="icon-button" aria-label="بستن تنظیمات و لغو تغییرات تم" disabled={busy} onClick={cancel}><X size={18}/></button></div>
        <div className="settings-header-details">
          <p className="theme-help" id={`${id}-description`}>تغییرات تم را زنده ببینید؛ ذخیره و بستن، همه‌ی تغییرات را ثبت می‌کند. بستن بدون ذخیره، ظاهر ذخیره‌شده را برمی‌گرداند.</p>
          <div className="theme-mode-switch" role="group" aria-label="حالت نمایش">
            <button type="button" disabled={busy} aria-pressed={draft.mode === 'light'} onClick={() => { if (validateColors()) changeDraft(current => switchThemeMode(current, 'light')); }}>روشن</button>
            <button type="button" disabled={busy} aria-pressed={draft.mode === 'dark'} onClick={() => { if (validateColors()) changeDraft(current => switchThemeMode(current, 'dark')); }}>تیره</button>
          </div>
        </div>
      </header>
      <div className="settings-scroll">
      <fieldset className="theme-settings-fields" disabled={busy}>
        {!editing && <div className="setting-row"><span className="setting-icon"><CalendarDays size={17}/></span><div className="setting-copy"><strong>تقویم نمایش</strong><small>تغییر تقویم بلافاصله ذخیره می‌شود.</small></div><CalendarSwitch value={calendar} onChange={value => { void run(async () => { await onCalendarChange(value); }); }}/></div>}
        <section className="theme-settings-section" aria-labelledby={`${id}-themes`}>
          <h3 id={`${id}-themes`}><Palette size={17}/>تم و ظاهر</h3>
          {!editing && <>
            <div className="theme-choices" role="group" aria-label="تم‌های پایه">
              {parentThemes.map(item => <button type="button" key={item.id} className="theme-choice" aria-pressed={draft.activeThemeId === item.id} onClick={() => changeDraft(current => ({ ...current, activeThemeId: item.id }))}><strong>{item.name}</strong><small>{item.description}</small></button>)}
            </div>
            {draft.customThemes.length > 0 && <div className="theme-choices" role="group" aria-label="تم‌های شخصی">
              {draft.customThemes.map(custom => <button type="button" key={custom.id} className="theme-choice" aria-pressed={draft.activeThemeId === custom.id} onClick={() => changeDraft(current => ({ ...current, activeThemeId: custom.id }))}><strong>{custom.name}</strong><small>بر پایه‌ی {parentThemes.find(item => item.id === custom.parentId)?.name}</small></button>)}
            </div>}
            <div className="theme-tools"><button className="button secondary" type="button" data-theme-create onClick={() => startEditor()}><Plus size={15}/>ساخت تم شخصی</button>{selected && <><button type="button" className="button secondary" data-theme-edit onClick={() => startEditor(selected)}>ویرایش تم</button><button type="button" className="button theme-danger" onClick={() => deleteCustom(selected)}><Trash2 size={15}/>حذف تم</button></>}</div>
          </>}
          {editing && appearance && <div className="theme-editor">
            <div className="theme-editor-form">
              <fieldset className="theme-editor-group">
                <legend>نام و تم پایه</legend>
                <div className="theme-controls-grid">
                  <label className="theme-field">نام تم<input data-theme-name required maxLength={60} value={editing.name} onChange={event => { const name = event.target.value; updateCustom(custom => ({ ...custom, name })); }}/></label>
                  <div className="theme-field" role="group" aria-labelledby={`${id}-parent`}><span id={`${id}-parent`}>تم پایه</span><SelectField aria-labelledby={`${id}-parent`} value={editing.parentId} onValueChange={value => {
                    const parentId = value as ParentThemeId;
                    updateCustom(custom => ({ ...custom, parentId, modes: {
                      light: normalizeThemeAppearance(custom.modes.light, parentId, 'light'),
                      dark: normalizeThemeAppearance(custom.modes.dark, parentId, 'dark')
                    } }));
                  }}>{parentThemes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField></div>
                </div>
                <label className="theme-mode-link"><input type="checkbox" checked={editing.linkModes !== false} onChange={event => {
                  const linked = event.target.checked;
                  if (validateColors()) updateCustom((custom, current) => setCustomModeLink(custom, current.mode, linked));
                }}/><span>تنظیمات مشترک روشن و تیره</span></label>
                <p className="theme-control-help" aria-live="polite">{editing.linkModes !== false ? 'تغییرات رنگ، حرکت و افکت در هر دو حالت اعمال می‌شود. فعال‌کردن اشتراک، ظاهر حالت فعلی را به هر دو حالت کپی می‌کند.' : `در حال ویرایش فقط حالت ${draft.mode === 'light' ? 'روشن' : 'تیره'}؛ ظاهر حالت دیگر جداگانه نگهداری می‌شود.`}</p>
              </fieldset>
              <fieldset className="theme-editor-group">
                <legend>{editing.linkModes !== false ? 'رنگ و پس‌زمینه' : `رنگ و پس‌زمینه — ${draft.mode === 'light' ? 'روشن' : 'تیره'}`}</legend>
                <div className="theme-controls-grid">
                  <div className="theme-field" role="group" aria-labelledby={`${id}-background`}><span id={`${id}-background`}>پس‌زمینه</span><SelectField aria-labelledby={`${id}-background`} value={appearance.background.kind} onValueChange={value => {
                    if (validateColors()) updateAppearance(current => ({ background: { ...current.background, kind: value === 'gradient' ? 'gradient' : 'solid' } }));
                  }}><option value="solid">تک‌رنگ</option><option value="gradient">گرادیان</option></SelectField></div>
                  <div className="theme-field theme-angle-field"><label htmlFor={`${id}-angle`}>زاویه‌ی گرادیان <output htmlFor={`${id}-angle`} dir="ltr">{appearance.background.angle}°</output></label><input id={`${id}-angle`} className="theme-range theme-angle-range" type="range" min={0} max={360} step={1} disabled={appearance.background.kind !== 'gradient'} value={appearance.background.angle} aria-valuetext={`${appearance.background.angle} درجه`} dir="ltr" onChange={event => { const angle = Number(event.target.value); updateAppearance(current => ({ background: { ...current.background, angle } })); }}/></div>
                </div>
                <div className="theme-color-fields">
                  <ThemeColorField key={`${editorId}-${draft.mode}-background`} label="رنگ پس‌زمینه" value={appearance.background.color} presets={presets} disabled={busy} expanded={expandedColor === 'background'} onExpandedChange={open => setExpandedColor(open ? 'background' : null)} onChange={color => updateAppearance(current => ({ background: { ...current.background, color } }))}/>
                  <ThemeColorField key={`${editorId}-${draft.mode}-end`} label="رنگ دوم" value={appearance.background.endColor} presets={presets} disabled={busy || appearance.background.kind !== 'gradient'} expanded={appearance.background.kind === 'gradient' && expandedColor === 'end'} onExpandedChange={open => setExpandedColor(open ? 'end' : null)} onChange={endColor => updateAppearance(current => ({ background: { ...current.background, endColor } }))}/>
                  <ThemeColorField key={`${editorId}-${draft.mode}-accent`} label="رنگ تأکید" value={appearance.accent} presets={presets} disabled={busy} expanded={expandedColor === 'accent'} onExpandedChange={open => setExpandedColor(open ? 'accent' : null)} onChange={accent => updateAppearance({ accent })}/>
                </div>
              </fieldset>
              <fieldset className="theme-editor-group">
                <legend>{editing.linkModes !== false ? 'حرکت و افکت' : `حرکت و افکت — ${draft.mode === 'light' ? 'روشن' : 'تیره'}`}</legend>
                <div className="theme-controls-grid">
                  <div className="theme-field" role="group" aria-labelledby={`${id}-motion`} aria-describedby={mini ? `${id}-mini` : undefined}><span id={`${id}-motion`}>حرکت</span><SelectField disabled={mini} aria-labelledby={`${id}-motion`} value={mini ? 'none' : appearance.animation} onValueChange={value => updateAppearance({ animation: value as ThemeAnimation })}>{themeAnimations.map(value => <option key={value} value={value}>{animationLabels[value]}</option>)}</SelectField><p className="theme-control-help">{animationDescriptions[appearance.animation]}</p></div>
                  <div className="theme-field" role="group" aria-labelledby={`${id}-effect`} aria-describedby={mini ? `${id}-mini` : undefined}><span id={`${id}-effect`}>افکت</span><SelectField disabled={mini} aria-labelledby={`${id}-effect`} value={mini ? 'none' : appearance.effect} onValueChange={value => updateAppearance({ effect: value as ThemeEffect })}>{themeEffects.map(value => <option key={value} value={value}>{effectLabels[value]}</option>)}</SelectField><p className="theme-control-help">{effectDescriptions[appearance.effect]}</p></div>
                </div>
                {mini && <p id={`${id}-mini`} className="theme-help">مینی همیشه بدون حرکت و افکت است؛ این محدودیت برای تم‌های شخصی هم اعمال می‌شود.</p>}
              </fieldset>
            </div>
            <aside className="theme-preview-sidebar" aria-labelledby={`${id}-preview`}>
              <h4 id={`${id}-preview`}>پیش‌نمایش زنده — {draft.mode === 'light' ? 'روشن' : 'تیره'}</h4>
              <section className="theme-material-preview" aria-label="پیش‌نمایش زنده‌ی سطح و حرکت">
                <div className="theme-preview-orb" aria-hidden="true"/>
                <div className="theme-preview-card">
                  <strong>روز تازه، برنامه‌ی تازه</strong>
                  <p>یک کار کوچک برای امروز؛ رنگ و سطح این کارت با تم شما تغییر می‌کند.</p>
                  <button type="button" className="button theme-preview-action">شروع امروز</button>
                </div>
              </section>
              <p className="theme-help">برای دیدن پاسخ حرکت، روی دکمه‌ی نمونه اشاره کنید یا با صفحه‌کلید به آن بروید. کاهش حرکتِ سیستم رعایت می‌شود. افکت‌های شفاف در مرورگرهای بدون پشتیبانی، یکدست نمایش داده می‌شوند.</p>
            </aside>
          </div>}
        </section>
        {!editing && <section className="theme-settings-section theme-storage-section"><div className="setting-row"><span className="setting-icon"><HardDrive size={17}/></span><div className="setting-copy"><strong>حافظه‌ی محلی</strong><small>اطلاعات فقط در همین مرورگر و دستگاه نگهداری می‌شود.</small></div></div><p className="theme-help">پاک‌کردن حافظه، همه‌ی هدف‌ها، کارها، بازه‌ها، یادداشت‌ها، تنظیمات و تم‌های شخصی را برای همیشه حذف می‌کند.</p><button type="button" className="button theme-danger" onClick={() => { setError(''); setConfirmClear(true); }}><Trash2 size={15}/>پاک‌کردن تمام حافظه</button></section>}
      </fieldset>
      </div>
      <footer className="settings-footer">
        {error && !confirmClear && <p className="theme-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" className="button primary" disabled={busy} onClick={() => { void save(); }}>{busy ? 'در حال انجام…' : 'ذخیره‌ی تم و بستن'}</button><button type="button" className="button secondary" disabled={busy} onClick={editing ? cancelEditor : cancel}>{editing ? 'لغو ویرایش و بازگشت به تم‌ها' : 'بستن بدون ذخیره'}</button></div>
      </footer>
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
