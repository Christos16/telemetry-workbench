import { Dashboard } from "@/components/dashboard";
import { getLogs, getOverview, getTraces } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [overview, traces, logs] = await Promise.all([
    getOverview(60),
    getTraces({ rangeMinutes: 60, limit: 50, status: "all" }),
    getLogs({ rangeMinutes: 60, limit: 50 }),
  ]);

  return <Dashboard initialOverview={overview} initialTraces={traces} initialLogs={logs} />;
}
