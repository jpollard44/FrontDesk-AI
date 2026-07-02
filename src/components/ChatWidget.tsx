"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatWidgetProps {
  businessName: string;
  accentColor: string;
  suggestedQuestions: string[];
  /** demo mode */
  slug?: string;
  /** production widget mode */
  embedKey?: string;
  /** fill available height instead of fixed card height (used in the iframe) */
  fullHeight?: boolean;
}

export default function ChatWidget({
  businessName,
  accentColor,
  suggestedQuestions,
  slug,
  embedKey,
  fullHeight,
}: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Hi! I'm the ${businessName} virtual assistant. I can answer questions about our hours, services, and more — how can I help?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [captured, setCaptured] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, showCapture]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    setInput("");
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, embedKey, messages: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong — please try again.");
        setBusy(false);
        return;
      }

      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: copy[copy.length - 1].content + chunk,
          };
          return copy;
        });
      }
    } catch {
      setError("Connection lost — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCapture(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/capture-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        embedKey,
        name: form.get("name"),
        phone: form.get("phone"),
        reason: form.get("reason") || undefined,
      }),
    });
    if (res.ok) {
      setCaptured(true);
      setShowCapture(false);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Got it — thanks! The team will reach out to you shortly. 👋",
        },
      ]);
    }
  }

  return (
    <div
      className="fd-widget"
      style={
        {
          "--fd-accent": accentColor,
          height: fullHeight ? "100%" : undefined,
        } as React.CSSProperties
      }
    >
      <div className="fd-header">
        <div className="fd-header-dot" />
        <div>
          <div className="fd-header-title">{businessName}</div>
          <div className="fd-header-sub">AI assistant · replies instantly</div>
        </div>
      </div>

      <div className="fd-messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`fd-msg fd-msg-${m.role}`}>
            {m.content || <span className="fd-typing">…</span>}
          </div>
        ))}

        {showCapture && (
          <form className="fd-capture" onSubmit={submitCapture}>
            <div className="fd-capture-title">Leave your details</div>
            <input name="name" placeholder="Your name" required maxLength={200} />
            <input name="phone" placeholder="Phone number" required minLength={7} maxLength={40} />
            <input name="reason" placeholder="What do you need help with? (optional)" maxLength={1000} />
            <div className="fd-capture-actions">
              <button type="submit" className="fd-btn-primary">Send</button>
              <button type="button" className="fd-btn-ghost" onClick={() => setShowCapture(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {error && <div className="fd-error">{error}</div>}
      </div>

      {messages.length <= 1 && suggestedQuestions.length > 0 && (
        <div className="fd-suggestions">
          {suggestedQuestions.map((q) => (
            <button key={q} onClick={() => send(q)} disabled={busy}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="fd-inputbar">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask anything…"
          disabled={busy}
          maxLength={2000}
        />
        <button className="fd-send" onClick={() => send(input)} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>

      {!captured && !showCapture && (
        <button className="fd-capture-link" onClick={() => setShowCapture(true)}>
          📞 Prefer a callback? Leave your details
        </button>
      )}
      <div className="fd-footer">Powered by FrontDesk AI</div>
    </div>
  );
}
