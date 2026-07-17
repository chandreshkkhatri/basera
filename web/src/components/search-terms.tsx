"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { searchTerms } from "@/lib/search-terms";

/**
 * "Find this post in the group" panel: distinctive phrases from the original
 * post, each with a copy button, for pasting into Facebook's group search.
 * Shown for every listing — indispensable when the direct link is missing,
 * still handy when it isn't.
 */
export function SearchTerms({ text }: { text: string }) {
  const terms = searchTerms(text);
  const [copied, setCopied] = useState<number | null>(null);

  if (terms.length === 0) return null;

  const copy = async (term: string, i: number) => {
    try {
      await navigator.clipboard.writeText(term);
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
    } catch {
      // Clipboard unavailable (permissions/http) — the text is still visible
      // and manually selectable.
    }
  };

  return (
    <div data-testid="search-terms" className="mt-3">
      <p className="text-xs font-medium text-muted-foreground">
        Find this post in the group — search for:
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {terms.map((term, i) => (
          <button
            key={term}
            type="button"
            onClick={() => copy(term, i)}
            title="Copy search term"
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span className="truncate">{term}</span>
            {copied === i ? (
              <Check className="size-3 shrink-0 text-success" />
            ) : (
              <Copy className="size-3 shrink-0 opacity-60" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
