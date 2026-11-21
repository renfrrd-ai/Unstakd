import Link from "next/link";

// Three offset bars (the middle one in the accent) + wordmark, from Unstakd.html.
export function BrandGlyph() {
  return (
    <span aria-hidden="true" className="relative block h-5.5 w-6.5 shrink-0">
      <span className="absolute top-0 left-0 h-1.25 w-4 rounded-[3px] bg-ink" />
      <span className="absolute top-[8.5px] left-1.25 h-1.25 w-4 rounded-[3px] bg-accent" />
      <span className="absolute top-4.25 left-2.5 h-1.25 w-4 rounded-[3px] bg-ink" />
    </span>
  );
}

export function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-[-0.02em] text-text">
      <BrandGlyph />
      unstakd
    </Link>
  );
}
