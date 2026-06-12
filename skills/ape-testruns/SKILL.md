---
name: ape-testruns
description: Use after completing any verification/test session whose outcome should be presented to a human — package the evidence (screenshots + descriptions + pass/fail) as a test run, upload it to testrun.openape.ai, and present the single report link as proof.
---

# ape-testruns — share a link that proves it works

When you verify something (E2E test, bugfix check, feature demo) and the
result needs to reach a human, don't paste walls of logs — upload a test run
and present one link.

## Workflow

1. **Capture while verifying.** Save screenshots (headless Chrome/Playwright)
   into a run directory, grouped per test:

   ```
   out/
   ├─ testrun.json
   └─ login/01-landing.png …
   ```

2. **Write `testrun.json`** — get the format with `ape-testruns docs manifest`.
   Captions are product-style markdown ("The dashboard greets the user by
   name — the session is live."), not test-speak.

3. **Upload and present:**

   ```bash
   URL=$(ape-testruns upload ./out --title "Login flow E2E")
   ```

   stdout is exactly the URL. Present it with the verdict:
   "Proof: <URL> (3 passed, 1 failed)".

## Rules

- Auth is the unified apes session (`apes login` once per device). If upload
  fails with NotLoggedInError, ask the human to run `apes login <email>`.
- Failed runs get uploaded too — a failure link is evidence, not noise.
- Runs are immutable: re-verification = new upload, new link.
- No secrets in screenshots or captions; the link is public to whoever has it.
- Local/dev instance: `--endpoint http://localhost:3006` or
  `APE_TESTRUNS_ENDPOINT`.
