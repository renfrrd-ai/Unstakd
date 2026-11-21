import type { Metadata } from "next";
import { Suspense } from "react";
import { PageMain, PageTitle } from "@/components/layout/page";
import { ActivityList } from "@/components/projects/activity-list";
import { Skeleton } from "@/components/ui/skeleton";
import { recentActivity } from "@/server/queries";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <PageMain className="gap-6">
      <PageTitle title="Activity" description="Deploys, domains, backups and config changes, newest first." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <AllActivity />
      </Suspense>
    </PageMain>
  );
}

async function AllActivity() {
  return <ActivityList events={await recentActivity(100)} />;
}
