import { Download, Video } from 'lucide-react';
import { useState } from 'react';
import { formatMs } from '../../lib/format';
import { SectionCard } from '../ui';

/** The recorded browser session: page load, the checks on the main page and the auto-scroll. */
export function SessionVideo({ src }: { src: string }) {
  const [duration, setDuration] = useState<number | null>(null);
  return (
    <SectionCard
      title={
        <span className="inline-flex items-center gap-2">
          <Video className="size-4 text-brand-strong" /> Session recording
        </span>
      }
      subtitle={`What the browser did on the page — load, checks and auto-scroll${duration ? ` · ${formatMs(duration * 1000)}` : ''}`}
      action={
        <a href={src} download className="inline-flex items-center gap-1 font-medium text-brand-strong hover:underline">
          <Download className="size-3.5" /> Download
        </a>
      }
      bodyClassName="p-0"
    >
      <video
        // start on a frame where the page has rendered instead of the blank first frame
        src={`${src}#t=1.5`}
        controls
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        className="block aspect-video w-full rounded-b-xl bg-black"
      />
    </SectionCard>
  );
}
