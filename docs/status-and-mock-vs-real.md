# Implementation status and mock-vs-real register

Updated at the end of each phase. "Verified" means exercised by an automated test or a run in the build environment; it does not mean "complete".

## Phase 3 - Backend foundation

| Item | State | How verified |
|---|---|---|
| Env validation (Zod), fail-fast on missing secrets | Implemented | Loaded in all tests |
| Central permission map (5 roles) + `requirePermission` | Implemented | `tests/rbac.test.js` (matrix, 401/403, audit on denial) |
| JWT access (15 min) + rotating opaque refresh cookie with 10 s grace window, lockout (423), reuse detection | Implemented | DB integration tests + live browser login (see verification note) |
| Public registration (BIDDER only) | Implemented | Integration test (role escalation attempt ignored, duplicate rejected) |
| Hash-chained append-only AuditLog, verify-chain endpoint | Implemented | Unit + integration: tamper made directly in the database is detected at the right sequence number |
| PAN/GSTIN/secret masking in audit entries | Implemented | `tests/audit.test.js` |
| Upload hardening: magic bytes, extension match, size, encrypted/truncated PDF | Implemented | `tests/upload.test.js` over real multipart HTTP |
| Storage abstraction (LocalStorage, random names, traversal guard) | Implemented | `tests/http.test.js` |
| MongoDB job queue + worker (claim, backoff, stale requeue, idempotent enqueue) | Implemented | Integration test: idempotency, claim by type, retry/backoff, failure after max attempts. Worker loop itself not exercised (no handlers until phase 5) |
| Standard error envelope | Implemented | HTTP tests |

### Verification environment (important)
Database-backed tests ran against **FerretDB 1.24 (SQLite backend)**, a MongoDB-compatible server, because no MongoDB binary was obtainable in the build sandbox. FerretDB is not MongoDB. Behaviour may differ in edge cases (index semantics, error shapes, concurrency). Please run `npm test` with `MONGO_TEST_URI` pointing at your real MongoDB; any failure there is a genuine finding I want to hear about.

### Deliberate deviations
- `bcryptjs` (pure JS) instead of native `bcrypt`, to avoid node-gyp build tools on Windows.
- `multer` 2.x (1.x has published vulnerabilities).
- DOCX uploads are checked for the ZIP signature only, not package contents.
- Encrypted-PDF detection is a heuristic (`/Encrypt` marker); the AI service does the authoritative parse.
- Audit append-only is enforced in the application layer; it is tamper-evident, not tamper-proof.
- Auditor is the only role with `audit:read`; Admin manages users/config/jobs but cannot read audit entries.

## Phase 4 - Tenders, requirements, organisations, submissions, documents

| Item | State | How verified |
|---|---|---|
| Tender CRUD: create with NIT PDF (magic-byte check, SHA-256, no orphan file on rejection), list/search/filter, detail, metadata edit with before/after audit, close | Implemented | Integration tests incl. disk check; browser flow |
| Per-tender scoping: owner officer, assigned reviewer, auditor read, bidders see open tenders + own bids, admin none | Implemented | Integration tests (404 for out-of-scope reads, 403 for non-owner writes) |
| Requirements: versioned drafts, officer-only edit, rule JSON validated **at approval** (422 with per-field errors), approve freezes version and opens tender, edits after approval start a new version, frozen once bids exist | Implemented | Integration tests + browser flow (invalid rule rejected, fixed, approved) |
| Provenance: `origin`/`source` never accepted from the client; bidders see only the approved version without provenance | Implemented | Integration test |
| Rule model: 8 types (document_present, field_format, date_valid_on, numeric_min, count_min, declaration_present, cross_doc_consistency, registry_verified) | Schema only | Unit tests. **The engine that evaluates them is phase 6** |
| Identifier validation: GSTIN (state code, embedded PAN, checksum), PAN, Udyam, CIN | Implemented (format only) | Unit tests; single-character corruption caught. Says nothing about whether an ID is registered |
| Organisation registration; GSTIN unique; PAN must match GSTIN; GSTIN/PAN immutable | Implemented | Integration tests; audit entries confirmed to mask PAN/GSTIN |
| Submissions: one per org per tender; window enforced by status **and** deadline (409) | Implemented | Integration tests incl. deadline passing while status is still open |
| Document upload/replace: validation per file, SHA-256, `process_document` job queued, superseded files retained, upload locked after submit | Implemented | Integration tests |
| Exact-duplicate screening across bids in a tender | Implemented | Staff-only signal; verified hidden from bidder responses. Near-duplicate matching **not built** |
| Upload checklist from approved requirements; `completenessPct` is a plain count of mandatory categories | Implemented | Unit tests. Categories shown as "declared" until classification (phase 5) |
| Confidentiality: staff see files only from submitted bids; reviewers only after close; auditors never | Implemented | Unit matrix + integration tests |
| Officer dashboard (real counts; unavailable figures are `null`) | Implemented | Integration + browser |
| Frontend: officer dashboard, tender list/create/detail, requirement editor (JSON rule editor with templates), reviewer assignment, close tender | Implemented | Real browser run against the live backend; screenshots reviewed |

