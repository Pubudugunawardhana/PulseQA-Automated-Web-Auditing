// Screenshots tab: every screenshot the audit took, grouped by check.
import { ImageOff } from 'lucide-react';
import { CHECK_META, type CheckId, type CheckResult } from '@pulseqa/shared';
import { ScreenshotGallery } from '../CheckDetails';
import { CHECK_ICON } from '../checkIcons';
import { SectionCard } from '../ui';
import { SessionVideo } from './SessionVideo';


export function ScreenshotsTab({ checks, results, video }: { checks: CheckId[]; results: Map<CheckId, CheckResult>; video: string | null }) {
  const groups = checks.map((c) => results.get(c)).filter((r): r is CheckResult => !!r && r.screenshots.length > 0);
  if (groups.length === 0 && !video)
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-16 text-center text-sm text-muted">
        <ImageOff className="size-6 text-faint" />
        No screenshots for this audit.
      </div>
    );
  return (
    <div className="space-y-5">
      {video && <SessionVideo src={video} />}
      {groups.map((r) => {
        const Icon = CHECK_ICON[r.checkId];
        return (
          <SectionCard
            key={r.checkId}
            title={
              <span className="inline-flex items-center gap-2">
                <Icon className="size-4 text-muted" /> {CHECK_META[r.checkId].name}
              </span>
            }
            subtitle={`${r.screenshots.length} screenshot${r.screenshots.length === 1 ? '' : 's'} · click to enlarge`}
          >
            <ScreenshotGallery shots={r.screenshots} />
          </SectionCard>
        );
      })}
    </div>
  );
}
