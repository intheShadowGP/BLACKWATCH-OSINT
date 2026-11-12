import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/app/context';
import { buildBackup, decryptJson, encryptJson, importBackup, isEncryptedEnvelope, type ImportReport } from '@/services/export/backup';
import { downloadBlob } from '@/utils/common';
import { Button, Checkbox, Field, Input, Modal } from '@/components/ui';

const MAX_IMPORT_BYTES = 512 * 1024 * 1024;

export async function exportBackupFile(opts: { ids?: string[]; includeFiles?: boolean; passphrase?: string }, t: (k: TKey) => string): Promise<void> {
  void t;
  const backup = await buildBackup({ ids: opts.ids, includeFiles: opts.includeFiles ?? true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const base = opts.ids?.length === 1 ? `blackwatch-${backup.investigations[0]?.name ?? 'investigation'}` : 'blackwatch-backup';
  if (opts.passphrase) {
    const enc = await encryptJson(backup, opts.passphrase);
    downloadBlob(new Blob([enc], { type: 'application/json' }), `${base}-${stamp}.bwenc.json`);
  } else {
    downloadBlob(new Blob([JSON.stringify(backup)], { type: 'application/json' }), `${base}-${stamp}.json`);
  }
}

export function EncryptedExportModal({ open, onClose, ids }: { open: boolean; onClose: () => void; ids?: string[] }) {
  const { t } = useI18n();
  const { toast, reportError } = useApp();
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [files, setFiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setPass('');
      setPass2('');
      setErr(null);
    }
  }, [open]);
  const go = async () => {
    if (pass.length < 10) return setErr(t('backup.passTooShort'));
    if (pass !== pass2) return setErr(t('backup.passMismatch'));
    setBusy(true);
    try {
      await exportBackupFile({ ids, includeFiles: files, passphrase: pass }, t);
      toast(t('backup.exported'));
      onClose();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('backup.encryptedTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon={<Lock className="size-4" />} loading={busy} onClick={go}>
            {t('common.export')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-bw-muted">{t('backup.encryptedHelp')}</p>
        <Field label={t('backup.passphrase')} error={err}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />}
        </Field>
        <Field label={t('backup.passphraseConfirm')}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />}</Field>
        <Checkbox checked={files} onChange={setFiles} label={t('backup.includeFiles')} />
      </div>
    </Modal>
  );
}

export function ImportBackupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, td } = useI18n();
  const { toast, reportError } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [needsPass, setNeedsPass] = useState(false);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setFile(null);
      setNeedsPass(false);
      setPass('');
      setReport(null);
      setErr(null);
    }
  }, [open]);

  const go = async () => {
    if (!file) return;
    setErr(null);
    if (file.size > MAX_IMPORT_BYTES) return setErr(t('error.fileTooLarge'));
    setBusy(true);
    try {
      let json: unknown;
      try {
        json = JSON.parse(await file.text());
      } catch {
        throw new Error('invalid-json');
      }
      if (isEncryptedEnvelope(json)) {
        if (!pass) {
          setNeedsPass(true);
          setBusy(false);
          return;
        }
        json = await decryptJson(json as object, pass);
      }
      const r = await importBackup(json);
      setReport(r);
      toast(t('backup.imported'));
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      if (m === 'decryption-failed') setErr(t('error.decryption-failed'));
      else if (m === 'invalid-json') setErr(t('error.invalid-json'));
      else if (m.startsWith('invalid-backup')) setErr(`${t('error.invalid-backup')} ${m.slice(15, 300)}`);
      else reportError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('backup.import')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {report ? t('common.close') : t('common.cancel')}
          </Button>
          {!report && (
            <Button variant="primary" loading={busy} disabled={!file} onClick={go}>
              {t('backup.import')}
            </Button>
          )}
        </>
      }
    >
      {report ? (
        <ul className="space-y-1 text-sm">
          {Object.entries(report).map(([k, v]) => (
            <li key={k}>
              <span className="text-bw-muted">{td(`import.k.${k}`)}</span>: <b>{v}</b>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-bw-muted">{t('backup.importHelp')}</p>
          <input type="file" accept="application/json,.json" aria-label={t('backup.file')} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-bw-elev file:px-3 file:py-1.5 file:text-bw-text" />
          {needsPass && <Field label={t('backup.passphrase')}>{(id) => <Input id={id} type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />}</Field>}
          {err && (
            <p role="alert" className="text-sm text-bw-red-bright">
              {err}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
