import type { Browser, BrowserContext, Page, Response } from 'playwright';
import type { CheckId, CheckResult, CheckStatus, ConsoleEntry, NetworkEntry, PageErrorEntry, Screenshot } from '@pulseqa/shared';

export type { ConsoleEntry, NetworkEntry, PageErrorEntry };

export interface Collected {
  console: ConsoleEntry[];
  pageErrors: PageErrorEntry[];
  failedRequests: NetworkEntry[];
  errorResponses: NetworkEntry[];
  /** Every request URL the page made (used for mixed-content detection). */
  requestUrls: string[];
}

export interface CheckContext {
  auditId: string;
  url: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  mainResponse: Response | null;
  collected: Collected;
  /** Aborted when the audit is cancelled or hits its overall timeout. */
  signal: AbortSignal;
  /** False on public deployments: never send requests to private/loopback hosts. */
  allowPrivateHosts: boolean;
  /** Root folder of all audits' artifacts (`<artifactsDir>/<auditId>/<file>`). */
  artifactsDir: string;
  /** Public URL of an artifact file of any audit (used to show baseline images). */
  artifactUrl(auditId: string, file: string): string;
  /** Approved visual baseline for this owner + URL, if any. */
  baseline: { auditId: string; approvedAt: string } | null;
  saveScreenshot(label: string, buffer: Buffer): Promise<Screenshot>;
}

export type CheckOutcome = Omit<CheckResult, 'checkId' | 'durationMs' | 'startedAt'> & {
  status: Exclude<CheckStatus, 'pending' | 'running'>;
};

export interface Check {
  id: CheckId;
  timeoutMs: number;
  /** If true, the check needs a successfully loaded main page. */
  requiresPage: boolean;
  run(ctx: CheckContext): Promise<CheckOutcome>;
}

export function outcome(
  status: CheckOutcome['status'],
  summary: object,
  details: object = {},
  screenshots: Screenshot[] = [],
): CheckOutcome {
  return {
    status,
    summary: summary as Record<string, unknown>,
    details: details as Record<string, unknown>,
    screenshots,
    error: null,
  };
}
