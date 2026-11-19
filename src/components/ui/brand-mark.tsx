import Link from "next/link";

export function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-mono text-base font-bold text-text">
      <span aria-hidden="true" className="inline-block h-4.5 w-2.5 bg-accent" />
      unstakd
    </Link>
  );
}
