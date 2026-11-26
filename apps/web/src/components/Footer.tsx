import { ArrowUpRight, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CHECK_IDS } from '@pulseqa/shared';
import { BrandLogo, GitHubMark, REPO_URL } from './brand';

function FooterLink({ to, href, children }: { to?: string; href?: string; children: ReactNode }) {
  const cls = 'inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg';
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {children}
      <ArrowUpRight className="size-3 opacity-60" />
    </a>
  ) : (
    <Link to={to!} className={cls}>
      {children}
    </Link>
  );
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">{title}</h3>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

const STACK = ['Playwright', 'axe-core', 'React', 'Node.js', 'PostgreSQL'];

export function Footer() {
  const year = new Date().getFullYear();
  const { pathname } = useLocation();
  // the landing page and the new-audit form already end with their own call to action
  const showCta = pathname !== '/' && pathname !== '/new';
  return (
    <footer className="mt-16 border-t border-line bg-panel/60" aria-label="Site footer">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          {/* brand */}
          <div className="col-span-2 max-w-sm sm:col-span-3 lg:col-span-1">
            <Link to="/" aria-label="PulseQA home">
              <BrandLogo />
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Automated web auditing for QA teams — {CHECK_IDS.length} checks on any URL, from broken links and accessibility to visual regression and a
              multi-page site crawl, with a fix for every issue.
            </p>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {STACK.map((t) => (
                <span key={t} className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px] text-muted">
                  {t}
                </span>
              ))}
            </div>
          </div>

          <Column title="Product">
            <li>
              <FooterLink to="/#checks">Checks</FooterLink>
            </li>
            <li>
              <FooterLink to="/#how">How it works</FooterLink>
            </li>
            <li>
              <FooterLink to="/#features">Features</FooterLink>
            </li>
          </Column>

          <Column title="Workspace">
            <li>
              <FooterLink to="/new">New audit</FooterLink>
            </li>
            <li>
              <FooterLink to="/audits">Audit history</FooterLink>
            </li>
          </Column>

          <Column title="Project">
            <li>
              <FooterLink href={REPO_URL}>Source code</FooterLink>
            </li>
            <li>
              <FooterLink href={`${REPO_URL}/blob/main/SECURITY.md`}>Security policy</FooterLink>
            </li>
            <li>
              <FooterLink href={`${REPO_URL}/security/advisories/new`}>Report a vulnerability</FooterLink>
            </li>
            <li>
              <FooterLink href={`${REPO_URL}/blob/main/LICENSE`}>MIT License</FooterLink>
            </li>
          </Column>
        </div>

        {/* call to action strip */}
        {showCta && (
        <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-xl border border-line bg-bg/60 px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-semibold text-fg">Check a website now</div>
            <div className="text-xs text-muted">Free · no sign-up · your history stays private to this browser</div>
          </div>
          <Link
            to="/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-strong px-3.5 text-sm font-medium text-white shadow-sm shadow-brand/30 transition hover:brightness-110"
          >
            <Plus className="size-4" /> New audit
          </Link>
        </div>
        )}

        <div className="mt-8 flex flex-col-reverse items-start justify-between gap-4 border-t border-line pt-6 text-xs text-faint sm:flex-row sm:items-center">
          <p>
            © {year} PulseQA · Released under the{' '}
            <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer" className="hover:text-fg">
              MIT License
            </a>
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="PulseQA on GitHub"
            className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-muted transition hover:border-faint hover:text-fg"
          >
            <GitHubMark className="size-4" /> Star on GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
