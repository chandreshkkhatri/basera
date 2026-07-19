import {
  Bookmark,
  MessageSquare,
  Calendar,
  Eye,
  FileCheck,
  CheckCircle,
  Trash2,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for the shortlist pipeline. Every surface (the detail
 * tracker, the saved dashboard, the contact button) reads statuses, labels,
 * colours, and ordering from here — so adding or relabelling a stage is a
 * one-line change and the surfaces can't drift.
 */
export type ShortlistStatus =
  | "shortlisted"
  | "contacted"
  | "scheduled"
  | "visited"
  | "applied"
  | "booked"
  | "declined";

export interface ShortlistItemMetadata {
  status: ShortlistStatus;
  notes?: string;
  visitDate?: string;
  contactedAt?: string;
  visitedAt?: string;
  bookedAt?: string;
  updatedAt?: string;
}

type StatusConfig = {
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for the status Badge. */
  colorClass: string;
};

export const SHORTLIST_CONFIG: Record<ShortlistStatus, StatusConfig> = {
  shortlisted: { label: "Saved", icon: Bookmark, colorClass: "bg-muted text-muted-foreground" },
  contacted: { label: "Contacted", icon: MessageSquare, colorClass: "bg-info/10 text-info border border-info/20" },
  scheduled: { label: "Visit Scheduled", icon: Calendar, colorClass: "bg-warning/10 text-warning border border-warning/20" },
  visited: { label: "Visited", icon: Eye, colorClass: "bg-brand/10 text-brand font-medium border border-brand/20" },
  applied: { label: "Applied", icon: FileCheck, colorClass: "bg-brand/20 text-brand border border-brand/30" },
  booked: { label: "Booked 🎉", icon: CheckCircle, colorClass: "bg-success/15 text-success font-semibold border border-success/30" },
  declined: { label: "Declined", icon: Trash2, colorClass: "bg-destructive/10 text-destructive" },
};

/**
 * The linear pipeline, in order. `declined` is a terminal off-ramp reachable
 * from anywhere, so it is deliberately NOT a step here.
 */
export const PIPELINE_STEPS: ShortlistStatus[] = [
  "shortlisted",
  "contacted",
  "scheduled",
  "visited",
  "applied",
  "booked",
];

/** Index of a status within PIPELINE_STEPS, or -1 (e.g. `declined`). */
export function pipelineIndex(status: ShortlistStatus): number {
  return PIPELINE_STEPS.indexOf(status);
}
