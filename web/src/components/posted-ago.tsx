import { postedAgo } from "@/lib/format";

export function PostedAgo({
  date,
  className,
}: {
  date: Date | string | null | undefined;
  className?: string;
}) {
  if (!date) {
    return <span className={className}>unknown</span>;
  }

  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    return <span className={className}>unknown</span>;
  }

  return (
    <time dateTime={d.toISOString()} title={d.toLocaleString()} className={className}>
      {postedAgo(d)}
    </time>
  );
}
