"use client";

import { useState, useEffect } from "react";
import { 
  Bookmark, 
  MessageSquare, 
  Calendar, 
  Eye, 
  CheckCircle,
  FileText, 
  Trash2, 
  ChevronRight,
  AlertCircle
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useSaves, type ShortlistStatus, type ShortlistItemMetadata } from "@/components/saves/saves-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ShortlistTrackerProps {
  listingId: number;
}

const PIPELINE_STEPS = [
  { status: "shortlisted" as ShortlistStatus, label: "Saved", icon: Bookmark },
  { status: "contacted" as ShortlistStatus, label: "Contacted", icon: MessageSquare },
  { status: "scheduled" as ShortlistStatus, label: "Scheduled", icon: Calendar },
  { status: "visited" as ShortlistStatus, label: "Visited", icon: Eye },
  { status: "booked" as ShortlistStatus, label: "Booked", icon: CheckCircle },
];

export function ShortlistTracker({ listingId }: ShortlistTrackerProps) {
  const { isSaved, metadata, updateMetadata } = useSaves();
  const { user, enabled, signIn } = useAuth();
  
  const saved = isSaved(listingId);
  const itemMeta = saved ? (metadata[listingId] ?? { status: "shortlisted" }) : null;

  const [notes, setNotes] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Sync state with Firestore updates
  useEffect(() => {
    if (itemMeta) {
      setNotes(itemMeta.notes ?? "");
      setVisitDate(itemMeta.visitDate ?? "");
    }
  }, [itemMeta]);

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

  // Find index of current status in stepper
  const currentStepIndex = PIPELINE_STEPS.findIndex((s) => s.status === currentStatus);

  const handleStatusChange = async (newStatus: ShortlistStatus) => {
    setIsSaving(true);
    await updateMetadata(listingId, { status: newStatus });
    setIsSaving(false);
  };

  const handleSaveNotes = async () => {
    setIsSaving(true);
    await updateMetadata(listingId, { notes });
    setIsSaving(false);
  };

  const handleVisitDateChange = async (date: string) => {
    setVisitDate(date);
    setIsSaving(true);
    
    // Automatically promote status to "scheduled" if they set a visit date but haven't got past that phase
    const updates: Partial<ShortlistItemMetadata> = { visitDate: date };
    if (currentStatus === "shortlisted" || currentStatus === "contacted") {
      updates.status = "scheduled";
    }
    
    await updateMetadata(listingId, updates);
    setIsSaving(false);
  };

  const handleDeclineToggle = async () => {
    setIsSaving(true);
    if (isDeclined) {
      // Revert to shortlisted
      await updateMetadata(listingId, { status: "shortlisted" });
    } else {
      await updateMetadata(listingId, { status: "declined" });
    }
    setIsSaving(false);
  };

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
            onClick={handleDeclineToggle}
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
              const StepIcon = step.icon;
              const isCompleted = idx < currentStepIndex;
              const isActive = idx === currentStepIndex;
              const isPending = idx > currentStepIndex;

              return (
                <button
                  key={step.status}
                  onClick={() => void handleStatusChange(step.status)}
                  className="relative z-10 flex flex-col items-center group focus:outline-none"
                  aria-label={`Mark as ${step.label}`}
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
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>
          
          {/* Mobile Current Status Display */}
          <div className="mt-3 text-center sm:hidden">
            <span className="text-xs font-semibold text-brand bg-brand/10 px-2.5 py-1 rounded-full">
              Status: {PIPELINE_STEPS[currentStepIndex]?.label ?? "Shortlisted"}
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
              onChange={(e) => void handleVisitDateChange(e.target.value)}
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
              className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
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
