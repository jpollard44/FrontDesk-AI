"use client";

import { useState } from "react";

export default function CheckoutButton({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Checkout is not available right now — email us instead.");
      }
    } catch {
      setError("Checkout is not available right now — email us instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="cta-button" onClick={checkout} disabled={busy}>
        {busy ? "Opening checkout…" : "Get it on my site →"}
      </button>
      {error && <p className="fine-print">{error}</p>}
    </>
  );
}
