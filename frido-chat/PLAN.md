# Frido Chat: Frido's own WhatsApp platform (LimeChat replacement)

Status: **Phase 0, planning.** No code yet. Working name "Frido Chat" until a real name is chosen.

## 1. Goal

Replace LimeChat with a platform Frido owns: shared WhatsApp inbox, broadcasts, Shopify-triggered journeys and an AI agent, running on a BSP Frido picks (Karix or 360dialog). The BSP connection comes last. We build first against Meta's own WhatsApp Cloud API test number, which is free and needs no BSP.

This is a separate product from the Engine OS dashboard at the repo root. The root `CLAUDE.md` rules (single file, no build step) apply to the dashboard, not to this app.

## 2. Guardrails for the LimeChat study

- **Clean-room only.** We study LimeChat to write *our own* feature spec: which screens exist, what each workflow does, which data it needs. We do not copy LimeChat's code, JS bundles, UI assets, copy text or branding. REA's own disclaimer rules out "copying proprietary software or reproducing its protected code and assets".
- **Contract check.** Frido is a paying LimeChat customer. Someone should check whether that agreement restricts reverse engineering before any capture work starts.
- **We don't need LimeChat's internal API.** LimeChat talks to WhatsApp through Meta's public, documented APIs. Our app talks to the same APIs through Karix or 360dialog. The useful output of the study is a feature inventory and UX flows, not their endpoints.
- **Frido's own data.** Contacts, opt-ins, templates, flows and chat history inside LimeChat belong to Frido. Use LimeChat's own exports for migration.
- **Captures contain secrets and customer data.** HAR files carry session cookies and customer phone numbers and messages. They never get committed (see `.gitignore`), and they're deleted after the spec is written.

## 3. Modules (draft inventory, to be confirmed from captures)

Built from LimeChat's public material ([site](https://www.limechat.ai/), [Shopify listing](https://apps.shopify.com/limechat-shop)) plus standard WhatsApp commerce needs. Tag each module with what Frido actually uses today.

| # | Module | What it does | MVP? |
|---|---|---|---|
| M1 | **Shared inbox** | Conversations, agent assignment, tags, internal notes, quick replies, 24-hour window indicator, AI↔human handoff with context | Yes |
| M2 | **Contacts & segments** | Shopify-synced customers, opt-in status, attributes, tags, saved segments | Yes (basic) |
| M3 | **Template manager** | Create and submit templates (marketing / utility / authentication), approval status, variables, media headers, buttons | Yes |
| M4 | **Campaigns (broadcasts)** | Segment → template → schedule; rate-limited send; delivered / read / clicked / replied / ordered stats | Yes (single send) |
| M5 | **Journeys / automations** | Shopify triggers (order placed, COD confirmation, COD-to-prepaid nudge, shipped, delivered, abandoned cart), keyword triggers, delays, branches | Phase 2 |
| M6 | **AI agent** | Product Q&A over the Frido catalog, order-status lookup, returns/exchanges FAQ, escalation to a human | Phase 3 |
| M7 | **Analytics** | Response times, agent load, campaign revenue attribution, template costs | Phase 2 |
| M8 | **Integrations** | Shopify, shipping/COD tool, payment links, click-to-WhatsApp ads attribution | Shopify in MVP |
| M9 | **Settings** | Team and roles, business hours, auto-replies, number and BSP settings | Basic in MVP |

Possible later link to Frido Mitra: affiliate onboarding and nudges over WhatsApp (Engine OS E2–E9) could run as journeys in M5.

## 4. Architecture

```
 Meta Cloud API (dev) ─┐
 360dialog ────────────┼─► Provider adapters ─► Webhook ingest ─► Event store (Postgres)
 Karix ────────────────┘        ▲                 (ack 200 fast,        │
                                │                  process async)       ▼
                         Outbound queue ◄── Campaigns / Journeys / Inbox / AI agent
                         (rate-limited)                 │
                                                        ▼
                                                 Web app (agents, marketers)
```

**Provider adapter interface.** It's BSP-agnostic so switching BSPs is a config change:

- `sendText`, `sendTemplate`, `sendMedia`, `sendInteractive`, `markRead`
- `listTemplates`, `createTemplate`, `deleteTemplate`
- `uploadMedia`, `getMedia`
- `parseWebhook(raw) → NormalizedEvent[]` (inbound message, status update, template status change)

Adapter notes:

- **meta-cloud**: Meta's Graph API directly. Used for development on Meta's free test number.
- **360dialog**: a thin wrapper over the Cloud API. Same message JSON, base URL `https://waba-v2.360dialog.io`, auth by `D360-API-KEY` header, one key per number ([docs](https://docs.360dialog.com/docs/guides/send-and-receive-messages)). This adapter should be small.
- **karix**: its own API format. Public docs are thin; partner guides ([WebEngage](https://docs.webengage.com/docs/wsp-karix), [SuprSend](https://docs.suprsend.com/docs/karix-whatsapp)) show the account key and a callback URL set up in their dashboard. We need Karix's API reference and a sandbox from their account manager.

**Proposed stack** (needs sign-off):

- TypeScript throughout.
- Next.js web app (inbox, campaigns, templates, settings).
- Postgres on Supabase: database, agent login, realtime inbox updates, media storage.
- A worker for webhooks and the send queue (pg-boss on Postgres, so no Redis), on Google Cloud Run. Frido already has GCP project `frido-429506`, and BigQuery there already holds Shopify orders, which we'll need for revenue attribution.
- Claude API for the AI agent (Phase 3).

Why not Netlify-only: campaign sends to large segments need a long-running, rate-limited worker, and WhatsApp webhooks need fast, always-on acks. Serverless functions with short timeouts fit poorly. The web UI can still sit on Netlify or Vercel.

**Core tables (first cut):** `contacts`, `consents`, `conversations`, `messages`, `message_status_events`, `templates`, `segments`, `campaigns`, `campaign_recipients`, `journeys`, `journey_runs`, `agents`, `teams`, `raw_webhook_events`, `provider_accounts`.

## 5. Phases

**Phase 0: decide and capture (now)**
1. Decisions in §6 signed off.
2. LimeChat captured per `CAPTURE-GUIDE.md` and turned into a written spec: `frido-chat/spec/` with one file per module, in our own words.
3. Meta developer app with a WhatsApp test number. Its token goes in the environment secrets, never in chat or git.
4. Scaffold the app, database migrations and CI.

**Phase 1: MVP on the Meta test number**
- `meta-cloud` and `360dialog` adapters, webhook ingest, normalized events.
- M1 inbox with the 24-hour window rule, M2 contacts, M3 templates synced from Meta, M4 single broadcast with delivery stats.
- Shopify customer sync.

**Phase 2: commerce automation**
- M5 journeys: order confirmation, COD confirmation, shipping updates, abandoned cart.
- Segments, campaign scheduling, M7 analytics, revenue attribution.

**Phase 3: AI and BSP cutover**
- M6 AI agent with human handoff.
- `karix` adapter, final BSP choice, number migration from LimeChat's BSP, parallel run, then cutover. LimeChat stays live until cutover.

## 6. Open decisions

| Decision | Proposed default |
|---|---|
| Repo: own repo or a folder in `frido-mitra` | Own repo (`frido-chat`) before code lands; this branch holds the plan for now |
| Stack and hosting (§4) | Next.js + Supabase + Cloud Run worker |
| Product name | "Frido Chat" placeholder |
| Who approves production releases | Same rule as the dashboard: Abdal approves a change summary before production |
| BSP | Decide in Phase 3. 360dialog is the lower-effort adapter; Karix depends on their docs and India pricing |
