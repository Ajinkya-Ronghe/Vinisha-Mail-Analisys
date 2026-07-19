# MailDesk multi-layer AI email defense

MailDesk is a research prototype that connects to Gmail and analyses incoming messages with a Python multi-layer security pipeline. The React interface displays the final category, risk score, explanation, layer scores, and Gmail `AI Suspicious` label.

The application now includes a **Research results** view in the left app rail. It supports manual four-class ground-truth labels, live confusion matrices, accuracy, per-class precision/recall/F1, model and rule-baseline comparisons, anomaly counts and a timestamped JSON evidence export.

## Implemented security layers

1. Metadata validation: sender, Reply-To, Return-Path, Message-ID, SPF, DKIM and DMARC indicators.
2. URL analysis: IP links, shorteners, punycode, obfuscation and insecure sensitive-action links.
3. Attachment analysis: risky and double extensions, executable signatures, macro/script indicators and SHA-256 calculation for inspected samples.
4. Language indicators: urgency, credentials, payment pressure and forceful writing.
5. Semantic Generative AI: local Ollama `llama3.2:latest` intent and tone analysis.
6. Machine learning: Logistic Regression, Random Forest, XGBoost and a neural-network classifier.
7. Anomaly detection: Isolation Forest trained against the safe bootstrap samples.
8. Ensemble integration: transparent weighted soft voting across the independent layers.

The result categories are `safe`, `threat`, `phishing`, and `malware`.

## Mailbox cache

Loaded mailboxes are cached in browser IndexedDB for six hours using the signed-in account, folder, and search query as the cache key. Returning to an already loaded mailbox reuses its messages and completed AI results instead of downloading and scanning them again. The **Refresh** button deliberately bypasses the cache to check Gmail for new messages. Signing out does not expose one account's cache to another account because every entry is account-scoped; clearing site data removes all cached mail.

The Google access token is kept in browser `sessionStorage` until its reported expiry, allowing a page reload in the same tab to restore the Gmail session. It is removed on explicit sign-out, expiry, or a Gmail `401` response. Closing the tab ends this short-lived session; the token is intentionally not stored in persistent `localStorage`.

## Install

Requirements:

- Node.js 20.19+ or 22.12+
- Python 3.9+
- Ollama with `llama3.2:latest`

macOS/Linux:

```bash
npm install
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
ollama pull llama3.2
```

On macOS, XGBoost also requires OpenMP:

```bash
brew install libomp
```

Windows PowerShell:

```powershell
npm.cmd install
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
ollama pull llama3.2
```

## Run

Start the Python API and React frontend together:

```bash
npm run dev
```

The application runs at `http://127.0.0.1:8000`, and API documentation is available at `http://127.0.0.1:8001/docs`.

To run the services separately, start the API in one terminal:

```bash
./.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
```

On Windows use `.\.venv\Scripts\python.exe` in place of `./.venv/bin/python`. Start only the frontend in another terminal with:

```bash
npm run dev:web
```

## Google setup

1. Enable the Gmail API in a Google Cloud project.
2. Configure the OAuth consent screen and add the Gmail account as a test user.
3. Create a Web Application OAuth client.
4. Add `http://localhost:8000` and `http://127.0.0.1:8000` as authorized JavaScript origins as required.
5. Ensure the consent screen permits these scopes:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/gmail.labels`

The client ID is read only from the ignored `.env.local` file. Copy `.env.example` and provide your Google OAuth Web Application client ID:

```bash
cp .env.example .env.local
```

Then edit `.env.local`. Do not commit `.env.local`, downloaded `client_secret*.json` files, or access tokens. Google OAuth client IDs are public browser identifiers rather than client secrets, but keeping environment-specific IDs outside source code avoids accidental configuration commits.

After changing scopes, revoke the application's existing Google access and sign in again.

## Tests and evaluation

```bash
./.venv/bin/python -m unittest discover -s tests -v
./.venv/bin/python -m backend.evaluate
```

Evaluation output is saved to `reports/bootstrap_evaluation.json` and includes accuracy, per-class precision, recall, F1 scores, confusion matrices, a conventional rule-based baseline, each ML model, and the soft-voting ensemble.

The API also exposes:

- `GET /framework` for auditable models, layers, weights, threshold and limitations;
- `GET /evaluation` for the saved bootstrap report.

To create live mailbox metrics, analyse controlled test messages, open each message and set **Research ground truth**. Then open **Research results** from the left app rail. The label is cached with that account's mailbox data. Exported JSON can contain message identifiers, sender addresses and subjects; anonymise it before sharing or publication.

## Proposal-aligned documentation

Start with [`docs/README.md`](docs/README.md). It links the detailed:

- requirement and objective traceability assessment;
- architecture and implementation specification;
- research methodology and experiment protocol;
- safe software/research test plan;
- thesis rubric and chapter-writing guide;
- viva and live-demonstration guide.

## Research limitation

`data/bootstrap_emails.csv` is a tiny synthetic dataset supplied to make every pipeline layer runnable. Its metrics are not thesis evidence. Before reporting research results, replace or augment it with documented public and synthetic datasets; create independent training, validation, temporal, and zero-day sets; and compare the ensemble against rule-based and individual-model baselines.

Attachment inspection is deliberately limited to files no larger than 512 KiB in the browser prototype. Static indicators do not replace an isolated malware sandbox, antivirus engine, YARA rules, or organizational email gateway.
