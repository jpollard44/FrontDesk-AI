import { notFound } from "next/navigation";
import ChatWidget from "@/components/ChatWidget";
import CheckoutButton from "@/components/CheckoutButton";
import { BusinessConfigSchema, type BusinessConfig } from "@/lib/config";
import { SAMPLE_CONFIG, SAMPLE_SLUG } from "@/lib/sample-demo";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function loadDemo(slug: string): Promise<{ config: BusinessConfig; expired: boolean } | null> {
  if (supabaseConfigured()) {
    const { data } = await supabase()
      .from("demos")
      .select("config, expires_at")
      .eq("slug", slug)
      .maybeSingle();
    if (data) {
      // Funnel signal: mark the lead as having visited their demo.
      await supabase()
        .from("demos")
        .update({ last_visited_at: new Date().toISOString() })
        .eq("slug", slug);
      return {
        config: BusinessConfigSchema.parse(data.config),
        expired: new Date(data.expires_at) < new Date(),
      };
    }
  }
  if (slug === SAMPLE_SLUG) return { config: SAMPLE_CONFIG, expired: false };
  return null;
}

export default async function DemoPage({ params }: { params: { slug: string } }) {
  const demo = await loadDemo(params.slug);
  if (!demo) notFound();
  const { config, expired } = demo;

  return (
    <>
      <header className="demo-hero container">
        <span className="demo-eyebrow">Live demo · built for you</span>
        <h1>
          Here&apos;s what an AI receptionist looks like for <br />
          {config.business_name}
        </h1>
        <p>
          It already knows your hours, services{config.insurance_payment.length ? ", and insurance info" : ""} —
          all pulled from your website. Try asking it anything a customer would.
        </p>
      </header>

      <section className="demo-main container">
        {expired ? (
          <div className="price-box">
            <h3>This demo has expired</h3>
            <p className="fine-print">
              Want a fresh one? Email us and we&apos;ll spin it back up in minutes.
            </p>
          </div>
        ) : (
          <ChatWidget
            businessName={config.business_name}
            accentColor={config.widget_color}
            suggestedQuestions={config.suggested_questions.slice(0, 3)}
            slug={params.slug}
          />
        )}
      </section>

      <section className="pitch">
        <div className="container">
          <h2>What {config.business_name} gets</h2>
          <div className="pitch-grid">
            <div className="pitch-card">
              <div className="emoji">🌙</div>
              <h3>Answers 24/7</h3>
              <p>
                Hours, services, insurance, directions — answered instantly, even at 11pm when your
                office is closed and a competitor&apos;s isn&apos;t.
              </p>
            </div>
            <div className="pitch-card">
              <div className="emoji">📞</div>
              <h3>Captures every lead</h3>
              <p>
                When someone wants a callback, it collects their name, number, and reason — and you
                get a summary each morning.
              </p>
            </div>
            <div className="pitch-card">
              <div className="emoji">🛡️</div>
              <h3>Stays in its lane</h3>
              <p>
                It never gives medical advice, never invents prices, and always identifies itself as
                an AI assistant. Anything it doesn&apos;t know, it routes to you.
              </p>
            </div>
            <div className="pitch-card">
              <div className="emoji">⚡</div>
              <h3>Live in a day</h3>
              <p>
                One line of code on your site (we&apos;ll send instructions your web person can apply
                in five minutes). No contract, cancel anytime.
              </p>
            </div>
          </div>

          <div className="price-box">
            <div className="amount">
              $150<span>/month</span>
            </div>
            <ul>
              <li>Unlimited customer questions on your website</li>
              <li>After-hours lead capture with morning summaries</li>
              <li>Trained on your hours, services & policies — kept up to date</li>
              <li>Setup included · no contract · cancel anytime</li>
            </ul>
            <CheckoutButton slug={params.slug} />
            <p className="fine-print">Secure checkout via Stripe. Live on your site within 1 business day.</p>
          </div>

          <div className="faq">
            <h2>Common questions</h2>
            <details>
              <summary>Will it say something wrong to my customers?</summary>
              <p>
                It only answers from the facts we load about your business. When it doesn&apos;t know
                something, it says so and offers to take a message — it never guesses prices,
                availability, or medical questions.
              </p>
            </details>
            <details>
              <summary>How does it get on my website?</summary>
              <p>
                We send you a single line of code (like a Google Analytics tag). Paste it in — or
                forward our instructions to your web person — and the chat bubble appears.
              </p>
            </details>
            <details>
              <summary>Can I change what it says?</summary>
              <p>
                Yes. You can update hours, services, and FAQ answers anytime — changes go live
                immediately.
              </p>
            </details>
            <details>
              <summary>What if I want to cancel?</summary>
              <p>
                Cancel anytime from the billing portal — no contract, no fees. The widget simply
                turns off at the end of the billing period.
              </p>
            </details>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        FrontDesk AI · AI assistants for local businesses · This assistant identifies itself as AI.
      </footer>
    </>
  );
}
