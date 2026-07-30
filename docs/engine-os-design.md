# Frido Mitra — Affiliate Engine OS
## System Design Document v1

Prepared for: Frido Founder's Office × Refer Rush (Project Frido Mitra / Buddy / Ambassador)
Source inputs: Master Sheet (9 Macro Engines + AC/SAC taxonomy + POC markers), whiteboard session decode v0
Date: 30 Jul 2026

---

## 0. Executive summary

Build the system as a **relational Google Sheet acting as the single system of record**, with a **long-format Sub-Engine Ledger** at its core, **QUERY-driven generated views** for filtering (Channel Cockpit, Engine Lens, Portfolio Dashboard), and a **thin Phase-2 layer** (Looker Studio for leadership, AppSheet or a Netlify HTML app for field CRUD) once the data model has stabilized. The single most important decision in this document is a modeling decision, not a tooling decision: there will be exactly **one operational table** (the Ledger) where every sub-engine of every channel lives as a row. Everything the user sees — per-channel flows, per-engine comparisons, health rollups — is generated from that table. This is what prevents the failure mode you named: a clutter of disconnected tabs.

The design deliberately reuses two things Frido already has: (a) the Google data estate — BigQuery project `frido-429506` already ingests Shopify orders, which is exactly where the Profitability Engine (E7, channel-level CM2) will eventually read from; and (b) the shipping pattern you have already proven internally with the Store QC Audit and Retail Store Hub — Sheet + Apps Script + single-file HTML on Netlify — which becomes the Phase-2 front-end with zero procurement.

---

## 1. Visualization & build recommendation

### 1.1 The decision

| Layer | Phase 1 (Days 1–14) | Phase 2 (post-POC-stabilization) |
|---|---|---|
| System of record | Relational Google Sheet (4 data tabs) | Same sheet; optionally mirrored to BigQuery via Connected Sheets / Apps Script |
| Filtering & drill-down | Dropdown + QUERY generated views inside the sheet | Same, plus Looker Studio controls |
| Leadership reporting | Portfolio Dashboard tab | Looker Studio page on the Ledger |
| Field editing / mobile CRUD | Direct ledger editing with validations + protections | AppSheet on the same sheet, or Netlify single-file HTML app reading a GAS `doGet` JSON endpoint (your QC Audit / Store Hub pattern) |
| Build automation | Apps Script builder (one-run tab construction, same pattern as the Engine Command script) | Apps Script continues as the glue |

### 1.2 Why this and not the alternatives

**Google Sheets + Apps Script (recommended core).** Zero cost, zero procurement, every channel owner already lives in Workspace, and the analytics gravity is Google: E6 (Sales Engine live dashboard) and E7 (Profitability / CM2) both terminate in BigQuery + Looker, which Sheets reaches natively. The known weakness — Sheets is bad at relational UX — is solved by the data model plus generated views, not by buying a tool. Apps Script gives you enforcement (validations, protections, edit timestamps, ID generation) that plain Sheets lacks.

**Airtable (honest runner-up).** Interfaces + linked records solve requirements 2 and 3 out of the box, and if this were a greenfield team with budget per seat and no BigQuery estate, it would be the pick. It loses here on three counts: per-seat cost across 9+ channel owners, a second data estate outside Google that E7 would then have to bridge, and the Refer Rush integration being custom work either way. Decision rule: if the operating team stays ≤ 5 editors and leadership approves the spend, Airtable is a legitimate alternative — the schema in Section 2 ports to it one-to-one (tables become bases, FKs become linked records).

**Notion / Coda.** Excellent for the narrative layer (engine playbooks, SOPs — and your onboarding email already ships a Notion guide, keep that), weak at the relational density this needs: 9 engines × 9 leaf channels × N sub-steps with cross-cutting rollups and pivots. No clean path to BigQuery. Use Notion for the *content* of each sub-engine (the how-to), linked from the Ledger's remarks column — not as the registry.

**Retool.** Overkill until Refer Rush exposes an API worth building admin tooling on. Revisit when RR actuals (link counts, CTA clicks, conversions) need write-back workflows.

**AppSheet.** Not the core, but the cheapest credible Phase-2 CRUD layer since it binds directly to the same sheet — a channel owner on mobile gets a filtered form view of only their rows. Decide at Day 13 between AppSheet (faster, uglier) and the Netlify HTML app (slower, exactly your design language).

