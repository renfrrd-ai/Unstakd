import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { LiveUpdates } from "@/components/layout/live-updates";
import { UserMenu } from "@/components/layout/user-menu";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader>
        <Suspense fallback={<span className="size-9 rounded-full bg-panel-2" />}>
          <UserMenu />
        </Suspense>
      </AppHeader>
      <LiveUpdates />
      {children}
    </>
  );
}
