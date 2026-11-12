import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { db, StorageError } from '@/services/storage/db';
import { settingsStore } from '@/services/privacy/store';
import { engine } from '@/services/automation/engine';
import { Button, Modal, cx } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { Investigation } from '@/types';
import { uid } from '@/utils/common';

/* ---------------------------------- Toasts ---------------------------------- */

type ToastTone = 'ok' | 'error' | 'info';
interface Toast {
  id: string;
  tone: ToastTone;
  text: string;
}

interface AppCtx {
  toast: (text: string, tone?: ToastTone) => void;
  reportError: (e: unknown) => void;
  confirm: (opts: { title: string; message: string; danger?: boolean; confirmLabel?: string }) => Promise<boolean>;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  active: Investigation | undefined;
  /** Investigation that may receive REAL collected data (never a demo one). */
  attachId: string | null;
  investigations: Investigation[];
}

const Ctx = createContext<AppCtx | null>(null);

const ACTIVE_KEY = 'bw.activeInvestigation';

export function AppProvider({ children }: { children: ReactNode }) {
  const { t, td } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<null | { title: string; message: string; danger?: boolean; confirmLabel?: string; resolve: (v: boolean) => void }>(null);
  const [activeId, setActiveIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  });
  const investigations = useLiveQuery(() => db.investigations.orderBy('updatedAt').reverse().toArray(), [], []) ?? [];
  const active = investigations.find((i) => i.id === activeId);

  useEffect(() => {
    // Active investigation deleted elsewhere → clear selection.
    if (activeId && investigations.length && !investigations.some((i) => i.id === activeId)) setActiveIdState(null);
  }, [activeId, investigations]);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const toast = useCallback((text: string, tone: ToastTone = 'ok') => {
    const id = uid();
    setToasts((ts) => [...ts.slice(-4), { id, tone, text }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);

  const reportError = useCallback(
    (e: unknown) => {
      // Never surface stack traces; map known errors to readable messages.
      let msg: string;
      if (e instanceof StorageError) msg = td(`error.${e.message}`);
      else if (e instanceof Error) msg = td(`error.${e.message.split(':')[0]}`) !== `error.${e.message.split(':')[0]}` ? td(`error.${e.message.split(':')[0]}`) : `${t('error.generic')}: ${e.message.slice(0, 200)}`;
      else msg = t('error.generic');
      toast(msg, 'error');
      console.error(e);
    },
    [t, td, toast],
  );

  const confirm = useCallback<AppCtx['confirm']>((opts) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })), []);

  const value = useMemo(
    () => ({ toast, reportError, confirm, activeId: active ? activeId : null, setActiveId, active, attachId: active && !active.isDemo ? active.id : null, investigations }),
    [toast, reportError, confirm, activeId, setActiveId, active, investigations],
  );

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[2000] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((tt) => (
          <div
            key={tt.id}
            role={tt.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex items-start gap-2 rounded-lg border bg-bw-panel2 px-3 py-2.5 text-sm shadow-xl',
              tt.tone === 'ok' && 'border-bw-ok/40',
              tt.tone === 'error' && 'border-bw-red-bright/60',
              tt.tone === 'info' && 'border-bw-gold/40',
            )}
          >
            {tt.tone === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-bw-ok" /> : tt.tone === 'error' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bw-red-bright" /> : <Info className="mt-0.5 size-4 shrink-0 text-bw-gold" />}
            <span className="flex-1 break-words">{tt.text}</span>
            <button type="button" aria-label={t('common.close')} onClick={() => setToasts((ts) => ts.filter((x) => x.id !== tt.id))} className="text-bw-muted hover:text-bw-text">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Modal
        open={!!confirmState}
        onClose={() => close(false)}
        title={confirmState?.title ?? ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant={confirmState?.danger ? 'primary' : 'gold'} onClick={() => close(true)}>
              {confirmState?.confirmLabel ?? t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="whitespace-pre-line text-sm text-bw-muted">{confirmState?.message}</p>
      </Modal>
    </Ctx.Provider>
  );
}

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

/** Re-renders when privacy settings / limits change. */
export function useSettings() {
  useSyncExternalStore(settingsStore.subscribe, settingsStore.getVersion);
  return settingsStore;
}

/** Re-renders when the automation engine state changes. */
export function useEngine() {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  return engine;
}
