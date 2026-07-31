# Frido Mitra — Engine OS (dashboard)

## What this is
Single-file static dashboard for Frido's affiliate program (Project: Frido Mitra / Buddy / Ambassador). It visualizes the program's operating model: 9 sequential macro engines (E1 Acquiring → E9 Retention) executed per affiliate channel (AC / SAC / SSC taxonomy: GT traders, physios, ortho doctors, IG whitelisted/new creators, YT long-form/shorts, campus ambassadors, households, plus a GLOBAL pseudo-channel for shared platform steps).

Views (hash-routed, all rendered from embedded data):
- **Dashboard** — signature element: each channel as a 9-station "engine line"; station color = dominant GTM status; blue underdot = GLOBAL shared coverage; stations click through to the Cockpit. Plus KPI cards, POC markers (500·500·500 recruits / 6-month POC / 3-month payback), and a show-stopper feed.
- **Registry** — AC/SAC tree, legacy L1–L4 mapping, per-channel rollups.
- **Cockpit** — one channel end-to-end across E1–E9; GLOBAL rows shown dashed/de-emphasized; coverage gaps called out.
- **Lens** — one engine across all channels; stacked status bars; explicit coverage-gap banner.

## Data & provenance (important)
- All data is embedded in `index.html` as three constants: `ENGINES`, `CHANNELS`, `LEDGER`.
- Ledger grain: one row = one sub-engine for one leaf channel in one engine. Row id = `CH-Ex-NN`.
- `src:"v0"` rows come verbatim-ish from the master Google Sheet (sheet id `1ifYKFph9DSIsQDPoYrjhbBk7bCWrN-KA0QuL-jeT_y0`). `src:"draft"` rows are proposals awaiting Sprint-1 confirmation. **Never silently invent new v0 rows — new content is `draft` until Abdal confirms.**
- The Google Sheet is the system of record (see `docs/engine-os-design.md` §2); this app is the front-end. GTM chip clicks persist to `localStorage` key `fm_gtm_v1` (browser-local only, by design in v1).

## Stack & constraints
- Pure static, no build step, no framework: one `index.html`, vanilla JS, hash router. Keep it single-file unless a change genuinely requires splitting.
- Fonts: Bricolage Grotesque (display) · Instrument Sans (body) · IBM Plex Mono (codes/data), via Google Fonts.
- Design tokens live in `:root`. Dark control-room theme: `--ink #101319`, panels `#171B23/#1D222C`. Status spectrum carries meaning — slate = Not started, saffron `#F0A231` = In build, sky `#5AA7F0` = Testable, jade `#34C388` = Live, ember `#E5544B` = stoppers. Don't add new accent colors casually; the palette is the information.
- Quality floor: responsive to mobile, `:focus-visible` outlines, `prefers-reduced-motion` respected. Preserve these in every change.

## Deploy (Netlify)
- Production site: **frido-mitra-engine-os.netlify.app**
- Site ID: `cd2203a6-e56e-4c25-a01a-50e808e2bbc1` · team `saiyedabdal` · [admin](https://app.netlify.com/projects/frido-mitra-engine-os)
- GitHub repo: `arshaowte-py/frido-mitra`
- One-time: `netlify link --id cd2203a6-e56e-4c25-a01a-50e808e2bbc1`
- Manual ship: `netlify deploy --prod` (publish dir `.` per `netlify.toml`, no build step)

### Push-to-deploy (preferred)
Once the repo is connected in the Netlify UI (Site configuration → Build & deploy → Link repository), the pipeline is:
- push to `main` → **production** deploy
- push any other branch → **branch deploy** at `<branch>--frido-mitra-engine-os.netlify.app`
- open a PR → **deploy preview** at `deploy-preview-<n>--frido-mitra-engine-os.netlify.app`

Netlify reads `netlify.toml` from the repo, so build settings are version-controlled — don't set publish dir or redirects in the UI, they'll be overridden.

**Caveat:** the Netlify account authenticates via GitHub as `saiyedabdal`, but the repo lives under the `arshaowte-py` org. The Netlify GitHub App must be installed on that org (and granted access to `frido-mitra`) before the repo appears in the link picker.

### Pages
| Path | File | Audience |
|---|---|---|
| `/` | `index.html` | Internal — Engine OS ops dashboard |
| `/ambassador`, `/handbook`, `/mitra` | `ambassador.html` | External — affiliate-facing handbook |

## Operating rule
**Never deploy to production without Abdal's explicit approval of a change summary.** Deploy previews / local serves are fine without approval; production is not.

## Roadmap (v1.1+ candidates, in rough order)
1. Live data: replace embedded seed with a fetch from a Google Apps Script `doGet` JSON endpoint on the master Sheet (keep embedded seed as offline fallback).
2. Owner assignment pass once Day 1–2 owner mapping lands (registry + ledger `owner` fields are mostly "Unassigned" by design right now).
3. ~~GitHub repo + Netlify auto-deploy~~ — repo live at `arshaowte-py/frido-mitra`; `netlify.toml` is deploy-ready, pending the GitHub App install on the org (see Deploy).
5. Ambassador handbook (`ambassador.html`) blocking decisions: commission rate, customer discount, payout holding period, sample policy. All four are marked TBC/DRAFT in-page.
4. METRICS layer per design doc Phase 2: RR actuals (affiliates, links, CTA clicks, conversions) feeding the Dashboard; later BigQuery `frido-429506` CM2 for E7.

## Context docs
- `docs/engine-os-design.md` — full system design (schema, views, 14-day plan). Read before structural changes.
