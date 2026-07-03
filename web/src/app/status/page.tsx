import {
  getListingCounts,
  getRecentRuns,
  getSourceHealth,
} from "@/db/queries/status";
import { SourceBadge } from "@/components/source-badge";
import { PostedAgo } from "@/components/posted-ago";
import { cn } from "@/lib/utils";

// Always reflect the latest ingestion state.
export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  success: "text-emerald-600",
  running: "text-sky-600",
  error: "text-destructive",
  quota_exceeded: "text-amber-600",
};

function durationLabel(run: {
  startedAt: Date;
  finishedAt: Date | null;
}): string {
  if (!run.finishedAt) return "—";
  const secs = Math.round(
    (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) /
      1000,
  );
  return secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m`;
}

export default async function StatusPage() {
  const [health, counts, runs] = await Promise.all([
    getSourceHealth(),
    getListingCounts(),
    getRecentRuns(20),
  ]);

  const totalBySource = new Map<string, number>();
  for (const c of counts) {
    totalBySource.set(c.source, (totalBySource.get(c.source) ?? 0) + c.count);
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Ingestion status
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Health of each scraper and the most recent runs.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {health.length === 0 && (
          <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
        )}
        {health.map((run) => (
          <div key={run.source} className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <SourceBadge source={run.source} />
              <span
                className={cn(
                  "text-xs font-medium capitalize",
                  STATUS_COLOR[run.status] ?? "text-muted-foreground",
                )}
              >
                {run.status.replace("_", " ")}
              </span>
            </div>
            <p className="mt-3 text-2xl font-semibold">
              {(totalBySource.get(run.source) ?? 0).toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-muted-foreground">listings total</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Last run <PostedAgo date={run.startedAt} /> · +{run.postsNew} new
            </p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Recent runs
        </h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 text-right font-medium">Seen</th>
                <th className="px-3 py-2 text-right font-medium">New</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <SourceBadge source={run.source} />
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground">
                    {run.target}
                    {run.error && (
                      <span
                        className="ml-1 block truncate text-xs text-destructive"
                        title={run.error}
                      >
                        {run.error}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    <PostedAgo date={run.startedAt} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {durationLabel(run)}
                  </td>
                  <td className="px-3 py-2 text-right">{run.postsSeen}</td>
                  <td className="px-3 py-2 text-right">{run.postsNew}</td>
                  <td
                    className={cn(
                      "px-3 py-2 font-medium capitalize",
                      STATUS_COLOR[run.status] ?? "",
                    )}
                  >
                    {run.status.replace("_", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
