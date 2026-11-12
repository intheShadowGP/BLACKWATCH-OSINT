import { externalFetch } from './http';
import { mkResult, obj, str, type AdapterOutput, type SourceAdapter } from './types';
import { sha256Hex } from '@/utils/common';

/** Gravatar identifies profiles by SHA-256 of the trimmed, lower-cased address. */
export async function gravatarHash(email: string): Promise<string> {
  return sha256Hex(email.trim().toLowerCase());
}

export const gravatarAdapter: SourceAdapter = {
  sourceId: 'gravatar',
  queryTypes: ['email'],
  async run(query, queryType, ctx): Promise<AdapterOutput> {
    const hash = await gravatarHash(query);
    const res = await externalFetch({ sourceId: 'gravatar', url: `https://api.gravatar.com/v3/profiles/${hash}`, sentValue: `sha256(${hash.slice(0, 12)}…)`, signal: ctx.signal, manual: ctx.manual });
    if (res.status === 404) return { status: 'completed', results: [], message: 'no public Gravatar profile' };
    if (res.status === 401 || res.status === 403) return { status: 'requires-manual-action', results: [], message: `HTTP ${res.status}`, manualUrl: `https://gravatar.com/${hash}` };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const p = obj(await res.json());
    const url = str(p.profile_url) ?? `https://gravatar.com/${hash}`;
    return {
      status: 'completed',
      results: [
        mkResult({
          sourceId: 'gravatar',
          queryType,
          query,
          type: 'account',
          kind: 'Gravatar public profile',
          value: url,
          url,
          confidence: 'high',
          data: { displayName: str(p.display_name), location: str(p.location), description: str(p.description, 500), jobTitle: str(p.job_title), company: str(p.company) },
        }),
      ],
    };
  },
};
