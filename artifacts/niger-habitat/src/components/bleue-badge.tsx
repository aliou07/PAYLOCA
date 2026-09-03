import { Check } from 'lucide-react';

export function BlueBadge({ size = 16, label = 'Profil vérifié' }: { size?: number; label?: string }) {
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#00a3ff] text-white shadow-[0_0_10px_rgba(0,163,255,.65)]"
      style={{ width: size, height: size }}
    >
      <Check size={Math.max(9, Math.round(size * 0.62))} strokeWidth={3} />
    </span>
  );
}
