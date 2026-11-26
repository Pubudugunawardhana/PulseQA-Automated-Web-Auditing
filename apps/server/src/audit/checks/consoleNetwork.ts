import type { ConsoleNetworkDetails, ConsoleNetworkSummary, Party } from '@pulseqa/shared';
import { firstUrlIn, siteOf, siteOfUrl } from '../../lib/site.js';
import { outcome, type Check } from '../types.js';

const MAX_ITEMS = 100;

export const consoleNetworkCheck: Check = {
  id: 'consoleNetwork',
  timeoutMs: 10_000,
  requiresPage: true,
  async run(ctx) {
    const site = siteOf(new URL(ctx.page.url() || ctx.url).hostname);
    // Unknown origin (inline script, no location) counts as first-party: it's the page's own code.
    const partyOf = (url: string | null): Party => {
      const s = siteOfUrl(url);
      return s && s !== site ? 'third' : 'first';
    };

    const { console: logs, pageErrors, failedRequests, errorResponses } = ctx.collected;
    const consoleErrors = logs.filter((l) => l.type === 'error').map((l) => ({ ...l, party: partyOf(firstUrlIn(l.location) ?? firstUrlIn(l.text)) }));
    const consoleWarnings = logs.filter((l) => l.type === 'warning').map((l) => ({ ...l, party: partyOf(firstUrlIn(l.location)) }));
    const exceptions = pageErrors.map((e) => ({ ...e, party: partyOf(firstUrlIn(e.stack)) }));

    const isApi = (t: string) => t === 'xhr' || t === 'fetch';
    const network = [...errorResponses, ...failedRequests].map((r) => ({ ...r, party: partyOf(r.url) }));
    const apiFailures = network.filter((r) => isApi(r.resourceType));
    const otherFailures = network.filter((r) => !isApi(r.resourceType));

    const first = <T extends { party: Party }>(list: T[]) => list.filter((x) => x.party === 'first');
    const thirdPartyIssues = [...consoleErrors, ...exceptions, ...network].filter((x) => x.party === 'third').length;

    // Only first-party problems can fail the check; third-party noise (ads, analytics) is at most a warning.
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    if (first(exceptions).length > 0 || first(apiFailures).length > 0) status = 'fail';
    else if (first(consoleErrors).length > 0 || first(otherFailures).length > 0 || thirdPartyIssues > 0) status = 'warn';

    // First-party entries first so they're visible in the (truncated) lists
    const sortParty = <T extends { party: Party }>(list: T[]) => [...list].sort((a, b) => (a.party === b.party ? 0 : a.party === 'first' ? -1 : 1));

    return outcome(
      status,
      {
        consoleErrors: first(consoleErrors).length,
        consoleWarnings: first(consoleWarnings).length,
        uncaughtExceptions: first(exceptions).length,
        apiFailures: first(apiFailures).length,
        otherFailedRequests: first(otherFailures).length,
        thirdPartyIssues,
        pageScan: ctx.pageScan,
      } satisfies ConsoleNetworkSummary,
      {
        site,
        pageErrors: sortParty(exceptions).slice(0, MAX_ITEMS),
        consoleErrors: sortParty(consoleErrors).slice(0, MAX_ITEMS),
        consoleWarnings: sortParty(consoleWarnings).slice(0, MAX_ITEMS),
        apiFailures: sortParty(apiFailures).slice(0, MAX_ITEMS),
        otherFailures: sortParty(otherFailures).slice(0, MAX_ITEMS),
      } satisfies ConsoleNetworkDetails,
    );
  },
};
