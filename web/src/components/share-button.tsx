"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Native share sheet on mobile (navigator.share), clipboard copy elsewhere.
 * Shares the current page URL — canonical/OG metadata makes the link unfurl
 * into a rich card in WhatsApp/Telegram.
 */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // user dismissed the sheet — nothing to do
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; the URL bar is right there
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={share}
      className="w-full sm:w-auto"
      data-testid="share-button"
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Share2 className="size-3.5" />}
      {copied ? "Link copied" : "Share"}
    </Button>
  );
}
