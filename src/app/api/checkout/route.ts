import { NextRequest } from "next/server";
import Stripe from "stripe";

// Conversion step: demo page → Stripe Checkout for the $150/month subscription.
export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return Response.json({ error: "Checkout not configured yet" }, { status: 503 });
  }

  let slug: string | undefined;
  try {
    ({ slug } = await req.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!slug) return Response.json({ error: "slug required" }, { status: 400 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    metadata: { demo_slug: slug },
    subscription_data: { metadata: { demo_slug: slug } },
    success_url: `${appUrl}/demo/${slug}?checkout=success`,
    cancel_url: `${appUrl}/demo/${slug}?checkout=canceled`,
    allow_promotion_codes: true,
  });

  return Response.json({ url: session.url });
}
