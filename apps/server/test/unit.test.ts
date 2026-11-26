import { describe, expect, it } from 'vitest';
import { computeOverall, computeScore } from '@pulseqa/shared';
import { rateMetric } from '../src/audit/checks/performance.js';
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
