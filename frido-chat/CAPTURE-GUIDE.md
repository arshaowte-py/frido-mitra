# Capturing LimeChat for the Frido Chat spec

The goal is a written feature spec in our own words (see `PLAN.md` §2). Capture what each screen does, what fields and states it has, and how each workflow moves. Do not capture code, JS bundles, assets or copy text.

The LimeChat login lives in a browser on your computer, so captures happen there. A Claude Code cloud session can't reach your browser.

## Option A: REA on your computer (recommended)

Use this if you can run Claude Code on your own machine (desktop app or CLI). The local agent drives [REA](https://github.com/morluto/rea) and writes the spec files directly. HAR files never leave your machine.

1. **Install Node.js 22.19+ or 24.11+**, then run `npx rea-agents setup`, pick Claude Code, approve, and restart Claude Code.
2. **Start a separate Chrome profile with debugging on.** Since Chrome 136, the debugging flag is ignored for your default profile, so use a dedicated one and log in to LimeChat inside it:
   - macOS: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="$HOME/rea-limechat-profile"`
   - Windows: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=%USERPROFILE%\rea-limechat-profile`
   - Keep port 9222 on localhost only. Close this browser when done.
3. **In this repo on the `claude/frido-chat` branch, ask the local agent:**
   > Use REA against the Chrome at http://127.0.0.1:9222, limited to the LimeChat origin. For each module in frido-chat/CAPTURE-GUIDE.md: take screenshots, inspect the page structure, and observe the session while I perform each workflow. Write frido-chat/spec/<module>.md in our own words: screens, fields, states, validations, workflow steps and the data entities involved. Do not copy LimeChat code, copy text or assets, and do not commit screenshots or captures.
4. Push the `spec/` files. They hold no secrets.

## Option B: screenshots plus sanitized HAR (no local setup)

1. For each module below, take screenshots of every state and a short screen recording of each workflow. Attach them to the cloud session.
2. Optional, for the workflows that matter most: in Chrome DevTools, open Network, perform the workflow, then use **Export HAR (sanitized)**. That export strips cookies and auth headers, but response bodies still hold customer data. Prefer capturing on settings, template and builder screens rather than the live inbox. Share HAR files through a private Drive folder, never GitHub.
3. The cloud session runs `rea inspect-web-network-capture` on the HAR files, writes the spec, and deletes the captures.

## Module checklist

For every module, also note how often Frido uses it (daily / sometimes / never) and what annoys the team about it.

- [ ] **Inbox**: conversation list and filters, conversation view, assignment, tags, notes, quick replies, AI↔human handoff, and what happens when replying after the 24-hour window closes
- [ ] **Contacts**: list, filters, profile, attributes, import/export, opt-in handling
- [ ] **Segments**: builder conditions and operators
- [ ] **Templates**: create form (category, language, header type, variables, buttons), approval states, editing rules
- [ ] **Campaigns**: creation steps, audience, scheduling, test send, report metrics
- [ ] **Journeys / flow builder**: node types (trigger, message, wait, condition, action), full trigger list, abandoned-cart and COD flows as configured for Frido
- [ ] **AI agent / Agent Studio**: knowledge sources, settings, escalation rules
- [ ] **Analytics**: each dashboard and how each metric is defined
- [ ] **Integrations**: which ones Frido has connected (Shopify, shipping, payments, ads)
- [ ] **Settings**: team and roles, business hours, auto-replies, number settings

## Data to export from LimeChat (for migration later)

Use LimeChat's own export buttons. Keep exports in Drive, not GitHub.

- Contacts with opt-in status and tags
- Template list: name, category, language, body
- Active journeys and campaigns: names, triggers and a rough description
