import { StatusChip } from './StatusChip';

export interface TimelineEvent {
  id: string;
  status?: string;
  title: string;
  description?: string | null;
  actor?: string | null;
  createdAt: string | Date;
}

interface TimelineProps {
  events: TimelineEvent[];
  className?: string;
}

export function Timeline({ events, className = '' }: TimelineProps) {
  if (events.length === 0) {
    return <p className="text-xs text-ink/50 italic">No events recorded.</p>;
  }

  return (
    <div className={`relative pl-6 space-y-6 ${className}`}>
      {/* Vertical Track */}
      <div className="absolute top-2 bottom-2 left-2.5 w-0.5 bg-line" aria-hidden="true" />

      {events.map((event, index) => {
        const dateStr =
          typeof event.createdAt === 'string'
            ? new Date(event.createdAt).toLocaleString('en-IN')
            : event.createdAt.toLocaleString('en-IN');

        return (
          <div key={event.id || index} className="relative group">
            {/* Timeline Dot */}
            <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-paper border-2 border-gold group-hover:bg-gold transition-colors" />

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                {event.status && <StatusChip status={event.status} size="sm" />}
                <span className="text-xs font-semibold text-ink">{event.title}</span>
                <span className="text-2xs text-ink/50 ml-auto">{dateStr}</span>
              </div>

              {event.description && (
                <p className="text-xs text-ink/70 bg-tint/40 p-2.5 rounded-xl border border-line mt-1 whitespace-pre-wrap">
                  {event.description}
                </p>
              )}

              {event.actor && (
                <span className="text-2xs text-ink/40">By {event.actor}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
