import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Copy, Check, Share2, Download } from "lucide-react";


const PUBLISHED_URL = "https://region9-aid-now.lovable.app";

export const Route = createFileRoute("/share")({
  head: () => ({
    meta: [
      { title: "Share – ZC E-CONNECT" },
      { name: "description", content: "Scan the QR code to open and install the ZC E-CONNECT app." },
      { property: "og:title", content: "Share – ZC E-CONNECT" },
      { property: "og:description", content: "Scan to open the Zamboanga City emergency contacts app." },
    ],
  }),
  component: SharePage,
});

function SharePage() {
  const [url, setUrl] = useState(PUBLISHED_URL);
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);


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
        await navigator.share({ title: "ZC E-CONNECT", url });
      } catch {}
    } else {
      copy();
    }
  }

  function downloadQr() {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const scale = 3;
    const size = 280 * scale;
    const source = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "region9-emergency-contacts-qr.png";
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(source)));
  }

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-6">
      <div className="max-w-md mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <h1 className="text-2xl font-bold mb-2">Share this app</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Scan the QR code with a phone camera to open and install ZC E-CONNECT.
        </p>

        <div ref={qrRef} className="bg-white rounded-2xl p-6 flex items-center justify-center shadow-lg">
          <QRCodeSVG
            value={url}
            size={280}
            level="H"
            marginSize={2}
            fgColor="#000000"
            bgColor="#ffffff"
          />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">

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

        <button
          onClick={downloadQr}
          className="mt-3 w-full flex items-center justify-center gap-2 h-12 rounded-lg bg-secondary text-secondary-foreground font-medium"
        >
          <Download className="h-4 w-4" /> Download QR code
        </button>


        <p className="mt-6 text-xs text-muted-foreground text-center">
          Tip: after opening, use your browser's "Add to Home Screen" to install.
        </p>
      </div>
    </div>
  );
}
