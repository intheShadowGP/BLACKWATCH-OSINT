/**
 * Local, offline provider classification. Lists are intentionally short and
 * documented: absence from a list means "unknown", never "corporate".
 */
export type ProviderClass = 'webmail' | 'privacy' | 'disposable' | 'isp' | 'education' | 'government' | 'custom';

const WEBMAIL = ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.fr', 'live.com', 'live.fr', 'msn.com', 'yahoo.com', 'yahoo.fr', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'gmx.com', 'gmx.de', 'gmx.fr', 'web.de', 'mail.com', 'yandex.com', 'yandex.ru', 'mail.ru', 'zoho.com', 'qq.com', '163.com', '126.com', 'naver.com', 'laposte.net', 'free.fr', 'orange.fr', 'wanadoo.fr', 'sfr.fr', 'neuf.fr', 'bbox.fr'];
const PRIVACY = ['proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me', 'tutanota.com', 'tutanota.de', 'tuta.io', 'tuta.com', 'posteo.de', 'posteo.net', 'mailbox.org', 'disroot.org', 'riseup.net', 'startmail.com', 'hushmail.com', 'skiff.com', 'duck.com', 'simplelogin.com', 'simplelogin.co', 'anonaddy.me', 'addy.io', 'relay.firefox.com', 'mozmail.com'];
const DISPOSABLE = ['mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', 'temp-mail.org', 'tempmail.com', 'yopmail.com', 'yopmail.fr', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'tempr.email', 'burnermail.io', 'spamgourmet.com', 'mailnesia.com', 'jetable.org', 'mail-temp.com'];
const ISP = ['orange.fr', 'wanadoo.fr', 'sfr.fr', 'neuf.fr', 'free.fr', 'bbox.fr', 'numericable.fr', 'comcast.net', 'verizon.net', 'att.net', 'btinternet.com', 'sky.com', 'virginmedia.com', 't-online.de', 'telenet.be', 'skynet.be', 'bluewin.ch'];

/** MX host fragments of well-known hosted mail services. */
const MX_HOSTS: Array<[RegExp, string]> = [
  [/google\.com$|googlemail\.com$/i, 'Google Workspace / Gmail'],
  [/protection\.outlook\.com$|outlook\.com$/i, 'Microsoft 365 / Outlook'],
  [/protonmail\.ch$|proton\.me$/i, 'Proton Mail'],
  [/zoho\.(com|eu|in)$/i, 'Zoho Mail'],
  [/yahoodns\.net$/i, 'Yahoo'],
  [/icloud\.com$/i, 'iCloud Mail'],
  [/mimecast\.com$/i, 'Mimecast (filtering)'],
  [/pphosted\.com$/i, 'Proofpoint (filtering)'],
  [/ovh\.net$/i, 'OVHcloud'],
  [/gandi\.net$/i, 'Gandi'],
  [/ionos\.|1and1\./i, 'IONOS'],
  [/mailgun\.org$/i, 'Mailgun'],
  [/secureserver\.net$/i, 'GoDaddy'],
  [/fastmail\.com$|messagingengine\.com$/i, 'Fastmail'],
  [/tutanota\.de$/i, 'Tuta'],
  [/mx\.cloudflare\.net$/i, 'Cloudflare Email Routing'],
];

export function classifyEmailDomain(domain: string): ProviderClass[] {
  const d = domain.toLowerCase();
  const out: ProviderClass[] = [];
  if (DISPOSABLE.includes(d)) out.push('disposable');
  if (PRIVACY.includes(d)) out.push('privacy');
  if (WEBMAIL.includes(d)) out.push('webmail');
  if (ISP.includes(d)) out.push('isp');
  if (/\.(edu|ac\.[a-z]{2}|edu\.[a-z]{2})$/.test(d) || /(^|\.)univ-[a-z-]+\.fr$/.test(d)) out.push('education');
  if (/\.(gov|gouv\.fr|gov\.[a-z]{2}|mil)$/.test(d)) out.push('government');
  if (!out.length) out.push('custom');
  return out;
}

export function identifyMailHost(mx: string): string | null {
  const h = mx.toLowerCase().replace(/\.$/, '');
  for (const [re, name] of MX_HOSTS) if (re.test(h)) return name;
  return null;
}

export interface SpfInfo {
  record: string;
  all: string | null;
  includes: string[];
  ips: string[];
}
export function parseSpf(record: string): SpfInfo {
  const parts = record.split(/\s+/);
  return {
    record,
    all: parts.find((p) => /^[~?+-]?all$/i.test(p)) ?? null,
    includes: parts.filter((p) => /^include:/i.test(p)).map((p) => p.slice(8)),
    ips: parts.filter((p) => /^ip[46]:/i.test(p)).map((p) => p.slice(4)),
  };
}

export function parseDmarc(record: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of record.split(';')) {
    const [k, ...v] = kv.trim().split('=');
    if (k && v.length) out[k.trim().toLowerCase()] = v.join('=').trim();
  }
  return out;
}
