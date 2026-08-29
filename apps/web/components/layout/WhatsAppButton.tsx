interface WhatsAppButtonProps {
  phoneNumber: string;
  message: string;
}

export function WhatsAppButton({ phoneNumber, message }: WhatsAppButtonProps) {
  const href = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-6 right-6 z-30 bg-sage text-cream rounded-full w-14 h-14 flex items-center justify-center shadow-lg"
    >
      💬
    </a>
  );
}
