import type { Variant } from '@bro-pics/shared';

function toCm(inches: number): string {
  return (inches * 2.54).toFixed(1);
}

export function SizeChart({ variants }: { variants: Variant[] }) {
  const sizes = Array.from(
    new Map(variants.map((v) => [v.sizeLabel, v])).values()
  );

  if (sizes.length === 0) {
    return <p className="text-sm text-ink/70">Size details aren&apos;t available for this product yet.</p>;
  }

  return (
    <div className="text-sm">
      <p className="text-ink/70 mb-3">
        All dimensions are the finished frame size. Choose the size that best fits your wall or shelf space.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-line text-xs uppercase text-ink/60">
              <th className="py-2 pr-4 font-medium">Size</th>
              <th className="py-2 pr-4 font-medium">Inches</th>
              <th className="py-2 font-medium">Centimetres</th>
            </tr>
          </thead>
          <tbody>
            {sizes.map((variant) => (
              <tr key={variant.sizeLabel} className="border-b border-line">
                <td className="py-2 pr-4">{variant.sizeLabel}</td>
                <td className="py-2 pr-4">
                  {variant.widthIn} × {variant.heightIn} in
                </td>
                <td className="py-2">
                  {toCm(variant.widthIn)} × {toCm(variant.heightIn)} cm
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
