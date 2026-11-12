import {
  LayoutDashboard,
  FolderKanban,
  AtSign,
  Globe,
  MapPinned,
  ImageIcon,
  Users,
  Mail,
  SearchCode,
  Share2,
  CalendarClock,
  Workflow,
  FileText,
  Database,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { TKey } from '@/i18n';

export interface NavItem {
  id: string;
  path: string;
  label: TKey;
  desc: TKey;
  icon: LucideIcon;
  group: 'core' | 'collect' | 'analyse' | 'system';
}

export const NAV: NavItem[] = [
  { id: 'dashboard', path: '/', label: 'nav.dashboard', desc: 'desc.dashboard', icon: LayoutDashboard, group: 'core' },
  { id: 'investigations', path: '/investigations', label: 'nav.investigations', desc: 'desc.investigations', icon: FolderKanban, group: 'core' },
  { id: 'username', path: '/username', label: 'nav.username', desc: 'desc.username', icon: AtSign, group: 'collect' },
  { id: 'domain', path: '/domain', label: 'nav.domain', desc: 'desc.domain', icon: Globe, group: 'collect' },
  { id: 'email', path: '/email', label: 'nav.email', desc: 'desc.email', icon: Mail, group: 'collect' },
  { id: 'socmint', path: '/socmint', label: 'nav.socmint', desc: 'desc.socmint', icon: Users, group: 'collect' },
  { id: 'search', path: '/dorks', label: 'nav.search', desc: 'desc.search', icon: SearchCode, group: 'collect' },
  { id: 'geoint', path: '/geoint', label: 'nav.geoint', desc: 'desc.geoint', icon: MapPinned, group: 'collect' },
  { id: 'image', path: '/image', label: 'nav.image', desc: 'desc.image', icon: ImageIcon, group: 'collect' },
  { id: 'graph', path: '/graph', label: 'nav.graph', desc: 'desc.graph', icon: Share2, group: 'analyse' },
  { id: 'timeline', path: '/timeline', label: 'nav.timeline', desc: 'desc.timeline', icon: CalendarClock, group: 'analyse' },
  { id: 'automation', path: '/automation', label: 'nav.automation', desc: 'desc.automation', icon: Workflow, group: 'analyse' },
  { id: 'reports', path: '/reports', label: 'nav.reports', desc: 'desc.reports', icon: FileText, group: 'analyse' },
  { id: 'sources', path: '/sources', label: 'nav.sources', desc: 'desc.sources', icon: Database, group: 'system' },
  { id: 'settings', path: '/settings', label: 'nav.settings', desc: 'desc.settings', icon: Settings, group: 'system' },
];

export const NAV_BY_ID = new Map(NAV.map((n) => [n.id, n]));
