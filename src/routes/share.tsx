import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Copy, Check, Share2 } from "lucide-react";

const PUBLISHED_URL = "https://region9-aid-now.lovable.app";

export const Route = createFileRoute("/share")({
  head: () => ({
    meta: [
      { title: "Share – Region 9 Emergency Contacts" },
      { name: "description", content: "Scan the QR code to open and install the Region 9 Emergency Contacts app." },
      { property: "og:title", content: "Share – Region 9 Emergency Contacts" },
      { property: "og:description", content: "Scan to open the Zamboanga City emergency contacts app." },
    ],
  }),
  component: SharePage,
});

function SharePage() {
  const [url, setUrl] = useState(PUBLISHED_URL);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      // Prefer the published URL for QR sharing; fall back to current origin in dev/preview
      if (host.endsWith(".lovable.app") && !host.includes("preview")) {
        setUrl(window.location.origin);
      }
    }
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Region 9 Emergency Contacts", url });
      } catch {}
    } else {
      copy();
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-6">
      <div className="max-w-md mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <h1 className="text-2xl font-bold mb-2">Share this app</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Scan the QR code with a phone camera to open and install Region 9 Emergency Contacts.
        </p>

        <div className="bg-white rounded-2xl p-6 flex items-center justify-center shadow-lg">
          <QRCodeSVG
            value={url}
            size={280}
            level="H"
            marginSize={2}
            fgColor="#000000"
            bgColor="#ffffff"
          />
        </div>

        <div className="mt-6 p-3 rounded-lg bg-muted text-sm break-all text-center">
          {url}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={copy}
            className="flex items-center justify-center gap-2 h-12 rounded-lg bg-secondary text-secondary-foreground font-medium"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            onClick={share}
            className="flex items-center justify-center gap-2 h-12 rounded-lg bg-primary text-primary-foreground font-medium"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground text-center">
          Tip: after opening, use your browser's "Add to Home Screen" to install.
        </p>
      </div>
    </div>
  );
}
