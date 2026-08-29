interface AnnouncementBarProps {
  text: string;
  link?: string;
}

export function AnnouncementBar({ text, link }: AnnouncementBarProps) {
  const content = link ? (
    <a href={link} className="hover:underline">
      {text}
    </a>
  ) : (
    <span>{text}</span>
  );

  return (
    <div className="bg-charcoal text-cream text-center text-sm py-2 px-4">
      {content}
    </div>
  );
}
