import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, FileText } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp } from '@/app/context';
import { collectReportData, renderCsv, renderHtml, renderJson, renderMarkdown, renderPdf, type ReportFormat, type ReportOptions } from '@/services/export/report';
import { logActivity } from '@/services/storage/repository';
import { downloadBlob } from '@/utils/common';
import { Button, Card, Checkbox, EmptyState, Field, HelpBox, Modal, PageHeader, Select, Textarea } from '@/components/ui';

const FORMATS: Array<{ id: ReportFormat; label: string }> = [
  { id: 'pdf', label: 'PDF' },
  { id: 'html', label: 'HTML' },
  { id: 'md', label: 'Markdown' },
  { id: 'json', label: 'JSON' },
  { id: 'csv', label: 'CSV' },
];

export default function ReportsPage() {
  const { t, td, lang } = useI18n();
  const [params] = useSearchParams();
  const { activeId, investigations, reportError, toast } = useApp();
  const [invId, setInvId] = useState(params.get('inv') ?? activeId ?? '');
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [opts, setOpts] = useState<ReportOptions>({
    summary: '',
    methodology: '',
    limitations: '',
    overallConfidence: 'medium',
    include: { entities: true, relations: true, timeline: true, results: false, evidence: true, notes: true, sources: true },
    onlyCorroborated: false,
    lang,
  });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!invId && activeId) setInvId(activeId);
  }, [activeId, invId]);
  useEffect(() => {
    setOpts((o) => ({ ...o, lang, methodology: o.methodology || t('report.defaultMethodology'), limitations: o.limitations || t('report.defaultLimitations') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inv = investigations.find((i) => i.id === invId);

  const generate = async (previewOnly = false) => {
    if (!invId) return;
    setBusy(true);
    try {
      const data = await collectReportData(invId, opts);
      const base = `${inv?.name ?? 'report'}-report-${new Date().toISOString().slice(0, 10)}`;
      if (previewOnly) {
        setPreview(renderHtml(data));
        return;
      }
      switch (format) {
        case 'pdf':
          downloadBlob(await renderPdf(data), `${base}.pdf`);
          break;
        case 'html':
          downloadBlob(new Blob([renderHtml(data)], { type: 'text/html' }), `${base}.html`);
          break;
        case 'md':
          downloadBlob(new Blob([renderMarkdown(data)], { type: 'text/markdown' }), `${base}.md`);
          break;
        case 'json':
          downloadBlob(new Blob([renderJson(data)], { type: 'application/json' }), `${base}.json`);
          break;
        case 'csv':
          downloadBlob(new Blob([renderCsv(data)], { type: 'text/csv' }), `${base}.csv`);
          break;
      }
      await logActivity('report.generated', format.toUpperCase(), invId);
      toast(t('report.done'));
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  const inc = (k: keyof ReportOptions['include']) => (v: boolean) => setOpts({ ...opts, include: { ...opts.include, [k]: v } });

  return (
    <div>
      <PageHeader icon={<FileText className="size-5" />} title={t('nav.reports')} description={t('desc.reports')} />
      <HelpBox storageKey="reports">
        <p>{t('help.reports')}</p>
      </HelpBox>
      {!investigations.length ? (
        <EmptyState title={t('inv.empty')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title={t('report.content')} className="lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('inv.select')}>
                {(id) => (
                  <Select id={id} value={invId} onChange={(e) => setInvId(e.target.value)}>
                    <option value="">{t('inv.select')}</option>
                    {investigations.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.isDemo ? '[DEMO] ' : ''}
                        {i.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('report.overallConfidence')}>
                {(id) => (
                  <Select id={id} value={opts.overallConfidence} onChange={(e) => setOpts({ ...opts, overallConfidence: e.target.value as ReportOptions['overallConfidence'] })}>
                    {(['high', 'medium', 'low', 'unknown'] as const).map((c) => (
                      <option key={c} value={c}>
                        {td(`conf.${c}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="sm:col-span-2">
                <Field label={t('report.summary')} hint={t('report.summaryHint')}>
                  {(id) => <Textarea id={id} value={opts.summary} onChange={(e) => setOpts({ ...opts, summary: e.target.value })} />}
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label={t('report.methodology')}>{(id) => <Textarea id={id} value={opts.methodology} onChange={(e) => setOpts({ ...opts, methodology: e.target.value })} />}</Field>
              </div>
              <div className="sm:col-span-2">
                <Field label={t('report.limitations')}>{(id) => <Textarea id={id} value={opts.limitations} onChange={(e) => setOpts({ ...opts, limitations: e.target.value })} />}</Field>
              </div>
            </div>
          </Card>
          <Card title={t('report.options')}>
            <div className="space-y-2">
              {(['sources', 'entities', 'relations', 'timeline', 'results', 'evidence', 'notes'] as const).map((k) => (
                <div key={k}>
                  <Checkbox checked={opts.include[k]} onChange={inc(k)} label={td(`report.section.${k}`)} />
                </div>
              ))}
              <div className="border-t border-bw-border pt-2">
                <Checkbox checked={opts.onlyCorroborated} onChange={(v) => setOpts({ ...opts, onlyCorroborated: v })} label={t('report.onlyCorroborated')} />
              </div>
              <Field label={t('settings.language')}>
                {(id) => (
                  <Select id={id} value={opts.lang} onChange={(e) => setOpts({ ...opts, lang: e.target.value as 'fr' | 'en' })}>
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </Select>
                )}
              </Field>
              <Field label={t('report.format')}>
                {(id) => (
                  <Select id={id} value={format} onChange={(e) => setFormat(e.target.value as ReportFormat)}>
                    {FORMATS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="primary" loading={busy} disabled={!invId} onClick={() => generate(false)}>
                  {t('report.generate')}
                </Button>
                <Button icon={<Eye className="size-4" />} disabled={!invId || busy} onClick={() => generate(true)}>
                  {t('report.preview')}
                </Button>
              </div>
              <p className="text-xs text-bw-muted">{t('report.localNote')}</p>
            </div>
          </Card>
        </div>
      )}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={t('report.preview')} wide>
        {/* Sandboxed iframe with no script permission; content is fully escaped. */}
        {preview && <iframe title={t('report.preview')} sandbox="" srcDoc={preview} className="h-[70vh] w-full rounded border border-bw-border bg-white" />}
      </Modal>
    </div>
  );
}
