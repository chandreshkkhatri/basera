import { postedAgo } from "@/lib/format";

export function PostedAgo({
  date,
  className,
}: {
  date: Date | string;
  className?: string;
}) {
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <time dateTime={d.toISOString()} title={d.toLocaleString()} className={className}>
      {postedAgo(d)}
    </time>
  );
}
