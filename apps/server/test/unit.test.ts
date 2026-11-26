import { describe, expect, it } from 'vitest';
import { computeOverall, computeScore } from '@pulseqa/shared';
import { rateMetric } from '../src/audit/checks/performance.js';
import { DESCRIPTION_RANGE, rateLength, TITLE_RANGE } from '../src/audit/checks/seo.js';
import { rateDiff } from '../src/audit/checks/visual.js';
import { parseRobots } from '../src/lib/safeFetch.js';
import { isDisallowed, normalizeCrawlUrl } from '../src/audit/checks/crawl.js';
import { firstUrlIn, siteOf, siteOfUrl } from '../src/lib/site.js';
import { isPrivateIp, normalizeAuditUrl, UrlValidationError } from '../src/lib/urlGuard.js';

describe('urlGuard', () => {
  it('adds https:// when no scheme is given and strips the hash', async () => {
    expect(await normalizeAuditUrl('example.com/path#x', true)).toBe('https://example.com/path');
  });
  it('rejects non-http protocols', async () => {
    await expect(normalizeAuditUrl('ftp://example.com', true)).rejects.toBeInstanceOf(UrlValidationError);
    await expect(normalizeAuditUrl('file:///etc/passwd', true)).rejects.toBeInstanceOf(UrlValidationError);
  });
  it('blocks localhost when private hosts are disallowed', async () => {
    await expect(normalizeAuditUrl('http://localhost:3000', false)).rejects.toThrow(/Private/);
    await expect(normalizeAuditUrl('http://192.168.1.5', false)).rejects.toThrow(/Private/);
    expect(await normalizeAuditUrl('http://localhost:3000', true)).toBe('http://localhost:3000/');
  });
  it('detects private ip ranges', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '172.20.1.1', '192.168.0.1', '169.254.1.1', '::1', '::ffff:127.0.0.1']) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    expect(isPrivateIp('8.8.8.8')).toBe(false);
  });
});

describe('siteOf (first/third-party grouping)', () => {
  it('reduces hosts to their registrable domain', () => {
    expect(siteOf('app.example.com')).toBe('example.com');
    expect(siteOf('example.com')).toBe('example.com');
    expect(siteOf('shop.example.co.uk')).toBe('example.co.uk');
    expect(siteOf('www.uom.ac.lk')).toBe('uom.ac.lk');
    expect(siteOf('github.githubassets.com')).toBe('githubassets.com');
    expect(siteOf('127.0.0.1')).toBe('127.0.0.1');
    expect(siteOf('localhost')).toBe('localhost');
  });
  it('extracts site from urls and stack traces', () => {
    expect(siteOfUrl('https://cdn.example.com/a.js')).toBe('example.com');
    expect(siteOfUrl('chrome-extension://abc/x.js')).toBeNull();
    expect(firstUrlIn('Error: x\n    at f (https://ads.tracker.io/t.js:1:2)')).toBe('https://ads.tracker.io/t.js:1:2');
  });
});

describe('scoring', () => {
  it('weights checks and handles warn as half', () => {
    expect(computeScore([{ checkId: 'smoke', status: 'pass' }, { checkId: 'security', status: 'fail' }])).toBe(75);
    expect(computeScore([{ checkId: 'links', status: 'warn' }])).toBe(50);
    expect(computeScore([{ checkId: 'links', status: 'skipped' }])).toBe(0);
  });
  it('overall is the worst status', () => {
    expect(computeOverall([{ status: 'pass' }, { status: 'warn' }])).toBe('warn');
    expect(computeOverall([{ status: 'pass' }, { status: 'error' }])).toBe('fail');
    expect(computeOverall([{ status: 'pass' }])).toBe('pass');
    expect(computeOverall([{ status: 'skipped' }])).toBe('fail'); // nothing measured is not a pass
    expect(computeOverall([{ status: 'pass' }, { status: 'skipped' }])).toBe('pass');
  });
});

describe('performance thresholds', () => {
  it('rates metrics', () => {
    expect(rateMetric('fcp', 1000)).toBe('pass');
    expect(rateMetric('fcp', 2500)).toBe('warn');
    expect(rateMetric('lcp', 5000)).toBe('fail');
    expect(rateMetric('cls', null)).toBe('unknown');
  });
});

describe('seo helpers', () => {
  it('rates title / description length', () => {
    expect(rateLength(null, TITLE_RANGE)).toBe('fail');
    expect(rateLength('Short', TITLE_RANGE)).toBe('warn');
    expect(rateLength('A descriptive page title of a good length', TITLE_RANGE)).toBe('pass');
    expect(rateLength('x'.repeat(200), DESCRIPTION_RANGE)).toBe('warn');
  });

  it('parses robots.txt groups and sitemaps', () => {
    expect(parseRobots('User-agent: *\nDisallow: /\n')).toMatchObject({ blocksAll: true, sitemaps: [] });
    expect(parseRobots('User-agent: *\nDisallow: /admin\nDisallow: /tmp/').disallow).toEqual(['/admin', '/tmp/']);
    expect(parseRobots('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\nSitemap: https://x.com/s.xml').blocksAll).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow:\n# comment\nSitemap: https://x.com/a.xml\nSitemap: https://x.com/b.xml').sitemaps).toHaveLength(2);
  });
});

describe('visual regression helpers', () => {
  it('rates pixel differences against the thresholds', () => {
    expect(rateDiff(null, null)).toBe('pass');
    expect(rateDiff(0.1, 0)).toBe('pass');
    expect(rateDiff(3, 0)).toBe('warn');
    expect(rateDiff(20, 0)).toBe('fail');
    expect(rateDiff(1, 40)).toBe('fail'); // page height changed a lot
  });
});

describe('crawler helpers', () => {
  it('normalises crawl URLs', () => {
    expect(normalizeCrawlUrl('/a?utm_source=x&id=2#top', 'https://ex.com/')).toBe('https://ex.com/a?id=2');
    expect(normalizeCrawlUrl('/report.pdf', 'https://ex.com/')).toBeNull();
    expect(normalizeCrawlUrl('mailto:hi@ex.com', 'https://ex.com/')).toBeNull();
    expect(normalizeCrawlUrl('page?fbclid=1', 'https://ex.com/dir/')).toBe('https://ex.com/dir/page');
    expect(normalizeCrawlUrl('/shop/index.html', 'https://ex.com/')).toBe('https://ex.com/shop/');
  });

  it('matches robots.txt disallow rules', () => {
    expect(isDisallowed('https://ex.com/private/a', ['/private/'])).toBe(true);
    expect(isDisallowed('https://ex.com/public', ['/private/'])).toBe(false);
    expect(isDisallowed('https://ex.com/a.php?x=1', ['/*.php$'])).toBe(false);
    expect(isDisallowed('https://ex.com/a.php', ['/*.php$'])).toBe(true);
  });
});
