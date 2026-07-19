"use client";

import { useEffect, useState, useMemo } from "react";
import type { ListingRow } from "@/db/queries/listings";
import { useAuth } from "@/components/auth/auth-provider";
import { useSaves, type ShortlistStatus, type ShortlistItemMetadata } from "@/components/saves/saves-provider";
import { ShortlistTracker } from "@/components/saves/shortlist-tracker";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription,
  SheetTrigger 
} from "@/components/ui/sheet";
import { 
  Heart, 
  Calendar, 
  FileText, 
  MessageSquare, 
  Check, 
  Trash2, 
  ExternalLink,
  Edit,
  ArrowRight,
  Info,
  Unlock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { formatRentAmount } from "@/lib/format";
import { furnishingLabel, genderLabel } from "@/lib/normalize";
import { SourceBadge } from "@/components/source-badge";
import { PostedAgo } from "@/components/posted-ago";
import { DistanceChip } from "@/components/distance-chip";
import { ListingMedia } from "@/components/listing-media";
import Link from "next/link";

type TabType = "all" | "active" | "booked" | "declined";

const PIPELINE_STATUS_INFO: Record<ShortlistStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"; colorClass: string }> = {
  shortlisted: { label: "Saved", variant: "secondary", colorClass: "bg-muted text-muted-foreground" },
  contacted: { label: "Contacted", variant: "secondary", colorClass: "bg-info/10 text-info border border-info/20" },
  scheduled: { label: "Visit Scheduled", variant: "secondary", colorClass: "bg-warning/10 text-warning border border-warning/20" },
  visited: { label: "Visited Flat", variant: "secondary", colorClass: "bg-brand/10 text-brand font-medium border border-brand/20" },
  applied: { label: "Applied", variant: "secondary", colorClass: "bg-brand/20 text-brand border border-brand/30" },
  booked: { label: "Booked Flat 🎉", variant: "secondary", colorClass: "bg-success/15 text-success font-semibold border-success/30 border" },
  declined: { label: "Declined", variant: "destructive", colorClass: "bg-destructive/10 text-destructive" },
};