### 1.3 One design consequence of the Refer Rush risk

Your own sheet flags RR's feature speed as the open risk. The schema therefore treats tools as *data, not structure*: every sub-engine carries `poc_tool` and `scaled_tool` as fields. If RR is swapped or supplemented on any step, that is a cell edit, not a redesign. The Engine OS must survive its own tool stack changing.

---

## 2. Database & sheet schema design

### 2.1 Modeling principles

1. **One grain.** A Ledger row = one sub-engine, for one leaf channel, inside one macro engine. Nothing else is ever a row anywhere operational.
2. **Leaf-only assignment.** Sub-engines attach only to leaf channels (SP-PHY, not SP). Parents exist for grouping and rollups.
3. **GLOBAL pseudo-channel.** Steps true for every channel (RR admin approval, auto-email, PDP pop-ups, abandoned-checkout flows) are written once against channel `GLOBAL`. Views union `GLOBAL` with the selected channel, so shared machinery is never duplicated nine times and never drifts.
4. **Immutable codes.** `channel_id` and `engine_id` are short, human-readable, never renamed, and restricted to `A–Z`, `0–9`, `-` (this also keeps QUERY strings injection-safe). Display names can change freely; codes cannot.
5. **Views are generated, never typed.** Cockpit, Lens, and Dashboard contain formulas only. If anyone types data into a view, the design has failed.

### 2.2 Tab map (8 tabs total, forever)

| Tab | Type | Purpose |
|---|---|---|
| `REGISTRY` | Data | Master AC/SAC registry + POC + health rollups (Requirement 1) |
| `ENGINES` | Data (lookup) | The 9 macro engines, sequence, exit criteria |
| `LEDGER` | Data (core) | Every sub-engine row (Requirements 3 & 4) |
| `PEOPLE` | Data (lookup) | Owners/assignees for consistent assignment |
| `COCKPIT` | View | Single-channel drill-down across E1–E9 (Requirement 2) |
| `LENS` | View | Single-engine matrix across all channels |
| `DASHBOARD` | View | Portfolio heat matrix + KPIs + stopper feed |
| `LISTS` | Hidden | Validation lists, settings, leaf-code helper ranges |

### 2.3 `REGISTRY` — Master Channel Registry

| Col | Field | Notes |
|---|---|---|
| A | `channel_id` | PK, immutable code (see seed below) |
| B | `parent_id` | FK → `REGISTRY.channel_id`; blank for AC roots |
| C | `level` | `AC` / `SAC` / `SSC` (dropdown) |
| D | `channel_name` | Display name |
| E | `full_path` | Formula: parent name ▸ name (for readable views) |
| F | `is_leaf` | Formula: `=COUNTIF($B:$B, A2)=0` — only leaves accept Ledger rows |
| G | `channel_owner` | FK → `PEOPLE` (dropdown) — the POC |
| H | `status` | `Ideation / POC / Scaling / Paused` (dropdown) |
| I | `legacy_level` | L1–L4 mapping used by RR category prescription (Appendix A) |
| J | `poc_target` | From the POC markers (e.g., 500 traders / 500 physios / 500 influencers) |
| K | `steps_defined` | Rollup: `=COUNTIF(LEDGER!$B:$B, $A2)` |
| L | `gtm_pct` | Weighted rollup (formula in §3.2) |
| M | `open_stoppers` | `=COUNTIFS(LEDGER!$B:$B,$A2, LEDGER!$G:$G,"<>")` |
| N | `notes` | Free text |

**Seed rows** (from the master sheet taxonomy; the registry also repairs the duplicated 3.1.1/3.1.2 numbering under YouTube in the source):

