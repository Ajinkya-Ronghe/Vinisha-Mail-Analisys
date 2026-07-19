# Research methodology and experiment protocol

This protocol converts the proposal's five phases (PDF pp.14–19) into repeatable work. Pre-register the final choices where possible and keep the untouched test sets sealed until models and thresholds are frozen.

## 1. Research artefacts and versioning

For every run, record:

- experiment ID, UTC time, Git commit and environment/package versions;
- dataset names, versions, licences, acquisition dates and checksums;
- inclusion/exclusion, deduplication and label rules;
- train/validation/test row identifiers or manifests;
- preprocessing, model parameters, random seeds and layer weights;
- Ollama model digest, complete prompt and inference parameters;
- metrics, confusion matrices, latency and failure logs.

Do not place restricted mail content or malware binaries in Git. Commit only manifests, hashes, safe fixtures, scripts and aggregate results allowed by the data licence.

## 2. Phase 1 — data gathering and preparation

### Proposed data groups

Use an approved subset of the proposal's candidates after confirming availability, licence and label quality:

- legitimate mail: Enron and SpamAssassin ham;
- phishing/spam: SpamAssassin, phishing corpora and campaign feeds where message content is legally distributable;
- URL intelligence: PhishTank/OpenPhish indicators joined only by an explicitly documented rule and date;
- malware email/attachments: authorised institutional or research collections in an isolated environment;
- synthetic/adversarial mail: generated templates clearly tagged with generator, prompt and source scenario.

Do not assume a URL feed is itself an email corpus. Do not combine sources without documenting how records and labels were joined.

### Canonical schema

At minimum store: `record_id`, source, collection time, four-class label, label provenance/confidence, subject, text body, HTML-derived text, sender/reply/return domains, selected authentication results, received/routing features, extracted URL features, attachment metadata/hashes and campaign/family group. Personal data should be removed or irreversibly pseudonymised where possible.

### Cleaning

1. Parse MIME safely and select text/HTML parts without executing content.
2. Convert HTML to visible text; remove scripts, style and redundant markup.
3. Normalise Unicode and whitespace while retaining an untouched raw reference where permitted.
4. Extract metadata, URLs and attachment features before text-only processing.
5. Detect exact and near duplicates. Keep every duplicate/campaign group in one split.
6. Tokenise/TF-IDF using training data only; never fit vocabulary or scaling on validation/test data.
7. Record missing fields rather than silently replacing absence with a benign value.

### Labels

Use `safe`, `threat`, `phishing`, and `malware`. Write an annotation guide explaining boundary cases. At least two annotators should review a representative subset; report agreement and adjudication. Keep `threat` for malicious/social-engineering content not meeting the phishing or malware definition.

### Splits

- Training: 60–70% for model fitting.
- Validation: 10–20% for parameters, threshold, probability calibration and weights.
- In-distribution test: 20% untouched until freeze.
- Temporal/zero-day test: later campaigns/families never present in training or validation.
- External test: preferably a source not used during development.

Split by campaign, sender/domain family, template cluster and attachment family before row-level sampling to prevent leakage. Report both natural prevalence and a balanced diagnostic test; do not mix their interpretations.

## 3. Phase 2 — semantic feature experiments

Compare at least:

1. transparent lexical language indicators;
2. TF-IDF supervised models;
3. local generative semantic score/category;
4. optional frozen sentence embeddings plus a simple classifier;
5. semantic + metadata/URL/attachment combination.

Create intent tags such as urgency, credential request, payment request, impersonation and intimidation for a reviewed subset. Measure classification and calibration, and conduct qualitative error analysis across language, grammar quality and AI-generated phishing.

## 4. Phase 3 — model training

Use the four current supervised classifiers and Isolation Forest. Select a bounded parameter grid in advance. Handle imbalance with class weights and report per-class results rather than relying on accuracy. Persist the chosen vectorizer/models, checksums and configurations.

Recommended comparisons:

