import type { Metadata } from "next";
import { Suspense } from "react";
import { PageMain } from "@/components/layout/app-header";
import { ActivityList } from "@/components/projects/activity-list";
import { Skeleton } from "@/components/ui/skeleton";
import { recentActivity } from "@/server/queries";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <PageMain>
      <div>
        <h1 className="m-0 font-display text-[34px] font-bold tracking-[-0.02em]">Activity</h1>
        <p className="mt-1 text-muted">Deploys, domains, backups and config changes, newest first.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <AllActivity />
      </Suspense>
    </PageMain>
  );
}

async function AllActivity() {
  return <ActivityList events={await recentActivity(100)} />;
}