| channel_id | parent_id | level | channel_name | legacy_level |
|---|---|---|---|---|
| GT | — | AC | GT Traders Across India (inventory-less assortment) | L1 |
| SP | — | AC | Specialists & Professionals | — |
| SP-PHY | SP | SAC | Physiotherapists | L2 |
| SP-ORT | SP | SAC | Orthopedic Doctors | L2 |
| SM | — | AC | Social Media Creators | — |
| SM-IG | SM | SAC | Instagram | — |
| SM-IG-WL | SM-IG | SSC | Acquired Whitelisted Influencers | L3 |
| SM-IG-NEW | SM-IG | SSC | New Creators ("gunsblazing") | L4 |
| SM-YT | SM | SAC | YouTube | — |
| SM-YT-LF | SM-YT | SSC | Long-Form Content Creators | — |
| SM-YT-SH | SM-YT | SSC | YouTube Shorts Creators | — |
| ST | — | AC | Students — Campus Ambassadors | — |
| HH | — | AC | Households — Word-of-Mouth Attribution | — |
| GLOBAL | — | AC | Platform-level shared steps | — |

Leaves = GT, SP-PHY, SP-ORT, SM-IG-WL, SM-IG-NEW, SM-YT-LF, SM-YT-SH, ST, HH, GLOBAL (10).

### 2.4 `ENGINES` — engine master

| Col | Field | Notes |
|---|---|---|
| A | `engine_id` | E1…E9, PK |
| B | `seq` | 1–9 |
| C | `engine_name` | As per master sheet |
| D | `purpose` | One-liner (seed from current Steps column) |
| E | `exit_criteria` | *To be defined Day 1–2* — what "done" means before a channel passes to the next engine |
| F | `engine_lead` | FK → `PEOPLE` — the horizontal owner across channels |

Seed: E1 Acquiring Affiliates · E2 Onboarding Affiliates · E3 Engaging Affiliates · E4 Publishing Content · E5 PDP & CRO Engine · E6 Sales Engine · E7 Profitability Engine · E8 Payout Engine · E9 Retention Engine. Note the two ownership axes this creates deliberately: channel owners (vertical, in `REGISTRY`) and engine leads (horizontal, here). Every Ledger row sits at an intersection of both — that is your accountability matrix.

### 2.5 `LEDGER` — the Sub-Engine Ledger (core table)

Grain: one row = one sub-engine for one leaf channel within one engine. Column letters matter — the view formulas in §3 reference them.

| Col | Field | Requirement mapping | Validation |
|---|---|---|---|
| A | `sub_id` | — | Formula: `=B2&"-"&C2&"-"&TEXT(D2,"00")` → e.g. `SP-PHY-E2-03` |
| B | `channel_id` | (channel link) | Dropdown of leaf codes from `LISTS` |
| C | `engine_id` | (engine link) | Dropdown E1–E9 |
| D | `seq_no` | — | Integer; order within the engine |
| E | `sub_engine_name` | Step Name | Free text |
| F | `owner` | Dedicated Owner / Assignee | Dropdown ← `PEOPLE` |
| G | `show_stopper` | Show Stoppers | Free text; empty = none |
| H | `stopper_severity` | (optional refinement) | `Blocker / Risk / Watch` |
| I | `poc_tool` | Tool Stack — POC Tool Planned | Free text (exact master-sheet header) |
| J | `scaled_tool` | Tool Stack — Post-POC Scaled Tool | Free text (exact master-sheet header) |
| K | `data_points` | Core Data Points & Tracking Metrics | Free text |
| L | `gtm_status` | GTM Readiness Status | `Not started / In build / Testable / Live` |
| M | `remarks` | Remarks | Free text; link Notion playbook here if one exists |
| N | `last_updated` | — | Auto via `onEdit` Apps Script timestamp |
| O | `engine_name` | (derived) | `ARRAYFORMULA` lookup — display only |
| P | `channel_path` | (derived) | `ARRAYFORMULA` lookup — display only |

### 2.6 `PEOPLE` and `LISTS`

`PEOPLE`: `person_id`, `name`, `role`, `email`, `active`. Seeds from current context: Ganesh (sponsor), Sachin Mariwala (RR / Payout), plus channel owners to be assigned Day 1. `LISTS` (hidden): GTM options, status options, severity options, leaf-code range (`=FILTER(REGISTRY!A:A, REGISTRY!F:F=TRUE)`), settings cells.

### 2.7 Keys, integrity, and enforcement

