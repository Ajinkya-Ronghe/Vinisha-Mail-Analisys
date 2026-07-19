# Test plan

## Purpose

This plan separates software verification from research evaluation. Passing software tests shows that the implementation behaves as specified; it does not establish detection effectiveness on the target population.

## Safe test environment

- Use a dedicated Gmail test account and messages containing invented identities/data.
- Do not send real credentials, active phishing pages or executable malware.
- Use non-resolving/example domains and harmless text fixtures.
- Test attachment indicators with plain files renamed to suspicious extensions or standard harmless security-test content only where organisational policy permits.
- Use an isolated authorised laboratory for any real malware evaluation; keep binaries out of this repository and Gmail.

## Automated tests

Current command:

```bash
./.venv/bin/python -m unittest discover -s tests -v
```

Current coverage verifies high-risk attachment/double-extension indicators, sender/authentication anomalies and suspicious IP/login URLs.

Add the following priority tests:

| ID | Area | Input/condition | Expected result |
|---|---|---|---|
| UT-M01 | Metadata | aligned sender/reply/return + SPF/DKIM/DMARC pass | low score; passed finding |
| UT-M02 | Metadata | each auth failure independently | correct finding and bounded score |
| UT-U01 | URL | shortened, punycode, IP and HTTP login links | appropriate indicators; score ≤ 1 |
| UT-U02 | URL | safe HTTPS link | no obvious static warning |
| UT-A01 | Attachment | executable magic with benign filename | executable-content indicator |
| UT-A02 | Attachment | invalid base64 | graceful finding; no crash |
| UT-L01 | Language | urgency + credential request | increased language score |
| UT-P01 | Pipeline | Ollama unavailable | lexical fallback and valid response |
| UT-P02 | Pipeline | strong attachment risk | suspicious decision regardless of average |
| UT-API01 | API | valid `/analyze` body | schema-valid 200 response |
| UT-API02 | API | missing report | `/evaluation` returns explanatory 404 |
| UT-E01 | Evaluation | fixed seed | repeatable split/report shape |

Frontend automation should cover account-scoped IndexedDB keys, cache reuse, forced refresh, session expiry, account switch isolation, ground-truth persistence, confusion-matrix calculations and export schema.

## Manual Gmail scenarios

Send from the test account to itself or another controlled test account. These examples intentionally use harmless destinations.

### T01 — legitimate email

Subject: `Meeting notes for Monday`

Body: `Hello, attached are the notes we discussed. No action is required before Monday.`

Expected: likely safe; explain any false alert and record it rather than changing the label to match the prediction.

### T02 — credential phishing language

Subject: `URGENT: verify your account now`

Body: `Your access is blocked. Sign in immediately at http://192.0.2.10/login to verify your password.`

Expected: URL, language, semantic and ML indicators; phishing/suspicious decision.

### T03 — payment/social-engineering threat

Subject: `Confidential wire transfer`

Body: `I need an urgent wire transfer today. Do not contact anyone else. Reply when complete.`

Expected: urgency/payment indicators; threat/suspicious decision.

### T04 — suspicious attachment metadata

Attach a harmless empty file named `invoice.pdf.exe` only if Gmail permits it; otherwise submit the same fixture directly to the local `/analyze` endpoint. Never create an executable payload.

Expected: double-extension and high-risk type findings; malware/suspicious decision where content is supplied.

### T05 — benign attachment

Attach a normal `.txt` or `.pdf` containing harmless meeting notes.

Expected: low attachment score; a high score is a false positive to investigate.

### T06 — semantic impersonation

Subject: `Message from the director`

Body: `I am in a meeting and need you to buy gift cards immediately. Keep this confidential.`

Expected: semantic/language risk even without a link or attachment.

### T07 — unusual but legitimate email

Use a legitimate first-time sender, uncommon vocabulary and no malicious request.

Expected: anomaly may rise, but the final decision should be reviewed. This is an important zero-day false-positive control.

## Manual workflow

1. Start the app with `npm run dev` and confirm `/health` responds.
2. Sign in to the dedicated Google test account.
3. Load Inbox; reload the browser and confirm the account session and cached mailbox restore.
4. Run **AI scan** and record semantic-model availability and analysis time.
5. Open each test message, save the independently decided **Research ground truth**, then inspect layer findings.
6. Open **Research results**, verify totals and confusion-matrix counts manually.
7. Export results, inspect the JSON, anonymise identifiers and save it with the experiment record.
8. Select **Refresh** and confirm Gmail is re-read; reload normally and confirm cached analysed results are reused.
9. Switch account and verify the previous account's messages are not displayed.

## Acceptance criteria

### Software release gate

- Frontend production build completes.
- All automated tests pass.
- API health, framework, evaluation and analysis paths behave as documented.
- No access token/client secret is committed.
- App remains usable if Ollama is stopped; fallback is visible in the explanation.
- Cache and session data never cross accounts.
- Ground-truth metrics match a hand-calculated fixture.

### Research experiment gate

- Dataset provenance/licence and annotation guide are approved.
- Duplicate/campaign leakage checks pass.
- Training/validation/test and temporal manifests are frozen.
- Baselines, full model, ablations and zero-day protocol run on identical records.
- All principal metrics include sample counts and uncertainty.
- False positives/negatives receive qualitative error analysis.
- Results and limitations can be regenerated from the recorded commit/configuration.

## Evidence record template

```text
Test/experiment ID:
Date and operator:
Git commit:
Environment:
Input fixture or dataset manifest:
Expected outcome:
Observed outcome:
Pass/fail:
Screenshot/report path:
Defect or limitation:
Reviewer:
```
