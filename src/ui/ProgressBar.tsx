/**
 * A horizontal progress bar. `value` is 0..1 (clamped). RTL-safe: the fill
 * grows from the inline-start edge, which is the right in an RTL layout.
 */
export function ProgressBar({
  value,
  color = 'var(--accent)',
  label,
}: {
  value: number;
  color?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const pct = Math.round(clamped * 100);

  return (
    <div
      className="ht-bar"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="ht-bar__track">
        <div className="ht-bar__fill" style={{ inlineSize: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
