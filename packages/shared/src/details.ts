// Typed shapes of each check's `summary` and `details` (server produces them, web renders them).

export type Rating = 'pass' | 'warn' | 'fail' | 'unknown';
export type Party = 'first' | 'third';

// ---------- smoke ----------
export interface SmokeSummary {
  httpStatus?: number;
  title?: string | null;
  redirects?: number;
  finalUrl?: string;
  reachable?: boolean;
}
export interface SmokeDetails {
  /** Problems that affect the status. */
  issues: string[];
  /** Informational findings (SEO / hygiene) that don't change the status. */
  notes?: string[];
  redirectChain?: { url: string; status: number | null }[];
  statusText?: string;
  textLength?: number;
  elementCount?: number;
  lang?: string | null;
  hasViewportMeta?: boolean;
  metaDescription?: string | null;
  hasFavicon?: boolean;
  h1Count?: number;
}

// ---------- links ----------
export interface LinkProbe {
  url: string;
  text: string;
  kind: 'link' | 'image';
  status: number | null;
  error?: string;
  unverified?: boolean;
  blocked?: boolean;
  internal: boolean;
}
export interface LinksSummary {
  linksChecked: number;
  imagesChecked: number;
  brokenLinks: number;
  brokenImages: number;
  restricted: number;
}
export interface LinksDetails {
  brokenLinks: LinkProbe[];
  brokenImages: LinkProbe[];
  restricted: LinkProbe[];
  skipped: number;
  truncated: boolean;
  totalLinksFound: number;
  totalImagesFound: number;
}

// ---------- console & network ----------
export interface ConsoleEntry {
  type: string;
  text: string;
  location?: string;
  party?: Party;
}
export interface PageErrorEntry {
  message: string;
  stack?: string;
  party?: Party;
}
export interface NetworkEntry {
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  failure?: string;
  party?: Party;
}
export interface ConsoleNetworkSummary {
  consoleErrors: number;
  consoleWarnings: number;
  uncaughtExceptions: number;
  apiFailures: number;
  otherFailedRequests: number;
  /** Errors/failures that come from third-party origins (ads, analytics, widgets). */
  thirdPartyIssues?: number;
}
export interface ConsoleNetworkDetails {
  site?: string;
  pageErrors: PageErrorEntry[];
  consoleErrors: ConsoleEntry[];
  consoleWarnings: ConsoleEntry[];
  apiFailures: NetworkEntry[];
  otherFailures: NetworkEntry[];
}

// ---------- responsive ----------
export interface ViewportResult {
  label: string;
  width: number;
  height: number;
  horizontalOverflow?: boolean;
  overflowPx?: number;
  maxScrollX?: number;
  scrollWidth?: number;
  clientWidth?: number;
  pageHeight?: number;
  offenders?: { selector: string; right: number; width: number }[];
  offenderCount?: number;
  /** Page hadn't finished loading in time; measured what had rendered. */
  partial?: boolean;
  error?: string;
}
export interface ResponsiveSummary {
  viewportsTested: number;
  overflowing: string[];
  [key: `${string}OverflowPx`]: number | null | undefined;
}
export interface ResponsiveDetails {
  viewports: ViewportResult[];
}

// ---------- accessibility ----------
export type Impact = 'critical' | 'serious' | 'moderate' | 'minor';
export interface A11yViolation {
  id: string;
  impact: Impact;
  help: string;
  description: string;
  helpUrl: string;
  tags: string[];
  nodeCount: number;
  nodes: { target: string; html: string; failureSummary: string }[];
}
export type ImpactCounts = Record<Impact, number> & { violations: number };
export interface AccessibilitySummary extends Record<Impact, number> {
  violations: number;
  passes: number;
  incomplete: number;
  /** Same scan on a 375px mobile viewport (null if that run failed / older audits: undefined). */
  mobile?: ImpactCounts | null;
}
export interface AccessibilityDetails {
  violations: A11yViolation[];
  incomplete: { id: string; help: string; helpUrl: string; nodeCount: number }[];
  axeVersion: string;
  highlighted?: number;
  /** Rules that fail ONLY on the mobile viewport (or affect more elements there), e.g. touch-target size, mobile menus. */
  mobileOnly?: A11yViolation[];
  mobileError?: string | null;
  mobileViewport?: string;
}

// ---------- performance ----------
export type PerfMetricKey = 'ttfb' | 'fcp' | 'lcp' | 'cls' | 'load';
export interface PerfMetrics {
  ttfb: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  load: number | null;
  domContentLoaded: number | null;
}
export interface PerformanceSummary extends PerfMetrics {
  requestCount: number;
  transferKb: number;
  /** Same metrics measured on a throttled mobile profile (null if that run failed). */
  mobile?: PerfMetrics | null;
}
export interface PerformanceDetails {
  ratings: Record<PerfMetricKey, Rating>;
  mobileRatings?: Record<PerfMetricKey, Rating> | null;
  mobileError?: string | null;
  conditions?: { desktop: string; mobile: string };
  thresholds: Record<PerfMetricKey, readonly [number, number]>;
  byType: Record<string, { count: number; bytes: number }>;
  slowestResources: { url: string; type: string; durationMs: number; bytes: number }[];
  domNodes: number;
}

