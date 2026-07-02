import { notFound } from "next/navigation";
import { BusinessConfigSchema } from "@/lib/config";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import DashboardSettings from "@/components/DashboardSettings";

export const dynamic = "force-dynamic";

interface CapturedLeadRow {
  name: string;
  phone: string;
  reason: string | null;
  created_at: string;
}

interface ConversationRow {
  messages: Array<{ role: string; content: string }>;
  started_at: string;
}

// Minimal client dashboard (spec's v1): conversation log, captured leads,
// KB editing, billing portal. Auth = the embed key in the URL (magic-link
// model; the day-1 email tells owners to keep it private).
export default async function DashboardPage({ params }: { params: { key: string } }) {
  if (!supabaseConfigured()) notFound();

  const db = supabase();
  const { data: client } = await db
    .from("clients")
    .select("id, config, status, notify_email, created_at")
    .eq("embed_key", params.key)
    .maybeSingle();
  if (!client || client.status !== "active") notFound();

  const config = BusinessConfigSchema.parse(client.config);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: leads }, { count: convCount }, { data: recentConvs }] = await Promise.all([
    db
      .from("captured_leads")
      .select("name, phone, reason, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client.id)
      .gte("started_at", since30d),
    db
      .from("conversations")
      .select("messages, started_at")
      .eq("client_id", client.id)
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  const capturedLeads = (leads ?? []) as CapturedLeadRow[];
  const conversations = (recentConvs ?? []) as ConversationRow[];

  return (
    <main className="dash container">
      <header className="dash-header">
        <div>
          <h1>{config.business_name}</h1>
          <p>Your AI receptionist dashboard</p>
        </div>
        <span className="dash-badge">● Active</span>
      </header>

      <section className="dash-stats">
        <div className="dash-stat">
          <div className="dash-stat-num">{capturedLeads.length}</div>
          <div className="dash-stat-label">Leads captured (last 50)</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-num">{convCount ?? 0}</div>
          <div className="dash-stat-label">Conversations (30 days)</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-num">{config.knowledge_base.length}</div>
          <div className="dash-stat-label">Answers in knowledge base</div>
        </div>
      </section>

      <section className="dash-section">
        <h2>Captured leads</h2>
        {capturedLeads.length === 0 ? (
          <p className="dash-empty">
            No leads captured yet. They&apos;ll appear here (and in your inbox) the moment a website
            visitor asks for a callback.
          </p>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {capturedLeads.map((lead, i) => (
                <tr key={i}>
                  <td>{new Date(lead.created_at).toLocaleString()}</td>
                  <td>{lead.name}</td>
                  <td>{lead.phone}</td>
                  <td>{lead.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="dash-section">
        <h2>Recent conversations</h2>
        {conversations.length === 0 ? (
          <p className="dash-empty">No conversations yet.</p>
        ) : (
          <div className="dash-convs">
            {conversations.map((conv, i) => {
              const firstUserMsg = conv.messages.find((m) => m.role === "user");
              return (
                <details key={i} className="dash-conv">
                  <summary>
                    <span>{new Date(conv.started_at).toLocaleString()}</span>
                    <span className="dash-conv-preview">
                      {firstUserMsg?.content.slice(0, 80) ?? "(no messages)"}
                    </span>
                  </summary>
                  <div className="dash-conv-messages">
                    {conv.messages.map((m, j) => (
                      <p key={j} className={`dash-conv-msg dash-conv-${m.role}`}>
                        <strong>{m.role === "user" ? "Visitor" : "Assistant"}:</strong> {m.content}
                      </p>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <DashboardSettings
        embedKey={params.key}
        initialKnowledgeBase={config.knowledge_base}
        initialNotifyEmail={client.notify_email}
        initialWidgetColor={config.widget_color}
      />

      <footer className="site-footer">
        FrontDesk AI · Need a hand? Reply to any of our emails.
      </footer>
    </main>
  );
}
