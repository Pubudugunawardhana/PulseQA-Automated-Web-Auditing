import { Accessibility, AppWindow, Gauge, Globe, Images, Link2, MonitorSmartphone, ScanSearch, ShieldCheck, SquareTerminal, type LucideIcon } from 'lucide-react';
import type { CheckId } from '@pulseqa/shared';

export const CHECK_ICON: Record<CheckId, LucideIcon> = {
  smoke: Globe,
  links: Link2,
  consoleNetwork: SquareTerminal,
  responsive: MonitorSmartphone,
  accessibility: Accessibility,
  performance: Gauge,
  security: ShieldCheck,
  seo: ScanSearch,
  visual: Images,
  crossBrowser: AppWindow,
};
