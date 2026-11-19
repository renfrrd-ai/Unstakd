import { getUser } from "@/server/session";

export async function UserMenu() {
  const user = await getUser();
  if (!user) return null;
  const initials = user.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <details className="relative">
      <summary
        aria-label={`Account: ${user.login}`}
        className="flex size-8 cursor-pointer list-none items-center justify-center overflow-hidden rounded-full bg-panel-2 text-xs font-semibold text-text [&::-webkit-details-marker]:hidden"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="size-8" />
        ) : (
          initials
        )}
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-48 rounded-lg border border-border bg-panel p-1.5 shadow-lg">
        <p className="m-0 px-2.5 py-2 font-mono text-xs text-muted">@{user.login}</p>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="w-full cursor-pointer rounded-md px-2.5 py-2 text-left hover:bg-panel-2">Sign out</button>
        </form>
      </div>
    </details>
  );
}
