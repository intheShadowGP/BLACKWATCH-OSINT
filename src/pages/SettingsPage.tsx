import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, HardDrive, Lock, Rocket, Settings as SettingsIcon, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useI18n, useL10n } from '@/i18n';
import { useApp, useSettings } from '@/app/context';
import { SOURCES, type SourceMode } from '@/services/sources/catalog';
import { db } from '@/services/storage/db';
import { wipeAllData } from '@/services/storage/repository';
import { engine } from '@/services/automation/engine';
import { resetRateLimits } from '@/services/adapters/http';
import { hasDemo, loadDemo, removeDemo } from '@/services/storage/demo';
import { formatDateTime } from '@/utils/common';
import { Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, SafeLink, Select } from '@/components/ui';
import { EncryptedExportModal, exportBackupFile, ImportBackupModal } from '@/modules/investigation-manager/backupUi';

export default function SettingsPage() {
  const { t, td, lang, setLang, locale } = useI18n();
  const l = useL10n();
  const s = useSettings();
  const { toast, reportError, confirm, setActiveId } = useApp();
  const navigate = useNavigate();
  const [encOpen, setEncOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState('');
  const demo = useLiveQuery(() => hasDemo(), [], false);
  const lastBySource = useLiveQuery(async () => {
    const m = new Map<string, { at: string; status: string }>();
    for (const r of await db.requestLog.orderBy('at').reverse().limit(500).toArray()) if (!m.has(r.sourceId)) m.set(r.sourceId, { at: r.at, status: String(r.status) });
    return m;
  }, []);

  const wipeWord = lang === 'fr' ? 'SUPPRIMER' : 'DELETE';

  return (
    <div>
      <PageHeader icon={<SettingsIcon className="size-5" />} title={t('nav.settings')} description={t('desc.settings')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('settings.general')}>
          <div className="space-y-3">
            <Field label={t('settings.language')}>
              {(id) => (
                <Select id={id} value={lang} onChange={(e) => setLang(e.target.value as 'fr' | 'en')}>
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </Select>
              )}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('settings.concurrency')} hint={t('settings.concurrencyHint')}>
                {(id) => <Input id={id} type="number" min={1} max={8} value={s.limits.concurrency} onChange={(e) => void s.setLimits({ concurrency: Number(e.target.value) })} />}
              </Field>
              <Field label={t('settings.timeout')}>{(id) => <Input id={id} type="number" min={3} max={60} value={Math.round(s.limits.timeoutMs / 1000)} onChange={(e) => void s.setLimits({ timeoutMs: Number(e.target.value) * 1000 })} />}</Field>
              <Field label={t('settings.maxFile')}>{(id) => <Input id={id} type="number" min={1} max={500} value={s.limits.maxFileSizeMb} onChange={(e) => void s.setLimits({ maxFileSizeMb: Number(e.target.value) })} />}</Field>
              <Field label={t('settings.maxResults')}>{(id) => <Input id={id} type="number" min={10} max={2000} value={s.limits.maxResultsPerSource} onChange={(e) => void s.setLimits({ maxResultsPerSource: Number(e.target.value) })} />}</Field>
            </div>
          </div>
        </Card>

        <Card title={t('settings.data')} subtitle={t('settings.dataHint')}>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download className="size-4" />} onClick={() => exportBackupFile({}, t).then(() => toast(t('backup.exported'))).catch(reportError)}>
              {t('backup.exportAll')}
            </Button>
            <Button icon={<Lock className="size-4" />} onClick={() => setEncOpen(true)}>
              {t('backup.encrypted')}
            </Button>
            <Button icon={<Upload className="size-4" />} onClick={() => setImportOpen(true)}>
              {t('backup.import')}
            </Button>
            <Button
              icon={<HardDrive className="size-4" />}
              onClick={async () => {
                try {
                  const ok = await navigator.storage?.persist?.();
                  toast(ok ? t('settings.persistOk') : t('settings.persistNo'), ok ? 'ok' : 'info');
                } catch {
                  toast(t('settings.persistNo'), 'info');
                }
              }}
            >
              {t('settings.persist')}
            </Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => { setWipeText(''); setWipeOpen(true); }}>
              {t('settings.wipe')}
            </Button>
          </div>
          <p className="mt-3 text-xs text-bw-muted">{t('settings.encryptionNote')}</p>
          <div className="mt-4 border-t border-bw-border pt-3">
            <h3 className="mb-2 text-sm font-medium">{t('demo.title')}</h3>
            <p className="mb-2 text-xs text-bw-muted">{t('demo.help')}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="gold"
                icon={<Rocket className="size-3.5" />}
                onClick={async () => {
                  try {
                    const id = await loadDemo();
                    setActiveId(id);
                    toast(t('demo.loaded'));
                    navigate(`/investigations/${id}`);
                  } catch (e) {
                    reportError(e);
                  }
                }}
              >
                {demo ? t('demo.reset') : t('demo.load')}
              </Button>
              {demo && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (await confirm({ title: t('demo.remove'), message: t('demo.removeConfirm'), danger: true })) {
                      await removeDemo();
                      toast(t('demo.removed'));
                    }
                  }}
                >
                  {t('demo.remove')}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-4" title={t('privacy.title')} subtitle={t('privacy.subtitle')}>
        <div className="mb-4 space-y-2 rounded-md border border-bw-gold/25 bg-bw-gold/[0.04] p-3 text-sm text-bw-muted">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-bw-gold" /> {t('privacy.explainer1')}
          </p>
          <p>{t('privacy.explainer2')}</p>
          <p>{t('privacy.explainer3')}</p>
        </div>
        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox checked={s.privacy.externalEnabled} onChange={(v) => void s.setPrivacy({ externalEnabled: v })} label={<b>{t('privacy.master')}</b>} />
          <Checkbox checked={s.privacy.confirmBeforeRun} onChange={(v) => void s.setPrivacy({ confirmBeforeRun: v })} label={t('privacy.confirm')} />
          <Checkbox checked={s.privacy.mapTiles} onChange={(v) => void s.setPrivacy({ mapTiles: v })} label={t('privacy.tiles')} />
          <Link to="/automation" className="text-sm text-bw-gold hover:underline">
            {t('privacy.viewLog')}
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="text-left uppercase tracking-wider text-bw-muted">
              <tr>
                <th className="py-2 pr-2">{t('sources.provider')}</th>
                <th className="py-2 pr-2">{t('sources.sent')}</th>
                <th className="py-2 pr-2">{t('sources.purpose')}</th>
                <th className="py-2 pr-2">{t('sources.quota')}</th>
                <th className="py-2 pr-2">{t('sources.connection')}</th>
                <th className="py-2 pr-2">{t('privacy.mode')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bw-border">
              {SOURCES.filter((x) => x.access === 'api').map((x) => {
                const last = lastBySource?.get(x.id);
                return (
                  <tr key={x.id} className="align-top">
                    <td className="py-2 pr-2">
                      <div className="font-medium text-bw-text">{x.name}</div>
                      <div className="flex gap-2">
                        <SafeLink href={x.homepage}>{x.hosts[0] ?? 'site'}</SafeLink>
                        {x.privacyUrl && <SafeLink href={x.privacyUrl}>{t('sources.privacy')}</SafeLink>}
                      </div>
                    </td>
                    <td className="max-w-56 py-2 pr-2 text-bw-muted">{l(x.sentData)}</td>
                    <td className="max-w-48 py-2 pr-2 text-bw-muted">{l(x.purpose)}</td>
                    <td className="max-w-48 py-2 pr-2 text-bw-muted">{l(x.quota)}</td>
                    <td className="py-2 pr-2">{last ? <span title={formatDateTime(last.at, locale)}><Badge tone={/^[23]\d\d$/.test(last.status) || last.status === '404' ? 'ok' : 'warn'}>{last.status}</Badge></span> : <span className="text-bw-muted">{t('sources.never')}</span>}</td>
                    <td className="py-2 pr-2">
                      <Select value={s.modeOf(x.id)} aria-label={`${t('privacy.mode')} ${x.name}`} className="w-auto py-1 text-xs" onChange={(e) => void s.setSourceMode(x.id, e.target.value as SourceMode)}>
                        {(['auto', 'manual', 'off'] as const).map((m) => (
                          <option key={m} value={m}>
                            {td(`mode.${m}`)}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-bw-muted">{t('privacy.modesHelp')}</p>
      </Card>

      <Card className="mt-4" title={t('settings.about')}>
        <p className="text-sm text-bw-muted">{t('settings.aboutText')}</p>
      </Card>

      <EncryptedExportModal open={encOpen} onClose={() => setEncOpen(false)} />
      <ImportBackupModal open={importOpen} onClose={() => setImportOpen(false)} />
      <Modal
        open={wipeOpen}
        onClose={() => setWipeOpen(false)}
        title={t('settings.wipe')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setWipeOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={wipeText !== wipeWord}
              onClick={async () => {
                try {
                  engine.reset();
                  resetRateLimits();
                  await wipeAllData();
                  setActiveId(null);
                  try {
                    localStorage.clear();
                  } catch {
                    /* ignore */
                  }
                  await s.load();
                  setWipeOpen(false);
                  toast(t('settings.wiped'));
                  navigate('/');
                } catch (e) {
                  reportError(e);
                }
              }}
            >
              {t('settings.wipeConfirmBtn')}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-bw-muted">{t('settings.wipeBody', { word: wipeWord })}</p>
        <Input value={wipeText} onChange={(e) => setWipeText(e.target.value)} aria-label={t('settings.wipe')} />
      </Modal>
    </div>
  );
}
