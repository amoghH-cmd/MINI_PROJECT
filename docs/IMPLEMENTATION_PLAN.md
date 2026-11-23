# Implementation plan and progress

## What was in the uploaded ZIP

The archive flattened original folder paths. Source files were reconstructed into frontend, backend, AI service, sample-data and tests. Existing phase 3–5 modules are preserved, including role-based JWT authentication, tender management, document uploads, MongoDB job queue, AI extraction handlers, and a preliminary officer dashboard. Original status register is preserved as `status-and-mock-vs-real.md` but contains historical statements and is **not** a current verification report.

## Implemented in this continuation

- Reconstructed project folders and relative import paths.
- Implemented bidder workspace using actual tender/submission APIs, not fictional demo counts.
- Implemented bidder organisation registration/editing using backend validation, with immutable GSTIN/PAN.
- Implemented tender detail and approved requirement display for bidders.
- Implemented create submission, document upload by category, replacement, processing status, checklist and final submission confirmation.
- Kept five-role navigation and the government-inspired styling from the existing frontend.

## Next priorities

1. Run install/build and tests on a machine with npm registry and MongoDB access; fix any environment-specific issues.
2. Build staff-side bidder register and real evidence PDF viewer using extracted field bounding boxes.
3. Implement deterministic rule engine for the eight rule types; use versioned approved requirements only.
4. Implement reviewer recommendations, clarification workflows, officer-only qualification decisions, and reports.
5. Add real integration/E2E tests for bidder registration, uploads and submit workflow.
6. Production hardening: CSRF review, file lifecycle/cleanup, transactional writes, observability, security and accessibility audit.

## Required environment

Backend `config/env.js` validates the required keys. Create a private `backend/.env` with at least `MONGO_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_ORIGIN`, `SEED_DEMO_PASSWORD`, and AI-service URL/token fields as required by the current config. Consult that source for exact key names and constraints. Do not commit secrets.

## Verification limitations

A full npm install/build/test could not be run in this sandbox due to unavailable package installation. Backend integration tests require MongoDB. The new UI must be verified in a browser before deployment. AI output is advisory, not a compliance decision.