Primary key: `sub_id` (generated, never hand-typed). Foreign keys enforced by strict dropdown validation (`reject input`) on `channel_id`, `engine_id`, `owner`. Uniqueness guard: a hidden helper column flags `=COUNTIFS($B:$B,B2,$C:$C,C2,$D:$D,D2)>1` with red conditional formatting. Orphan guard on `DASHBOARD`: any Ledger `channel_id` absent from the leaf list, any leaf channel with zero rows for a given engine (the coverage checker, §3.4). Protections: `ENGINES` and `REGISTRY` structure columns admin-only; `LEDGER` open to all owners; view tabs fully protected.

### 2.8 Migrating the current master sheet (v0 → v1)

The current 9-row sheet is channel-agnostic — its Steps cells are actually *bundles* of future sub-engines. Treat it as the seed backlog, not as data to import literally. Two moves: (1) freeze the current sheet as a read-only tab named `V0-SOURCE`; (2) in the Day 5–7 sprint, explode each Steps cell into Ledger rows, deciding per bullet whether it is `GLOBAL` (e.g., E2's RR approval → AM assignment → auto-email chain; E5's pop-up and abandoned-checkout machinery) or channel-specific (e.g., E1 organic push looks completely different for SP-PHY vs GT). Appendix B shows a worked example of this explosion.

---

## 3. UI / UX wireframes & filter logic

### 3.1 Filter mechanism: dropdown + QUERY, not slicers

Slicers in Sheets are shared-state (one person's filter changes everyone's view) and cannot feed formulas. A validated dropdown cell driving `QUERY()` is deterministic, shareable by URL, mobile-safe, and composable into KPIs. All three views below use it. Because channel codes are restricted to `A–Z0–9-`, string-built QUERY clauses are safe.

### 3.2 Master Channel Management View (`REGISTRY`, styled)

Layout, top to bottom: title bar → portfolio KPI strip → the registry table itself with tree indentation.

```
┌──────────────────────────────────────────────────────────────────┐
│ FRIDO MITRA — CHANNEL REGISTRY          [Channels: 9 leaves]     │
│ KPI: Channels in POC · Avg GTM % · Open stoppers · Unowned rows  │
├────────┬──────────────────────────┬───────┬────────┬────┬───────┤
│ ID     │ Channel (indented tree)  │ Owner │ Status │GTM%│ Stop. │
│ GT     │ GT Traders               │  —    │ POC    │ ▓▓ │  2    │
│ SP     │ Specialists & Prof.      │  —    │ —      │    │       │
│ SP-PHY │   └ Physiotherapists     │  —    │ POC    │ ▓  │  1    │
│ ...    │                          │       │        │    │       │
└────────┴──────────────────────────┴───────┴────────┴────┴───────┘
```

Indentation via `level` (SAC prefixed two spaces, SSC four — or a formula on `full_path`). Conditional formatting: `status` chips; `gtm_pct` 3-color scale; `open_stoppers` red when > 0; owner cell amber when blank on a leaf (unowned channel = visible debt). The weighted GTM formula per row:

```
=IFERROR(ROUND(100*(
   COUNTIFS(LEDGER!$B:$B,$A2,LEDGER!$L:$L,"Live")*3
 + COUNTIFS(LEDGER!$B:$B,$A2,LEDGER!$L:$L,"Testable")*2
 + COUNTIFS(LEDGER!$B:$B,$A2,LEDGER!$L:$L,"In build"))
 /(3*COUNTIF(LEDGER!$B:$B,$A2))),0)
```

### 3.3 Single-Channel Drill-Down (`COCKPIT`)

