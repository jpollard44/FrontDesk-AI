"use client";

import { useState } from "react";

interface Faq {
  q: string;
  a: string;
}

interface DashboardSettingsProps {
  embedKey: string;
  initialKnowledgeBase: Faq[];
  initialNotifyEmail: string | null;
  initialWidgetColor: string;
}

export default function DashboardSettings({
  embedKey,
  initialKnowledgeBase,
  initialNotifyEmail,
  initialWidgetColor,
}: DashboardSettingsProps) {
  const [kb, setKb] = useState<Faq[]>(initialKnowledgeBase);
  const [notifyEmail, setNotifyEmail] = useState(initialNotifyEmail ?? "");
  const [widgetColor, setWidgetColor] = useState(initialWidgetColor);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);

  function updateFaq(index: number, field: keyof Faq, value: string) {
    setKb((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const cleaned = kb.filter((f) => f.q.trim() && f.a.trim());
    try {
      const res = await fetch("/api/dashboard/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: embedKey,
          knowledge_base: cleaned,
          widget_color: widgetColor,
          notify_email: notifyEmail.trim() || null,
        }),
      });
      if (res.ok) {
        setKb(cleaned);
        setMessage("Saved — changes are live immediately.");
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error ?? "Could not save. Please try again.");
      }
    } catch {
      setMessage("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function openBilling() {
    setBillingBusy(true);
    try {
      const res = await fetch("/api/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: embedKey }),
      });
      const data = await res.json();
      if (res.ok && data.url) window.location.href = data.url;
      else setMessage(data.error ?? "Billing portal unavailable.");
    } catch {
      setMessage("Billing portal unavailable.");
    } finally {
      setBillingBusy(false);
    }
  }

  return (
    <section className="dash-section">
      <h2>Settings</h2>

      <div className="dash-settings-row">
        <label>
          Lead alerts go to
          <input
            type="email"
            value={notifyEmail}
            onChange={(e) => setNotifyEmail(e.target.value)}
            placeholder="you@yourbusiness.com"
          />
        </label>
        <label>
          Widget color
          <input
            type="color"
            value={widgetColor}
            onChange={(e) => setWidgetColor(e.target.value)}
          />
        </label>
        <button className="dash-btn-secondary" onClick={openBilling} disabled={billingBusy}>
          {billingBusy ? "Opening…" : "Manage billing"}
        </button>
      </div>

      <h3>Knowledge base — what your assistant can answer</h3>
      <p className="dash-empty">
        Edit answers below or add new ones. Your assistant only states facts from this list — it
        never guesses.
      </p>
      <div className="dash-kb">
        {kb.map((faq, i) => (
          <div key={i} className="dash-kb-item">
            <input
              value={faq.q}
              onChange={(e) => updateFaq(i, "q", e.target.value)}
              placeholder="Question, e.g. Do you take walk-ins?"
              maxLength={500}
            />
            <textarea
              value={faq.a}
              onChange={(e) => updateFaq(i, "a", e.target.value)}
              placeholder="The answer your assistant should give"
              rows={2}
              maxLength={2000}
            />
            <button
              className="dash-kb-remove"
              onClick={() => setKb((prev) => prev.filter((_, j) => j !== i))}
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="dash-btn-secondary"
          onClick={() => setKb((prev) => [...prev, { q: "", a: "" }])}
          disabled={kb.length >= 50}
        >
          + Add question
        </button>
      </div>

      <div className="dash-save-row">
        <button className="cta-button dash-save" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {message && <span className="dash-message">{message}</span>}
      </div>
    </section>
  );
}
