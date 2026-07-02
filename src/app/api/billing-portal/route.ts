import { NextRequest } from "next/server";
import Stripe from "stripe";
import { supabase, supabaseConfigured } from "@/lib/supabase";

// Stripe customer portal — self-serve billing/cancellation, zero code to
// maintain. Keeps the "no contract, cancel anytime" promise honest.
export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !supabaseConfigured()) {
    return Response.json({ error: "Not configured" }, { status: 503 });
  }

  let key: string | undefined;
  try {
    ({ key } = await req.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!key) return Response.json({ error: "key required" }, { status: 400 });

  const { data: client } = await supabase()
    .from("clients")
    .select("stripe_customer_id")
    .eq("embed_key", key)
    .maybeSingle();
  if (!client?.stripe_customer_id) {
    return Response.json({ error: "No billing account found" }, { status: 404 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.billingPortal.sessions.create({
    customer: client.stripe_customer_id,
    return_url: `${appUrl}/dashboard/${key}`,
  });

  return Response.json({ url: session.url });
}
