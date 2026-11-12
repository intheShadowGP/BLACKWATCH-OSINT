import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Combine, Lightbulb, Loader2, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp } from '@/app/context';
import { db } from '@/services/storage/db';
import { addRelation, getSetting, mergeEntities, setSetting } from '@/services/storage/repository';
import { runCorrelation } from '@/workers/client';
import type { Suggestion } from '@/services/correlation/engine';
import type { Entity } from '@/types';
import { nowIso } from '@/utils/common';
import { Badge, Button, EmptyState } from './ui';

const LEAD_TARGET: Record<string, string> = {
  'lead-username': '/username',
  'lead-domain': '/domain',
  'lead-ip': '/domain',
  'lead-email': '/email',
  'lead-email-local-pivot': '/username',
};

export function SuggestionsPanel({ investigationId }: { investigationId: string }) {
  const { t, td } = useI18n();
  const { toast, reportError } = useApp();
  const data = useLiveQuery(async () => {
    const [entities, relations, results, events] = await Promise.all([
      db.entities.where('investigationId').equals(investigationId).toArray(),
      db.relations.where('investigationId').equals(investigationId).toArray(),
      db.results.where('investigationId').equals(investigationId).toArray(),
      db.events.where('investigationId').equals(investigationId).toArray(),
    ]);
    return { entities, relations, results, events };
  }, [investigationId]);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getSetting<string[]>(`dismissed:${investigationId}`, []).then((d) => setDismissed(new Set(d)));
  }, [investigationId]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setBusy(true);
    runCorrelation({
      entities: data.entities,
      relations: data.relations,
      results: data.results.map(({ sourceId, query, queryType, type, kind, value }) => ({ sourceId, query, queryType, type, kind, value })),
      events: data.events.map(({ id, title, datetime }) => ({ id, title, datetime })),
    })
      .then((s) => !cancelled && setSuggestions(s))
      .catch(reportError)
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [data, reportError]);

  const byId = useMemo(() => new Map((data?.entities ?? []).map((e) => [e.id, e])), [data]);
  const visible = (suggestions ?? []).filter((s) => !dismissed.has(s.key));

  const dismiss = async (key: string) => {
    const next = new Set(dismissed).add(key);
    setDismissed(next);
    await setSetting(`dismissed:${investigationId}`, [...next].slice(-2000));
  };

  const accept = async (s: Suggestion) => {
    try {
      if (s.kind === 'relation' && s.fromId && s.toId) {
        await addRelation({
          investigationId,
          from: s.fromId,
          to: s.toId,
          label: td(`corrLabel.${s.label}`).startsWith('corrLabel.') ? s.label : td(`corrLabel.${s.label}`),
          // Accepted suggestions stay "correlation" until the analyst verifies them.
          verification: 'correlation',
          confidence: s.strength === 'exact' ? 'medium' : 'low',
          fromSuggestion: true,
          notes: td(`corr.${s.reason}`, s.params),
          source: { sourceId: 'local-analysis', sourceName: 'Correlation engine', collectedAt: nowIso(), note: s.reason },
        });
        toast(t('corr.accepted'));
      } else if (s.kind === 'duplicate' && s.fromId && s.toId) {
        await mergeEntities(s.fromId, s.toId);
        toast(t('corr.merged'));
      }
      await dismiss(s.key);
    } catch (e) {
      reportError(e);
    }
  };

  if (!suggestions && busy)
    return (
      <div className="flex items-center gap-2 text-sm text-bw-muted">
        <Loader2 className="size-4 animate-spin" /> {t('corr.running')}
      </div>
    );
  if (!visible.length) return <EmptyState icon={<Lightbulb className="size-7" />} title={t('corr.none')}>{t('corr.noneHint')}</EmptyState>;

  const groups: Array<Suggestion['kind']> = ['relation', 'duplicate', 'inconsistency', 'lead'];
  return (
    <div className="space-y-4">
      <p className="text-xs text-bw-muted">{t('corr.disclaimer')}</p>
      {groups.map((g) => {
        const items = visible.filter((s) => s.kind === g);
        if (!items.length) return null;
        return (
          <div key={g}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-bw-gold">
              {td(`corr.kind.${g}`)} ({items.length})
            </h3>
            <ul className="space-y-1.5">
              {items.slice(0, 100).map((s) => (
                <li key={s.key} className="flex flex-wrap items-center gap-2 rounded-md border border-bw-border bg-bw-panel2 px-3 py-2 text-sm">
                  <Badge tone={s.strength === 'exact' ? 'gold' : 'neutral'}>{td(`corr.strength.${s.strength}`)}</Badge>
                  <span className="min-w-0 flex-1">{td(`corr.${s.reason}`, s.params)}</span>
                  {(s.kind === 'relation' || s.kind === 'duplicate') && (
                    <EntityPair a={s.fromId ? byId.get(s.fromId) : undefined} b={s.toId ? byId.get(s.toId) : undefined} />
                  )}
                  <span className="flex gap-1">
                    {s.kind === 'relation' && (
                      <Button size="sm" variant="gold" icon={<Check className="size-3.5" />} onClick={() => accept(s)}>
                        {t('corr.accept')}
                      </Button>
                    )}
                    {s.kind === 'duplicate' && (
                      <Button size="sm" variant="gold" icon={<Combine className="size-3.5" />} onClick={() => accept(s)}>
                        {t('corr.merge')}
                      </Button>
                    )}
                    {s.kind === 'lead' && LEAD_TARGET[s.reason] && (
                      <Link to={`${LEAD_TARGET[s.reason]}?q=${encodeURIComponent(s.params.value)}`} className="rounded border border-bw-gold/40 px-2 py-1 text-xs text-bw-gold hover:bg-bw-gold/10">
                        {t('corr.investigate')}
                      </Link>
                    )}
                    <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => dismiss(s.key)}>
                      {t('corr.dismiss')}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function EntityPair({ a, b }: { a?: Entity; b?: Entity }) {
  if (!a || !b) return null;
  return (
    <span className="hidden max-w-xs truncate font-mono text-xs text-bw-muted lg:inline">
      {a.value} ↔ {b.value}
    </span>
  );
}
