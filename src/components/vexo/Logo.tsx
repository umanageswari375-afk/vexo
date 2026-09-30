import { Link } from "@tanstack/react-router";

export function VexoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="vx" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-glow)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="var(--secondary)" />
      <path
        d="M7 9l6.5 14h2L9.8 9H7zm8.5 0l4 8.6L23.8 9H26l-6.5 14h-1L13.3 9h2.2z"
        fill="url(#vx)"
      />
    </svg>
  );
}

export function VexoLogo({ to = "/", small = false }: { to?: string; small?: boolean }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-semibold tracking-tight">
      <VexoMark className={small ? "h-5 w-5" : "h-7 w-7"} />
      <span className={small ? "text-base" : "text-lg"}>Vexo</span>
    </Link>
  );
}
