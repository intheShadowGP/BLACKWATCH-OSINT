import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAddToInvestigation } from './investigation';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';
import type { EntityType } from '@/types';
import { nowIso } from '@/utils/common';
import { safeUrl } from '@/utils/validation';

/**
 * Manual outcome recording for sources that cannot be automated from a
 * browser: the analyst opens the official page, then records what they saw.
 */
export function ManualRecordButton({ sourceId, sourceName, defaultUrl, defaultType = 'account', defaultValue }: { sourceId: string; sourceName: string; defaultUrl?: string; defaultType?: EntityType; defaultValue?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { addValue, activeId } = useAddToInvestigation();
  const [outcome, setOutcome] = useState<'found' | 'not-found' | 'unclear'>('found');
  const [url, setUrl] = useState(defaultUrl ?? '');
  const [value, setValue] = useState(defaultValue ?? defaultUrl ?? '');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setUrl(defaultUrl ?? '');
      setValue(defaultValue ?? defaultUrl ?? '');
      setNotes('');
      setOutcome('found');
      setErr(null);
    }
  }, [open, defaultUrl, defaultValue]);

  const save = async () => {
    if (url && !safeUrl(url)) return setErr(t('error.invalidUrl'));
    if (outcome !== 'found') {
      // Negative / unclear outcomes are kept as a note on the investigation activity via an "other" entity would be misleading: record as note text instead.
      const e = await addValue('other', `${sourceName}: ${outcome === 'not-found' ? t('manual.notFound') : t('manual.unclear')} — ${value || url}`, { sourceId, sourceName, url: safeUrl(url) ?? undefined, collectedAt: nowIso(), note: 'manual check' }, { notes, label: t('manual.checkLabel') });
      if (e) setOpen(false);
      return;
    }
    if (!value.trim()) return setErr(t('error.required'));
    const e = await addValue(defaultType, value.trim(), { sourceId, sourceName, url: safeUrl(url) ?? undefined, collectedAt: nowIso(), note: 'manually observed by analyst' }, { notes, label: `${sourceName} (manual)` });
    if (e) setOpen(false);
  };

  return (
    <>
      <Button size="sm" variant="ghost" icon={<ClipboardCheck className="size-3.5" />} disabled={!activeId} title={activeId ? undefined : t('inv.noneActive')} onClick={() => setOpen(true)}>
        {t('manual.record')}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${t('manual.record')} — ${sourceName}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={save}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-bw-muted">{t('manual.help')}</p>
          <Field label={t('manual.outcome')}>
            {(id) => (
              <Select id={id} value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
                <option value="found">{t('manual.found')}</option>
                <option value="not-found">{t('manual.notFound')}</option>
                <option value="unclear">{t('manual.unclear')}</option>
              </Select>
            )}
          </Field>
          <Field label={t('entity.value')} error={err}>
            {(id) => <Input id={id} value={value} onChange={(e) => setValue(e.target.value)} />}
          </Field>
          <Field label={t('entity.sourceUrl')}>{(id) => <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} />}</Field>
          <Field label={t('common.notes')}>{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        </div>
      </Modal>
    </>
  );
}
