import Link from "next/link";
import { getUser } from "@/server/session";

export async function UserMenu() {
  const user = await getUser();
  if (!user) return null;
  const initials = user.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <details className="relative">
      <summary
        aria-label={`Account: ${user.login}`}
        className="flex size-9 cursor-pointer list-none items-center justify-center overflow-hidden rounded-full bg-panel-2 text-xs font-semibold text-text [&::-webkit-details-marker]:hidden"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="size-9" />
        ) : (
          initials
        )}
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-52 rounded-2xl border border-border bg-panel p-1.5 shadow-pop">
        <p className="m-0 px-3 py-2 text-xs text-muted">Signed in as <span className="font-medium text-text">@{user.login}</span></p>
        <Link href="/server" className="block rounded-[10px] px-3 py-2 text-[13px] hover:bg-panel-2">Server &amp; tokens</Link>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="w-full cursor-pointer rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-panel-2">Sign out</button>
        </form>
      </div>
    </details>
  );
}
