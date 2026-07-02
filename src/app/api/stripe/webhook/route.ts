import { NextRequest } from "next/server";
import Stripe from "stripe";
import { randomBytes } from "crypto";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { sendDayOneEmail } from "@/lib/notify";

// Auto-provisioning: checkout.session.completed promotes the lead's demo
// config to a production client config and mints an embed key. No sales
// call, no manual onboarding step required to go live.
export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "Not configured" }, { status: 503 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await req.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const slug = session.metadata?.demo_slug;
    if (slug && supabaseConfigured()) {
      await provisionClient({
        slug,
        stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
        stripeSubId: typeof session.subscription === "string" ? session.subscription : null,
        email: session.customer_details?.email ?? null,
      });
    }
  }

  if (event.type === "customer.subscription.deleted" && supabaseConfigured()) {
    const sub = event.data.object;
    await supabase().from("clients").update({ status: "canceled" }).eq("stripe_sub_id", sub.id);
  }

  return Response.json({ received: true });
}

async function provisionClient(args: {
  slug: string;
  stripeCustomerId: string | null;
  stripeSubId: string | null;
  email: string | null;
}) {
  const db = supabase();
  const { data: demo } = await db
    .from("demos")
    .select("id, lead_id, config")
    .eq("slug", args.slug)
    .maybeSingle();
  if (!demo) {
    console.error(`webhook: no demo found for slug ${args.slug}`);
    return;
  }

  const embedKey = randomBytes(16).toString("hex");
  const { error } = await db.from("clients").insert({
    lead_id: demo.lead_id,
    stripe_customer_id: args.stripeCustomerId,
    stripe_sub_id: args.stripeSubId,
    config: demo.config,
    status: "active",
    embed_key: embedKey,
    notify_email: args.email,
  });
  if (error) {
    console.error("client provisioning failed", error);
    return;
  }

  if (demo.lead_id) {
    await db.from("leads").update({ status: "client" }).eq("id", demo.lead_id);
  }
  if (demo.lead_id) {
    // Stop any in-flight outreach sequence — they converted.
    await db.from("sequences").update({ status: "stopped" }).eq("lead_id", demo.lead_id);
  }

  // Day-1 email: embed snippet + install guide + dashboard link.
  if (args.email) {
    const businessName =
      (demo.config as { business_name?: string } | null)?.business_name ?? "your business";
    await sendDayOneEmail({
      to: args.email,
      businessName,
      embedKey,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    });
  }
}
