import type { ProductMedia } from '@bro-pics/shared';

export function VideoRail({ media }: { media: ProductMedia[] }) {
  const videos = media.filter((m) => m.type === 'video');
  if (videos.length === 0) return null;

  return (
    <section data-testid="video-rail" className="mt-10">
      <h2 className="font-display text-2xl mb-4">In Motion</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {videos.map((video) => (
          <video key={video.id} src={video.url} controls className="w-48 aspect-[9/16] object-cover rounded-lg flex-shrink-0" />
        ))}
      </div>
    </section>
  );
}