- Logistic Regression;
- Random Forest;
- XGBoost;
- neural classifier;
- soft-voting ML ensemble;
- anomaly detector as a separate detector/score;
- rule-only conventional baseline.

If the thesis discusses stacking, implement a leakage-safe out-of-fold meta-model and compare it. Otherwise remove stacking from claims and state that the implemented integration uses soft probability averaging and weighted layer fusion.

## 5. Phase 4 — multi-layer and ablation study

Freeze the chosen risk threshold and weights using validation data. Evaluate these configurations on the same test records:

| Configuration | Purpose |
|---|---|
| Rules only | Conventional baseline |
| Text ML only | Contribution from learned text patterns |
| Semantic AI only | Intent/tone contribution |
| Metadata + URL + attachment | Non-text/static defence |
| ML ensemble | Multi-model benefit |
| Full framework | Proposed architecture |
| Full minus each layer | Ablation/feature-family importance |

The ablation results directly address which aspects of email are most evident (RQ3) and whether AI enhances existing measures (RQ2).

## 6. Phase 5 — metrics and comparison

For each four-class model report:

- confusion matrix;
- per-class precision, recall, F1 and support;
- macro, weighted and micro averages;
- overall and balanced accuracy;
- safe-versus-malicious false-positive rate and false-negative rate;
- ROC-AUC/PR-AUC where calibrated scores and one-vs-rest analysis are appropriate;
- latency median/p95, semantic-model availability and processing failure rate.

Definitions:

```text
Precision = TP / (TP + FP)
Recall    = TP / (TP + FN)
F1        = 2 × Precision × Recall / (Precision + Recall)
FPR       = FP / (FP + TN)
FNR       = FN / (FN + TP)
```

Use stratified bootstrap confidence intervals for principal metrics. For paired classifiers on the same binary safe/malicious decisions, consider McNemar's test; for score comparisons, use an appropriate paired resampling method. Report practical differences and uncertainty, not only p-values.

## 7. Zero-day protocol

Define “zero-day” operationally as a campaign/template/domain/attachment family and time period excluded from all training, validation and threshold selection. It does not mean the software discovers unknown software vulnerabilities.

1. Group records by campaign/template and attachment family.
2. Train only on groups before cutoff date `T`.
3. Lock all models, prompt, threshold and weights.
4. Test on later groups and explicitly held-out families.
5. Compare rules, supervised models, anomaly detector and full framework.
6. Report malicious recall, FNR, safe FPR, time-to-detection and failure examples.
7. Repeat across several cutoffs/families if sample size permits.

Only conclude that the anomaly layer helped if the full or anomaly-enabled system improves unseen-group performance without an unacceptable increase in safe-email false positives.

## 8. Real-world feasibility protocol

Run a controlled pilot on a dedicated mailbox using benign test messages. Record:

- throughput and end-to-end/p95 latency with and without Ollama;
- Gmail/API/OAuth failures, cache behaviour and model fallback rate;
- CPU, RAM and model start time;
- false-alert review time and effect of explanations;
- privacy/data-retention controls and administrator/user feedback;
- model drift and update procedure.

This supports a feasibility discussion; it is not an organisational deployment unless formally approved and studied.

## 9. Current runnable software check

```bash
./.venv/bin/python -m unittest discover -s tests -v
./.venv/bin/python -m backend.evaluate
npm run build
```

Open the Research app from the left rail. Analyse test messages, assign ground-truth categories in the reading pane, review live metrics and export JSON. Keep the displayed bootstrap validity warning in screenshots and explain it in the thesis.

## 10. Result table template

| Experiment ID | Dataset/split | Model/layers | Accuracy | Macro F1 | Safe FPR | Malicious FNR | p95 latency | 95% CI | Notes |
|---|---|---|---:|---:|---:|---:|---:|---|---|
| EXP-___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ ms | ___ | ___ |

For every objective, link the final method, one or more result tables/figures and the conclusion that the evidence supports. Negative or inconclusive results are valid findings when reported accurately.