One dropdown (cell `B1`, leaf channels), everything below regenerates. Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│ CHANNEL ▾ [SP-PHY  Physiotherapists]   Owner: ___  Status: POC   │
│ KPI: Steps 14 · GTM 32% · Stoppers 3 · Last updated 28 Jul       │
├──────────────────────────────────────────────────────────────────┤
│ ▌E1 ACQUIRING                                                    │
│   01  Clinic outreach list …   Owner  Tool  GTM  Stopper         │
│   02  …                                                          │
│ ▌E2 ONBOARDING          (GLOBAL rows shown greyed, tagged ⊕)     │
│   …                                                              │
│ ▌…through E9                                                     │
├──────────────────────────────────────────────────────────────────┤
│ STOPPER RAIL: all non-empty show_stoppers for this channel       │
└──────────────────────────────────────────────────────────────────┘
```

Core formula (unions the selected channel with GLOBAL, orders by engine then step):

```
=QUERY(LEDGER!A2:P,
 "select C,D,E,F,I,J,K,L,G,M
  where (B='"&$B$1&"' or B='GLOBAL') and B<>''
  order by C, D", 0)
```

Engine banding: a helper column marks rows where `engine_id` changes; conditional formatting draws the heavy divider and the `▌E# NAME` band. GLOBAL rows get a distinct fill so shared machinery reads differently from channel-specific work. Stopper rail: `=QUERY(...where (B='"&$B$1&"' or B='GLOBAL') and G is not null...)`.

### 3.4 Single-Engine Matrix (`LENS`)

One dropdown (cell `B1`, E1–E9). Three stacked zones:

```
┌──────────────────────────────────────────────────────────────────┐
│ ENGINE ▾ [E1 Acquiring Affiliates]     Lead: ___                 │
├──────────────────────────────────────────────────────────────────┤
│ ZONE 1 — Status pivot: channels × GTM status counts              │
│ ZONE 2 — Coverage checker: leaves with ZERO rows for this engine │
│ ZONE 3 — Full detail: every sub-engine, grouped by channel       │
└──────────────────────────────────────────────────────────────────┘
```

Zone 1 pivot: `=QUERY(LEDGER!A2:P,"select B, count(A) where C='"&$B$1&"' group by B pivot L",0)`.
Zone 2 coverage checker — the honest gap detector, and the direct answer to "compare how all AC/SACs execute Acquiring":

```
=IFERROR("Missing: "&JOIN(", ",
  FILTER(LISTS!leaf_codes,
    COUNTIFS(LEDGER!B:B,LISTS!leaf_codes,LEDGER!C:C,$B$1)=0)),
 "All channels covered")
```

Zone 3 detail: same QUERY pattern as Cockpit with `where C='"&$B$1&"' order by B, D`.

### 3.5 Portfolio Dashboard (`DASHBOARD`)

The money view: a **channels × engines heat matrix** (10 rows × 9 columns), each cell `=COUNTIFS(LEDGER!$B:$B,$A12,LEDGER!$C:$C,B$11)` with a color scale — the entire program's definition-coverage at a glance, gaps glowing. Beside it a Live-only twin of the same matrix shows execution coverage. Above: program KPIs (total steps, weighted GTM, open Blockers by severity, POC-marker tracker: 500/500/500 recruits, 6-month clock, 3-month payback flag). Below: live stopper feed sorted by severity, and the integrity checks from §2.7.

---

## 4. 14-day implementation plan

Guiding rule for the whole fortnight: **content sprints and build days alternate — never build ahead of validated content, never write content into unbuilt structure.**

| Days | Workstream | Output | Gate to proceed |
|---|---|---|---|
| 1–2 | Taxonomy freeze | Registry seeded (all 14 rows), codes locked, channel owners named per leaf, engine leads named per engine, exit criteria drafted per engine with RR; project name decision logged (Mitra/Buddy/Ambassador) | Every leaf has an owner; no code disputes open |
| 3 | Structure build | All 8 tabs, validations, protections, derived columns, `onEdit` timestamps — one-run Apps Script (v2 of the Engine Command builder) | Integrity checks all green on empty data |
| 4 | v0 explosion | `V0-SOURCE` frozen; every Steps bullet from the master sheet triaged into candidate Ledger rows tagged GLOBAL vs channel-specific | Backlog reviewed by both engine leads and RR |
| 5–7 | Content Sprint 1 | The three POC-marker channels — **GT, SP-PHY, SM-IG-WL** — fully laddered E1→E9 with owners, tools, data points; daily 30-min standup per channel | Coverage checker: zero gaps for the 3 pilots |
| 8–9 | Views build | Cockpit, Lens, Dashboard live with formulas from §3; conditional formatting; heat matrix | Pilot owners can self-serve their Cockpit without help |
| 10–11 | Content Sprint 2 | Remaining leaves (SP-ORT, SM-IG-NEW, SM-YT-LF, SM-YT-SH, ST, HH) + GLOBAL rows completed by their owners using the pilot rows as templates | Coverage checker clean or gaps explicitly accepted with remarks |
| 12 | Governance | Protections finalized; weekly ritual defined (Engine Lens rotation: one engine reviewed deeply per week, 9-week cycle); stopper-severity triage SLA | Ritual on calendars with named chairs |
| 13 | Reporting gate | Decide and wire the thin layer: Looker Studio exec page (2–3 hrs) and choose AppSheet vs Netlify HTML for CRUD | Leadership can read status without opening the sheet |
| 14 | v1 lock | Review with Ganesh + RR (incl. Sachin on E8 payout readiness); freeze v1; Phase-2 backlog written | Sign-off; change control begins |

**Anti-clutter rules (permanent):** four data tabs only, ever; views are formulas only; no per-channel or per-engine tabs, ever; a new dimension is a new *column* on the Ledger or a new *lookup tab*, never a fork; codes are immutable; anything narrative (playbooks, scripts, hooks) lives in Notion and is *linked* from remarks, not pasted in.

---

## 5. Phase 2 roadmap (post Day 14, backlog only)

1. **Actuals table** (`METRICS`: channel_id, metric, period, value, source) fed by Refer Rush exports — turns the Ledger's `data_points` promises into measured reality; powers E6's live sales view.
2. **E7 Profitability wiring**: Shopify order tags/UTMs → BigQuery `frido-429506` → channel-level CM2 back into the Dashboard (Connected Sheets or Looker).
3. **CRUD front-end** per the Day-13 decision — AppSheet, or the Netlify single-file HTML app in the Store Hub pattern (left rail = channel tree, tab bar = E1–E9, cards = sub-engines) reading GAS `doGet` JSON.
4. **Scheme engine** (E3's content-count and sales-based schemes) once RR tracking is live.
5. **Sheet→BQ nightly mirror** so the Engine OS itself becomes queryable alongside sales data.

---

## Appendix A — Legacy L1–L4 ↔ Registry mapping

The onboarding engine's internal "category prescription" maps onto the registry as: **L1** → `GT` (GT/MT affiliate) · **L2** → `SP-PHY` / `SP-ORT` · **L3** → `SM-IG-WL` (whitelisted, already have products) · **L4** → `SM-IG-NEW` ("gunsblazing"; the master sheet notes only L4 requires Engine 1 triggering — encode that as an E1 row existing for SM-IG-NEW but E1 being marked minimal/`n/a` in remarks for L3, rather than as a structural exception). YouTube and ST/HH channels have no legacy level — the `legacy_level` column simply stays blank, which is exactly why the registry supersedes the L-system for anything new.

## Appendix B — Worked example: exploding v0 into Ledger rows (illustrative seeds — confirm in Sprint 1)

E2 Onboarding from the master sheet becomes, for channel SP-PHY:

| sub_id | sub_engine_name | channel | poc_tool | notes |
|---|---|---|---|---|
| GLOBAL-E2-01 | RR application received → back-end admin approval | GLOBAL | Refer Rush | shared, from v0 |
| GLOBAL-E2-02 | Affiliate Manager assignment | GLOBAL | Refer Rush | shared, from v0 |
| GLOBAL-E2-03 | Category prescription (registry code tagged) | GLOBAL | Refer Rush | shared, from v0 |
| GLOBAL-E2-04 | Auto-email: dashboard + WhatsApp comms + Notion guide | GLOBAL | RR + Gmail + Notion | shared, from v0 |
| SP-PHY-E2-01 | Product test & trial: order vs free-sample request for demo content | SP-PHY | RR + logistics | channel-specific, from v0 |
| SP-PHY-E2-02 | Optional store-visit content session scheduling | SP-PHY | Store Hub | channel-specific, from v0 |

The same v0 bullet ("Test & Trial") may explode differently for GT (assortment catalogue walkthrough instead of samples) — that divergence is precisely what the ledger exists to hold.

## Appendix C — Lineage

Whiteboard v0 (4-circle loop: Acq → Eng → Pub → Sales → O/P) → 8-engine sheet (added Onboarding, Payout, Retention; open question on Funnel vs Engine split) → current 9-engine model (Funnel resolved into PDP & CRO → Sales → Profitability). The measurement chain decoded from the board (affiliates → content → links → reach → CTA clicks → conversion → output) survives intact as the backbone of the Phase-2 `METRICS` table.