// ---------- security ----------
export interface HeaderCheck {
  header: string;
  present: boolean;
  value: string | null;
  ok: boolean;
  recommendation: string;
}
export interface SecuritySummary {
  https: boolean;
  headersPassed?: number;
  headersTotal?: number;
  mixedContent?: number;
}
export interface SecurityDetails {
  issues: string[];
  headers?: HeaderCheck[];
  httpRedirectsToHttps?: boolean | null;
  mixedContent?: string[];
  cookies?: { name: string; secure: boolean; httpOnly: boolean; sameSite: string }[];
  insecureCookies?: { name: string; secure: boolean; httpOnly: boolean; sameSite: string }[];
}

// ---------- SEO ----------
export type SeoRuleId =
  | 'title'
  | 'description'
  | 'canonical'
  | 'robotsMeta'
  | 'lang'
  | 'h1'
  | 'headingOrder'
  | 'imageAlt'
  | 'openGraph'
  | 'twitterCard'
  | 'structuredData'
  | 'robotsTxt'
  | 'sitemap';
export interface SeoRule {
  id: SeoRuleId;
  label: string;
  status: Rating;
  /** What was found (e.g. the title text or "missing"). */
  value: string;
  /** Short explanation of why it passed/failed. */
  message: string;
}
export interface SeoSummary {
  passed: number;
  warnings: number;
  failed: number;
  indexable: boolean;
}
export interface SeoDetails {
  rules: SeoRule[];
  title: string | null;
  description: string | null;
  canonical: string | null;
  og: { title?: string; description?: string; image?: string; url?: string; siteName?: string };
  twitterCard: string | null;
  jsonLdTypes: string[];
  hreflang: number;
  headings: { level: number; text: string }[];
  robotsTxt: { url: string; status: number | null; blocksAll: boolean; sitemaps: string[] } | null;
  sitemap: { url: string; status: number | null; urls: number | null; valid: boolean } | null;
}

// ---------- visual regression ----------
export interface VisualViewport {
  label: 'desktop' | 'mobile';
  width: number;
  height: number;
  /** % of compared pixels that changed (null when there was nothing to compare against). */
  diffPercent: number | null;
  changedPixels: number | null;
  baselineHeight: number | null;
  /** % change of the captured page height vs the baseline. */
  heightChangePercent: number | null;
  current: string;
  baseline: string | null;
  diff: string | null;
  status: Rating;
  error?: string;
}
export interface VisualSummary {
  /** true when this run had no approved baseline and became it. */
  baselineCreated: boolean;
  maxDiffPercent: number | null;
}
export interface VisualDetails {
  baseline: { auditId: string; approvedAt: string } | null;
  viewports: VisualViewport[];
  thresholds: { warn: number; fail: number };
}

// ---------- cross-browser ----------
export type BrowserName = 'chromium' | 'firefox' | 'webkit';
export interface BrowserRun {
  browser: BrowserName;
  version: string | null;
  loaded: boolean;
  httpStatus: number | null;
  loadMs: number | null;
  jsErrors: string[];
  consoleErrors: string[];
  failedRequests: number;
  horizontalOverflow: boolean;
  overflowPx: number;
  screenshot: string | null;
  error?: string;
}
export interface CrossBrowserSummary {
  browsersTested: number;
  loadedIn: number;
  browserSpecificErrors: number;
  inconsistentLayout: boolean;
}
export interface CrossBrowserDetails {
  runs: BrowserRun[];
  /** JS errors seen in some browsers but not all. */
  browserOnlyErrors: { message: string; browsers: BrowserName[] }[];
  viewport: string;
}

/** Maps a check id to its summary/details types. */
export interface CheckShapes {
  smoke: { summary: SmokeSummary; details: SmokeDetails };
  links: { summary: LinksSummary; details: LinksDetails };
  consoleNetwork: { summary: ConsoleNetworkSummary; details: ConsoleNetworkDetails };
  responsive: { summary: ResponsiveSummary; details: ResponsiveDetails };
  accessibility: { summary: AccessibilitySummary; details: AccessibilityDetails };
  performance: { summary: PerformanceSummary; details: PerformanceDetails };
  security: { summary: SecuritySummary; details: SecurityDetails };
  seo: { summary: SeoSummary; details: SeoDetails };
  visual: { summary: VisualSummary; details: VisualDetails };
  crossBrowser: { summary: CrossBrowserSummary; details: CrossBrowserDetails };
}