export function SavedScreen() {
  const { savedIds, metadata, ready, updateMetadata } = useSaves();
  const { enabled, user, signIn } = useAuth();
  const [rows, setRows] = useState<ListingRow[] | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("active");
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null);

  const signedOutGate = enabled && !user;
  const ids = useMemo(() => [...savedIds], [savedIds]);

  useEffect(() => {
    if (!ready || ids.length === 0) {
      setRows([]);
      return;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/listings?ids=${ids.join(",")}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { listings: ListingRow[] };
        setRows(data.listings ?? []);
      } catch {
        if (!ctrl.signal.aborted) setRows([]);
      }
    })();
    return () => ctrl.abort();
  }, [ready, ids]);

  // Compute tabs count
  const counts = useMemo(() => {
    const stats = { all: 0, active: 0, booked: 0, declined: 0 };
    if (!rows) return stats;
    
    rows.forEach((row) => {
      const status = metadata[row.id]?.status ?? "shortlisted";
      stats.all++;
      if (status === "booked") {
        stats.booked++;
      } else if (status === "declined") {
        stats.declined++;
      } else {
        stats.active++;
      }
    });
    return stats;
  }, [rows, metadata]);

  // Filter listings based on active tab
  const filteredListings = useMemo(() => {
    if (!rows) return [];
    return rows.filter((row) => {
      const status = metadata[row.id]?.status ?? "shortlisted";
      if (activeTab === "all") return true;
      if (activeTab === "booked") return status === "booked";
      if (activeTab === "declined") return status === "declined";
      // active pipeline: everything except booked and declined
      return status !== "booked" && status !== "declined";
    });
  }, [rows, metadata, activeTab]);

  const missing = ready && ids.length > 0 && rows !== null ? ids.length - rows.length : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your Shortlist Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your rental pipeline, schedule visits, and write notes to find your perfect flat.
            {missing > 0 &&
              ` ${missing} saved ${missing === 1 ? "listing is" : "listings are"} no longer available.`}
          </p>
        </div>
      </div>

      {/* Lock banner for signed-out users */}
      {signedOutGate && (
        <div className="rounded-xl border border-border bg-accent/40 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Unlock className="size-5 text-brand shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm">Unlock Pipeline Tracking</h3>
              <p className="text-xs text-muted-foreground max-w-lg">
                Sign in with Google to write personal notes, schedule flat visits, track contacted landlords, and keep your checklist synced across devices.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => void signIn()} className="shrink-0">
            Sign in with Google
          </Button>
        </div>
      )}

      {/* Main dashboard content */}
      {ready && ids.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          hint="Tap the heart on any listing in the feed or map to save it to your pipeline."
        />
      ) : !ready || rows === null ? (
        // Loading state
        <div className="flex flex-col gap-4">
          <div className="h-10 w-80 bg-muted rounded-lg" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Saved listings unavailable"
          hint="Your saved posts are no longer live. Browse the feed to shortlist new ones."
        />
      ) : (
        <div className="space-y-6">
          {/* Tab selector */}
          <div className="flex border-b border-border overflow-x-auto whitespace-nowrap gap-6 text-sm font-medium">
            <button
              onClick={() => setActiveTab("active")}
              className={`pb-3 border-b-2 transition-all ${
                activeTab === "active"
                  ? "border-brand text-brand font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Active Pipeline ({counts.active})
            </button>
            <button
              onClick={() => setActiveTab("booked")}
              className={`pb-3 border-b-2 transition-all ${
                activeTab === "booked"
                  ? "border-brand text-brand font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Booked Flats ({counts.booked})
            </button>
            <button
              onClick={() => setActiveTab("declined")}
              className={`pb-3 border-b-2 transition-all ${
                activeTab === "declined"
                  ? "border-brand text-brand font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Declined ({counts.declined})
            </button>
            <button
              onClick={() => setActiveTab("all")}
              className={`pb-3 border-b-2 transition-all ${
                activeTab === "all"
                  ? "border-brand text-brand font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              All Saved ({counts.all})
            </button>
          </div>

          {/* Listings List */}
          {filteredListings.length === 0 ? (
            <EmptyState
              title="No listings in this view"
              hint={
                activeTab === "active"
                  ? "Move shortlisted posts through the pipeline or save new ones."
                  : activeTab === "booked"
                  ? "Uncover your dream flat and mark it as booked!"
                  : "No declined listings yet."
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredListings.map((listing) => {
                const itemMeta = metadata[listing.id] ?? { status: "shortlisted" };
                const rent = formatRentAmount(listing.rent);
                const place = [listing.location, listing.city].filter(Boolean).join(", ") || "Location n/a";
                const info = PIPELINE_STATUS_INFO[itemMeta.status] ?? PIPELINE_STATUS_INFO.shortlisted;

                return (
                  <Card key={listing.id} className="overflow-hidden hover:border-brand/40 transition-colors">
                    <CardContent className="p-4 flex flex-col md:flex-row gap-5">
                      {/* Left: Thumbnail image & save heart */}
                      <div className="relative aspect-16/10 md:w-48 md:h-32 rounded-lg overflow-hidden shrink-0">
                        <ListingMedia source={listing.source} glyphClassName="text-4xl" />
                        <SourceBadge source={listing.source} className="absolute top-2 right-2" />
                      </div>

                      {/* Middle: Details & pipeline updates */}
                      <div className="flex-1 flex flex-col min-w-0 justify-between gap-2.5">
                        <div>
                          <div className="flex flex-wrap items-baseline gap-2 justify-between md:justify-start">
                            {rent ? (
                              <p className="font-display text-xl font-bold tracking-tight">
                                {rent}
                                <span className="ml-0.5 text-xs font-normal text-muted-foreground">/mo</span>
                              </p>
                            ) : (
                              <p className="font-display text-sm font-semibold text-muted-foreground">Rent n/a</p>
                            )}
                            <Badge variant={info.variant} className={`text-xs px-2 py-0.5 rounded-md ${info.colorClass}`}>
                              {info.label}
                            </Badge>
                          </div>

                          <p className="text-sm font-medium truncate mt-1 text-foreground max-w-xl">
                            <Link href={`/listings/${listing.id}`} className="hover:underline">
                              {listing.bhk ? `${listing.bhk} · ` : ""}{place}
                            </Link>
                          </p>
                          
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                            {listing.originalText}
                          </p>
                        </div>

                        {/* Pipeline tags like visit date and notes */}
                        {user && (
                          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground border-t pt-2.5">
                            {itemMeta.visitDate && (
                              <div className="flex items-center gap-1 text-warning font-medium bg-warning/5 px-2 py-0.5 rounded-md">
                                <Calendar className="size-3.5" />
                                <span>Visit: {itemMeta.visitDate}</span>
                              </div>
                            )}
                            {itemMeta.notes && (
                              <div className="flex items-center gap-1 truncate max-w-sm">
                                <FileText className="size-3.5 shrink-0" />
                                <span className="truncate italic">"{itemMeta.notes}"</span>
                              </div>
                            )}
                            {!itemMeta.visitDate && !itemMeta.notes && (
                              <span className="text-muted-foreground/60 italic">No notes or scheduled visits yet.</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: Interactive Stepper Buttons & CTAs */}
                      <div className="flex flex-row md:flex-col items-center justify-between md:justify-center gap-3 border-t md:border-t-0 md:border-l pt-3 md:pt-0 md:pl-5 shrink-0 min-w-[150px]">
                        {user ? (
                          <>
                            {/* State guided actions */}
                            {itemMeta.status === "shortlisted" && (
                              <Button
                                size="sm"
                                className="w-full h-8.5 font-medium text-xs gap-1"
                                onClick={() => void updateMetadata(listing.id, { status: "contacted" })}
                              >
                                <span>Mark Contacted</span>
                                <ArrowRight className="size-3.5" />
                              </Button>
                            )}

                            {itemMeta.status === "contacted" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-8.5 border-warning/30 hover:bg-warning/5 text-warning font-medium text-xs gap-1"
                                onClick={() => void setSelectedListingId(listing.id)}
                              >
                                <span>Schedule Visit</span>
                                <Calendar className="size-3.5" />
                              </Button>
                            )}

                            {itemMeta.status === "scheduled" && (
                              <Button
                                size="sm"
                                className="w-full h-8.5 font-medium text-xs gap-1 bg-brand text-brand-foreground hover:bg-brand/90"
                                onClick={() => void updateMetadata(listing.id, { status: "visited" })}
                              >
                                <span>Mark Visited</span>
                                <Check className="size-3.5" />
                              </Button>
                            )}

                            {(itemMeta.status === "visited" || itemMeta.status === "applied") && (
                              <Button
                                size="sm"
                                className="w-full h-8.5 font-medium text-xs gap-1 bg-success hover:bg-success/90 text-success-foreground"
                                onClick={() => void updateMetadata(listing.id, { status: "booked" })}
                              >
                                <span>Book Flat 🎉</span>
                              </Button>
                            )}

                            {itemMeta.status === "booked" && (
                              <div className="flex items-center gap-1 text-success text-xs font-semibold py-1">
                                <CheckCircle2 className="size-4" />
                                <span>Flat Booked!</span>
                              </div>
                            )}

                            {itemMeta.status === "declined" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-8.5 text-xs"
                                onClick={() => void updateMetadata(listing.id, { status: "shortlisted" })}
                              >
                                Restore
                              </Button>
                            )}

                            {/* Secondary trigger drawer sheet */}
                            <Sheet open={selectedListingId === listing.id} onOpenChange={(open) => !open && setSelectedListingId(null)}>
                              <SheetTrigger asChild>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="w-full h-8 px-2 text-xs"
                                  onClick={() => setSelectedListingId(listing.id)}
                                >
                                  <Edit className="size-3.5 mr-1" />
                                  Edit Pipeline
                                </Button>
                              </SheetTrigger>
                              <SheetContent side="right" className="sm:max-w-md p-6 overflow-y-auto">
                                <SheetHeader className="mb-4">
                                  <SheetTitle>Shortlist Manager</SheetTitle>
                                  <SheetDescription>
                                    Update pipeline milestones and log rent particulars.
                                  </SheetDescription>
                                </SheetHeader>
                                
                                {/* Quick Listing Reference Card */}
                                <div className="rounded-lg bg-muted/40 border p-3.5 mb-5 text-xs">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-sm">{rent ?? "Rent n/a"}</span>
                                    <SourceBadge source={listing.source} />
                                  </div>
                                  <p className="font-semibold mt-1">{listing.bhk ? `${listing.bhk} · ` : ""}{place}</p>
                                  <p className="text-muted-foreground line-clamp-2 mt-1.5 leading-normal">{listing.originalText}</p>
                                  <div className="mt-3 flex justify-between items-center">
                                    <Link href={`/listings/${listing.id}`} className="text-brand hover:underline font-medium flex items-center gap-0.5">
                                      <span>View details page</span>
                                      <ExternalLink className="size-3" />
                                    </Link>
                                    <span className="text-[10px] text-muted-foreground">
                                      Posted <PostedAgo date={listing.postedAt} />
                                    </span>
                                  </div>
                                </div>

                                <ShortlistTracker listingId={listing.id} />
                              </SheetContent>
                            </Sheet>
                          </>
                        ) : (
                          /* Fallback for logged out user (just standard navigation link) */
                          <Button asChild size="sm" variant="outline" className="w-full h-8.5 text-xs">
                            <Link href={`/listings/${listing.id}`}>
                              View Details
                            </Link>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
