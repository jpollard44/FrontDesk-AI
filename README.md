# FrontDesk AI

A white-labeled **AI receptionist for local service businesses** (dentists, HVAC, med spas, plumbers). It answers customer questions on the business's website 24/7, captures after-hours leads, and emails the owner a summary — sold at **$150/month**, self-serve, no contract.

**Stack:** Next.js 14 · TypeScript · Supabase · Claude API · Stripe · Vercel (+ Vercel Cron)

## How it works — four components

```
[1. Lead Engine]          [2. Demo Generator]         [3. Conversion]             [4. Production Bot]
find local businesses  →  scrape site + Claude   →   demo/{slug} personalized →  Stripe checkout →
with visible gaps         builds bot config           demo page + pitch           auto-provisioned widget
```

One Supabase project backs all four. One Next.js app serves the demo pages, checkout, and the embeddable widget.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in ANTHROPIC_API_KEY at minimum
npm run dev
```

Open http://localhost:3000/demo/sunrise-dental-pasadena — a seeded sample demo that works **without Supabase or Stripe** (chat requires only `ANTHROPIC_API_KEY`).

### Full setup

1. **Supabase** — create a project, run `supabase/schema.sql` in the SQL editor, set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
2. **Stripe** — create a $150/month recurring price, set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and point a webhook at `/api/stripe/webhook` (events: `checkout.session.completed`, `customer.subscription.deleted`), set `STRIPE_WEBHOOK_SECRET`.
3. **Deploy to Vercel** — `vercel.json` schedules the nightly demo-expiry cron (`CRON_SECRET` required).

## Generate a demo for a real business

```bash
npm run generate-demo -- https://some-local-business.com
```

This scrapes their site, runs gap detection + outreach-hook generation (Lead Engine), builds the bot config with Claude (Demo Generator), and creates a live page at `/demo/{slug}` — the artifact you email to the prospect. QA every demo before sending it.

## Production widget

When a demo converts via Stripe checkout, the webhook promotes the demo config to a `clients` row and mints an embed key. The client installs:

```html
<script src="https://YOUR-DOMAIN/embed.js" data-client="EMBED_KEY" async></script>
```

## Guardrails (baked into every bot)

- Never gives medical / legal / financial advice — clinical questions are deflected to the office phone.
- Never invents prices, availability, or insurance coverage determinations — answers only from the per-business knowledge base, otherwise escalates and offers lead capture.
- Always identifies itself as an AI assistant (California bot-disclosure compliant).

## Models & cost

- **Chat:** Haiku (`claude-haiku-4-5`) — a low-traffic local site costs ~$2–8/month in API usage.
- **Config generation & enrichment:** Sonnet (`claude-sonnet-5`) — one-shot per lead, quality matters.

Both are overridable via `CHAT_MODEL` / `CONFIG_MODEL` env vars.

## Repo map

```
supabase/schema.sql           all tables: leads, demos, clients, conversations, captured_leads, outreach_log
scripts/generate-demo.ts      CLI: business URL → live demo page
src/lib/scrape.ts             homepage + contact page scraper, chat-widget gap detection
src/lib/enrich.ts             Claude lead enrichment (gaps + outreach hook)
src/lib/generate-config.ts    Claude bot-config generation (structured outputs)
src/lib/config.ts             BusinessConfig schema + system-prompt builder (guardrails live here)
src/app/demo/[slug]/          personalized demo page: chat + pitch + pricing + checkout
src/app/widget/[key]/         production widget (iframe content)
src/app/api/chat/             streaming chat endpoint (rate-limited, conversation logging)
src/app/api/capture-lead/     lead capture → captured_leads
src/app/api/checkout/         Stripe Checkout session
src/app/api/stripe/webhook/   auto-provisioning on subscription
src/app/api/cron/cleanup/     demo expiry cleanup (Vercel cron)
public/embed.js               one-line install script for client sites
```

## Roadmap

- **Week 2 (manual sales sprint):** send 20–30 personal emails with demo links; instrument demo opens / messages / checkout clicks.
- **Week 3 (close the loop):** onboarding form after checkout, lead-notification emails (instant + morning digest), day-1 email.
- **Week 4 (scale):** Outscraper pipeline → batch enrichment → batch demo generation; weekly client digest cron; outreach automation (CAN-SPAM compliant, separate sending domain).
- **v1.1:** Google review response drafting with one-click owner approval.
