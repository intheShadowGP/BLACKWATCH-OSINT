import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { useApp } from '@/app/context';
import { addRelation, updateEntity, updateRelation, upsertEntity } from '@/services/storage/repository';
import { CONFIDENCE_LEVELS, ENTITY_TYPES, VERIFICATION_LEVELS, type Confidence, type Entity, type EntityType, type Relation, type Verification } from '@/types';
import { nowIso } from '@/utils/common';
import { isDomain, isEmail, isIPv4, isIPv6, isUrl, safeUrl } from '@/utils/validation';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';

export function validateEntityValue(type: EntityType, value: string): string | null {
  const v = value.trim();
  if (!v) return 'error.required';
  if (v.length > 2000) return 'error.tooLong';
  if (type === 'email' && !isEmail(v)) return 'error.invalidEmail';
  if (type === 'domain' && !isDomain(v)) return 'error.invalidDomain';
  if (type === 'ip' && !isIPv4(v) && !isIPv6(v)) return 'error.invalidIp';
  if ((type === 'url' || type === 'account') && /^[a-z][a-z0-9+.-]*:/i.test(v) && !isUrl(v)) return 'error.invalidUrl';
  return null;
}

export function EntityModal({ open, onClose, investigationId, entity, presetType }: { open: boolean; onClose: () => void; investigationId: string; entity?: Entity; presetType?: EntityType }) {
  const { t, td } = useI18n();
  const { toast, reportError } = useApp();
  const [type, setType] = useState<EntityType>(entity?.type ?? presetType ?? 'username');
  const [value, setValue] = useState(entity?.value ?? '');
  const [label, setLabel] = useState(entity?.label ?? '');
  const [verification, setVerification] = useState<Verification>(entity?.verification ?? 'unverified');
  const [confidence, setConfidence] = useState<Confidence>(entity?.confidence ?? 'unknown');
  const [notes, setNotes] = useState(entity?.notes ?? '');
  const [sourceUrl, setSourceUrl] = useState('');
  const [lat, setLat] = useState(entity?.lat?.toString() ?? '');
  const [lon, setLon] = useState(entity?.lon?.toString() ?? '');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType(entity?.type ?? presetType ?? 'username');
    setValue(entity?.value ?? '');
    setLabel(entity?.label ?? '');
    setVerification(entity?.verification ?? 'unverified');
    setConfidence(entity?.confidence ?? 'unknown');
    setNotes(entity?.notes ?? '');
    setLat(entity?.lat?.toString() ?? '');
    setLon(entity?.lon?.toString() ?? '');
    setSourceUrl('');
    setErr(null);
  }, [open, entity, presetType]);

  const save = async () => {
    const e = validateEntityValue(type, value);
    if (e) return setErr(td(e));
    if (sourceUrl && !safeUrl(sourceUrl)) return setErr(t('error.invalidUrl'));
    if (verification === 'verified' && !sourceUrl && !(entity?.sources.length)) return setErr(t('entity.verifiedNeedsSource'));
    const la = lat.trim() === '' ? undefined : Number(lat);
    const lo = lon.trim() === '' ? undefined : Number(lon);
    if ((la !== undefined || lo !== undefined) && (la === undefined || lo === undefined || !(la >= -90 && la <= 90) || !(lo >= -180 && lo <= 180))) return setErr(t('error.invalidCoords'));
    try {
      const src = sourceUrl ? { sourceId: 'manual', sourceName: 'Manual', url: safeUrl(sourceUrl)!, collectedAt: nowIso() } : undefined;
      if (entity) {
        await updateEntity(entity.id, { type, value: value.trim(), label, verification, confidence, notes, lat: la, lon: lo, sources: src ? [...entity.sources, src] : entity.sources });
      } else {
        await upsertEntity({ investigationId, type, value, label, verification, confidence, notes, lat: la, lon: lo, source: src ?? { sourceId: 'manual', sourceName: 'Manual', collectedAt: nowIso() } });
      }
      toast(t('common.saved'));
      onClose();
    } catch (x) {
      reportError(x);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entity ? t('entity.edit') : t('entity.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('entity.type')}>
          {(id) => (
            <Select id={id} value={type} onChange={(e) => setType(e.target.value as EntityType)}>
              {ENTITY_TYPES.map((x) => (
                <option key={x} value={x}>
                  {td(`etype.${x}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('entity.label')}>{(id) => <Input id={id} value={label} maxLength={300} onChange={(e) => setLabel(e.target.value)} />}</Field>
        <div className="sm:col-span-2">
          <Field label={t('entity.value')} error={err}>
            {(id) => <Input id={id} value={value} maxLength={2000} onChange={(e) => setValue(e.target.value)} />}
          </Field>
        </div>
        <Field label={t('common.verification')} hint={td(`verifHelp.${verification}`)}>
          {(id) => (
            <Select id={id} value={verification} onChange={(e) => setVerification(e.target.value as Verification)}>
              {VERIFICATION_LEVELS.map((x) => (
                <option key={x} value={x}>
                  {td(`verif.${x}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('common.confidence')}>
          {(id) => (
            <Select id={id} value={confidence} onChange={(e) => setConfidence(e.target.value as Confidence)}>
              {CONFIDENCE_LEVELS.map((x) => (
                <option key={x} value={x}>
                  {td(`conf.${x}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('entity.sourceUrl')} hint={t('entity.sourceUrlHint')}>
            {(id) => <Input id={id} value={sourceUrl} placeholder="https://" onChange={(e) => setSourceUrl(e.target.value)} />}
          </Field>
        </div>
        <Field label={t('geo.lat')}>{(id) => <Input id={id} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />}</Field>
        <Field label={t('geo.lon')}>{(id) => <Input id={id} inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} />}</Field>
        <div className="sm:col-span-2">
          <Field label={t('common.notes')}>{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        </div>
      </div>
    </Modal>
  );
}

export function RelationModal({ open, onClose, investigationId, entities, relation, presetFrom, presetTo }: { open: boolean; onClose: () => void; investigationId: string; entities: Entity[]; relation?: Relation; presetFrom?: string; presetTo?: string }) {
  const { t, td } = useI18n();
  const { toast, reportError } = useApp();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [label, setLabel] = useState('');
  const [verification, setVerification] = useState<Verification>('unverified');
  const [confidence, setConfidence] = useState<Confidence>('unknown');
  const [notes, setNotes] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFrom(relation?.from ?? presetFrom ?? entities[0]?.id ?? '');
    setTo(relation?.to ?? presetTo ?? entities[1]?.id ?? '');
    setLabel(relation?.label ?? '');
    setVerification(relation?.verification ?? 'unverified');
    setConfidence(relation?.confidence ?? 'unknown');
    setNotes(relation?.notes ?? '');
    setSourceUrl('');
    setErr(null);
  }, [open, relation, presetFrom, presetTo, entities]);

  const save = async () => {
    if (!from || !to || from === to) return setErr(t('relation.invalidEnds'));
    if (sourceUrl && !safeUrl(sourceUrl)) return setErr(t('error.invalidUrl'));
    try {
      const src = sourceUrl ? { sourceId: 'manual', sourceName: 'Manual', url: safeUrl(sourceUrl)!, collectedAt: nowIso() } : undefined;
      if (relation) await updateRelation(relation.id, { from, to, label, verification, confidence, notes, sources: src ? [...relation.sources, src] : relation.sources });
      else await addRelation({ investigationId, from, to, label, verification, confidence, notes, source: src });
      toast(t('common.saved'));
      onClose();
    } catch (x) {
      reportError(x);
    }
  };

  const opts = entities.map((e) => (
    <option key={e.id} value={e.id}>
      [{td(`etype.${e.type}`)}] {e.value.slice(0, 80)}
    </option>
  ));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={relation ? t('relation.edit') : t('relation.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={save} disabled={entities.length < 2}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {entities.length < 2 ? (
        <p className="text-sm text-bw-muted">{t('relation.needTwo')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('relation.from')} error={err}>
            {(id) => (
              <Select id={id} value={from} onChange={(e) => setFrom(e.target.value)}>
                {opts}
              </Select>
            )}
          </Field>
          <Field label={t('relation.to')}>
            {(id) => (
              <Select id={id} value={to} onChange={(e) => setTo(e.target.value)}>
                {opts}
              </Select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('relation.label')} hint={t('relation.labelHint')}>
              {(id) => <Input id={id} value={label} maxLength={200} list="bw-rel-labels" onChange={(e) => setLabel(e.target.value)} />}
            </Field>
            <datalist id="bw-rel-labels">
              {['resolves to', 'hosted by', 'owns (declared)', 'uses handle', 'linked account', 'same identifier', 'works for', 'located at', 'appears in', 'sub-domain of', 'contact listed on', 'communicates with'].map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          <Field label={t('common.verification')} hint={td(`verifHelp.${verification}`)}>
            {(id) => (
              <Select id={id} value={verification} onChange={(e) => setVerification(e.target.value as Verification)}>
                {VERIFICATION_LEVELS.map((x) => (
                  <option key={x} value={x}>
                    {td(`verif.${x}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('common.confidence')}>
            {(id) => (
              <Select id={id} value={confidence} onChange={(e) => setConfidence(e.target.value as Confidence)}>
                {CONFIDENCE_LEVELS.map((x) => (
                  <option key={x} value={x}>
                    {td(`conf.${x}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('entity.sourceUrl')}>{(id) => <Input id={id} value={sourceUrl} placeholder="https://" onChange={(e) => setSourceUrl(e.target.value)} />}</Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={t('common.notes')}>{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          </div>
        </div>
      )}
    </Modal>
  );
}
