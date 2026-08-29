import type { HomepageSection } from '@bro-pics/shared';

const steps = [
  { label: 'Upload', description: 'Upload your favourite photo' },
  { label: 'Adjust', description: 'Crop, zoom, and position it perfectly' },
  { label: 'Preview', description: 'See it live inside your chosen frame' },
  { label: 'Order', description: 'We print and ship it to your door' },
];

export function HowItWorks({ section }: { section: HomepageSection }) {
  return (
    <section className="px-4 py-10 md:px-8 text-center">
      <h2 className="font-display text-2xl mb-2">{section.title}</h2>
      <p className="text-charcoal/70 mb-6">{section.subtitle}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
        {steps.map((step, index) => (
          <div key={step.label}>
            <div className="w-10 h-10 rounded-full bg-terracotta text-cream flex items-center justify-center mx-auto mb-2">
              {index + 1}
            </div>
            <h3 className="font-medium">{step.label}</h3>
            <p className="text-sm text-charcoal/70">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
