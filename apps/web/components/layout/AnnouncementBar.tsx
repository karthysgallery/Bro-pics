interface AnnouncementBarProps {
  text: string;
  link?: string;
}

export function AnnouncementBar({ text, link }: AnnouncementBarProps) {
  const content = link ? (
    <a href={link} className="underline underline-offset-2">
      {text}
    </a>
  ) : (
    <span>{text}</span>
  );

  return (
    <div className="bg-ink text-gold font-medium text-center text-xs py-2.5 px-4">
      {content}
    </div>
  );
}
