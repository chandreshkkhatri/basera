"use client";

import { useState } from "react";
import { AlertCircle, Calendar, FileText, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useSaves } from "@/components/saves/saves-provider";
import {
  PIPELINE_STEPS,
  SHORTLIST_CONFIG,
  pipelineIndex,
  type ShortlistItemMetadata,
  type ShortlistStatus,
} from "@/lib/shortlist";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShortlistTrackerProps {
  listingId: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function ShortlistTracker({ listingId }: ShortlistTrackerProps) {
  const { isSaved, metadata, updateMetadata } = useSaves();
  const { user, enabled, signIn } = useAuth();

  const saved = isSaved(listingId);
  const itemMeta = saved ? (metadata[listingId] ?? { status: "shortlisted" }) : null;

  const serverNotes = itemMeta?.notes ?? "";
  const serverVisitDate = itemMeta?.visitDate ?? "";
  const [notes, setNotes] = useState(serverNotes);
  const [visitDate, setVisitDate] = useState(serverVisitDate);
  const [isSaving, setIsSaving] = useState(false);

  // Reflect server changes into the edit buffers WITHOUT clobbering in-progress
  // typing: React's "adjust state during render" pattern (state, not a ref),
  // tracking each server field independently — so a change to one field never
  // resets the other's buffer, and typing (server value unchanged) is untouched.
  const [prevNotes, setPrevNotes] = useState(serverNotes);
  if (serverNotes !== prevNotes) {
    setPrevNotes(serverNotes);
    setNotes(serverNotes);
  }
  const [prevVisitDate, setPrevVisitDate] = useState(serverVisitDate);
  if (serverVisitDate !== prevVisitDate) {
    setPrevVisitDate(serverVisitDate);
    setVisitDate(serverVisitDate);
  }

  if (!saved) return null;

  // Signed out prompt card
  if (enabled && !user) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5 text-center">
        <div className="flex justify-center mb-2">
          <AlertCircle className="size-6 text-muted-foreground" />
        </div>
        <h3 className="font-display font-semibold text-sm">Shortlist Status Tracking</h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto mb-4">
          Sign in to update status, schedule visits, and write notes for this listing.
        </p>
        <Button size="sm" onClick={() => void signIn()} className="w-full sm:w-auto">
          Sign in with Google
        </Button>
      </div>
    );
  }

  const currentStatus = itemMeta?.status ?? "shortlisted";
  const isDeclined = currentStatus === "declined";
  const currentStepIndex = pipelineIndex(currentStatus);

  const runUpdate = async (updates: Partial<ShortlistItemMetadata>) => {
    setIsSaving(true);
    await updateMetadata(listingId, updates);
    setIsSaving(false);
  };

  const handleStatusChange = (newStatus: ShortlistStatus) => runUpdate({ status: newStatus });
  const handleSaveNotes = () => runUpdate({ notes });

  const handleVisitDateChange = (date: string) => {
    setVisitDate(date); // keep the field responsive while typing
    const complete = ISO_DATE.test(date) && !Number.isNaN(Date.parse(date));
    if (date === "") {
      // A cleared date shouldn't leave the listing stuck at "scheduled".
      const updates: Partial<ShortlistItemMetadata> = { visitDate: "" };
      if (currentStatus === "scheduled") updates.status = "contacted";
      void runUpdate(updates);
    } else if (complete) {
      const updates: Partial<ShortlistItemMetadata> = { visitDate: date };
      if (currentStatus === "shortlisted" || currentStatus === "contacted") {
        updates.status = "scheduled";
      }
      void runUpdate(updates);
    }
    // partial/invalid input: update the buffer only, don't persist
  };

  const handleDeclineToggle = () =>
    runUpdate({ status: isDeclined ? "shortlisted" : "declined" });

  return (
    <div className={cn(
      "rounded-xl border bg-card p-5 transition-all shadow-sm",
      isDeclined && "opacity-75 border-muted bg-muted/10"
    )}>
      <div className="flex items-center justify-between gap-2 border-b pb-3 mb-4">
        <div>
          <h3 className="font-display font-bold text-base flex items-center gap-2">
            <span>Pipeline Progress</span>
            {isSaving && (
              <span className="size-2 rounded-full bg-brand animate-ping" title="Saving..." />
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isDeclined ? "You passed on this listing" : "Track your rental journey"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleDeclineToggle()}
            className={cn(
              "h-8 px-2 text-xs",
              isDeclined ? "text-success hover:text-success" : "text-muted-foreground hover:text-destructive"
            )}
          >
            <Trash2 className="size-3.5 mr-1" />
            {isDeclined ? "Restore" : "Decline"}
          </Button>
        </div>
      </div>

      {!isDeclined && (
        <div className="mb-6">
          {/* Stepper Line */}
          <div className="relative flex items-center justify-between w-full">
            {/* Background line */}
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border -translate-y-1/2 z-0" />

            {/* Active progress line fill */}
            <div
              className="absolute top-1/2 left-0 h-0.5 bg-brand -translate-y-1/2 z-0 transition-all duration-300"
              style={{
                width: `${currentStepIndex >= 0 ? (currentStepIndex / (PIPELINE_STEPS.length - 1)) * 100 : 0}%`
              }}
            />

            {PIPELINE_STEPS.map((step, idx) => {
              const StepIcon = SHORTLIST_CONFIG[step].icon;
              const isCompleted = idx < currentStepIndex;
              const isActive = idx === currentStepIndex;
              const isPending = idx > currentStepIndex;

              return (
                <button
                  key={step}
                  onClick={() => void handleStatusChange(step)}
                  className="relative z-10 flex flex-col items-center group focus:outline-none"
                  aria-label={`Mark as ${SHORTLIST_CONFIG[step].label}`}
                >
                  <div className={cn(
                    "flex items-center justify-center size-8 rounded-full border transition-all duration-200",
                    isCompleted && "bg-brand border-brand text-brand-foreground shadow-sm shadow-brand/20",
                    isActive && "bg-background border-brand text-brand ring-2 ring-brand/20 scale-110",
                    isPending && "bg-background border-border text-muted-foreground group-hover:border-muted-foreground/60"
                  )}>
                    <StepIcon className="size-3.5" />
                  </div>
                  <span className={cn(
                    "mt-2 text-[10px] font-medium transition-colors hidden sm:block",
                    isActive && "text-brand font-semibold",
                    isCompleted && "text-foreground",
                    isPending && "text-muted-foreground group-hover:text-foreground"
                  )}>
                    {SHORTLIST_CONFIG[step].label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Mobile Current Status Display */}
          <div className="mt-3 text-center sm:hidden">
            <span className="text-xs font-semibold text-brand bg-brand/10 px-2.5 py-1 rounded-full">
              Status: {SHORTLIST_CONFIG[currentStatus].label}
            </span>
          </div>
        </div>
      )}

      {isDeclined && (
        <div className="mb-4 text-center py-2 bg-muted/30 rounded-lg text-xs text-muted-foreground">
          This flat is marked as declined. Restore it to continue tracking.
        </div>
      )}

      {/* Inputs Form */}
      {!isDeclined && (
        <div className="space-y-4 pt-1">
          {/* Visit date selection */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="visit-date" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Calendar className="size-3.5 text-muted-foreground" />
              <span>Schedule Visit Date</span>
            </label>
            <input
              type="date"
              id="visit-date"
              value={visitDate}
              onChange={(e) => handleVisitDateChange(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Notes area */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pipeline-notes" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <FileText className="size-3.5 text-muted-foreground" />
              <span>Notes (Rent negotiations, deposit details, amenities)</span>
            </label>
            <textarea
              id="pipeline-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void handleSaveNotes()}
              placeholder="e.g. Deposit is 40k. Landlord matches my vibe. Moving date negotiable..."
              className="flex min-h-17.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleSaveNotes()}
                className="h-7 text-xs px-2.5"
              >
                Save notes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
