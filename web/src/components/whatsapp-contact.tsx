import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Click-to-chat with the poster's number (extracted from the post text), plus a
 * desktop-only QR of the same wa.me link so someone on a computer can scan it
 * and open the chat in WhatsApp on their phone. Rendered only when a valid
 * number was found. `qrSvg` is generated on the server (see lib/qr) so no QR
 * library reaches the client.
 */
export function WhatsAppContact({
  href,
  qrSvg,
  phoneDisplay,
}: {
  href: string;
  qrSvg: string;
  phoneDisplay: string;
}) {
  return (
    <div data-testid="whatsapp-contact" className="rounded-xl border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">Message the poster on WhatsApp</p>
          <p className="text-sm text-muted-foreground">
            Chat directly about this listing —{" "}
            <span className="tabular-nums">{phoneDisplay}</span>
          </p>
        </div>
        <Button
          asChild
          size="lg"
          className="w-full shrink-0 bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90 sm:w-auto"
        >
          <a href={href} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-4" />
            Message on WhatsApp
          </a>
        </Button>
      </div>

      {/* Desktop-only: on a phone the button already opens the app, so the QR
          (a "continue on your phone" affordance) only earns its space on ≥sm. */}
      <div className="mt-4 hidden items-center gap-4 border-t pt-4 sm:flex">
        <div
          aria-hidden
          className="shrink-0 rounded-lg bg-white p-2 [&>svg]:block [&>svg]:size-28"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="text-sm">
          <p className="font-medium">On a computer?</p>
          <p className="text-muted-foreground">
            Scan this code to open the chat in WhatsApp on your phone.
          </p>
        </div>
      </div>
    </div>
  );
}