### Defects found and fixed while verifying this phase
- Refresh-token rotation logged users out when two refresh calls raced (React StrictMode in dev; two tabs in real use): the second call looked like token theft. Fixed with a client single-flight plus a server grace window (`REFRESH_GRACE_SECONDS`, default 10). Accepted trade-off: a stolen token replayed inside the grace window is honoured once.
- A test expected the wrong completeness percentage (the code was right).
- Breadcrumb links used route-relative `..` and would have landed on the dashboard.
- Table headers were sticky globally and floated oddly; now opt-in.

### Not built in phase 4 (so nothing here is claimed)
Bidder-side screens (organisation form, tender browsing, document upload UI, submission tracking); bidder list and tender-metadata edit UI; clarifications; replacing the tender NIT file after creation; email notifications; the structured (non-JSON) rule editor. Requirement **extraction** is queued but has no worker handler until phase 5, so jobs stay `queued` by design.

### Known limitations
- Requirement save uses bulk upserts, not a transaction; a crash mid-save could leave a partially updated draft (approved versions are never touched).
- DOCX is checked for the ZIP signature only.
- The JSON rule editor is a stop-gap and is not friendly to non-technical officers.

## Phase 2 - Frontend design system

| Item | State | How verified |
|---|---|---|
| Tailwind tokens (palette from brief), 13-14px type, 2-3px radii, no shadows/gradients | Implemented | Screenshots reviewed (login, dashboard, evidence, 390px mobile) |
| Masthead: prototype label, text-size controls, skip link, user/designation/department, tricolour rule, nav | Implemented | Rendered in Chromium |
| StatusBadge (PASS/FAIL/MISSING/REVIEW/WAIVED + workflow states), MockTag, Panel, DataTable (pagination), Breadcrumbs | Implemented | Rendered |
| Auth: in-memory access token, refresh-cookie session restore, 401 refresh interceptor, role-routed guards, 403/404 pages | Implemented | Route guards and rendering checked with a **stubbed** auth response; real login against the backend **not run** |
| Login form (React Hook Form + Zod, password toggle, server-error display) | Implemented | Rendered; submission not run against backend |
| Role navigation for all five roles; every item has a route | Implemented | Navigation click-through checked for the officer role only |
| Officer dashboard | Superseded in phase 4: now reads the backend | See phase 4 |
| Evidence Review | **Layout preview**: sample text lines, not a PDF; actions disabled | Page nav, zoom, and field-to-highlight linking checked in browser |
| All other nav screens | **Not implemented**; show an explicit "planned for phase N" notice | - |

Defect found and fixed during review: the evidence highlight was fixed to one line instead of following the selected field.

Not yet checked: keyboard-only walkthrough, screen reader, contrast measurement (palette was chosen for contrast but not measured), tablet widths, Windows browsers.

## Not started
Bidder UI, AI service and adapters (5), rule engine, risk flags, clarifications, decisions (6), reports, comparison, admin screens, notifications (7), Docker Compose, sample PDFs, Windows full-stack verification (8).
