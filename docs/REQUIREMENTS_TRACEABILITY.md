# Requirements traceability and completion assessment

## Basis

This assessment is based on the following supplied documents:

- `Research Proposal Final Version_Vinisha P.pdf`: research questions (PDF p.10), aim/objectives (p.11), scope (p.13), five-phase methodology (pp.14–19), resources (p.20) and plan (pp.21–22).
- `Rubrics-Thesis.pdf`: thesis criteria and weights.
- `Video-Rubric.pdf`: introduction/conclusion, argument, communication and reflection criteria.
- `PPT on Thesis Writing.pdf`: six-chapter structure, evidence, referencing, conclusions and presentation guidance.

## Overall position

The repository has a credible, demonstrable **prototype implementation** of the proposed multi-layer framework. It does not yet contain enough independently validated evidence to claim that the research objectives have been achieved scientifically. The largest remaining task is the experimental study: licensed real datasets, defensible labels, leakage-safe splits, zero-day tests, statistical comparisons and written analysis.

## Research-question traceability

| ID | Research question, shortened | Current implementation/evidence | Status | Required to answer in thesis |
|---|---|---|---|---|
| RQ1 | Can AI identify malicious/suspicious email more effectively? | Four text classifiers, local semantic model, anomaly detector and combined risk decision; per-model and ensemble reports. | Partially implemented | Evaluate on independent real data and compare with defined conventional baselines using precision, recall, F1, false-positive and false-negative rates. |
| RQ2 | Can AI enhance existing security measures? | AI scores supplement metadata, URL and attachment rules; Gmail messages can be marked with an `AI Suspicious` label. | Partially implemented | Ablation study: rules only vs AI only vs combined; report whether improvement is statistically and operationally meaningful. |
| RQ3 | Which email attributes are most evident? | Subject/body TF-IDF, urgency/credential/payment cues, sender/reply/return domains, SPF/DKIM/DMARC, Message-ID, URLs and attachment indicators. | Partially implemented | Add feature-importance/ablation analysis. Grammar, routing paths, IP/geolocation and attachment-derived features are not comprehensively implemented. |
| RQ4 | Can NLP/ML understand intent? | Local Ollama semantic classification and lexical intent cues are combined with supervised text classifiers. | Partially implemented | Build a labelled intent/tone subset; compare lexical, TF-IDF and semantic representations. Record model/prompt/version and errors. |
| RQ5 | Is combined NLP/ML better for hidden malware and attachments? | Static attachment extension, signature, macro/script and hash inspection contributes to the final ensemble. | Partially implemented | Safe malware-corpus experiment in an isolated lab; compare attachment-only, text-only and combined systems. The app is not a malware sandbox or antivirus engine. |
| RQ6 | Can multiple AI models provide deeper analysis? | Logistic Regression, Random Forest, XGBoost, MLP, Isolation Forest and semantic AI are combined. | Implemented as prototype | Demonstrate generalisation and compare hard/soft voting, weighted averaging and, if retained in the thesis, stacking. Current code uses soft averaging plus layer weights, not stacking. |
| RQ7 | Is multi-layer defence feasible in real environments? | Gmail integration, caching, session restoration, UI explanations, API and account controls demonstrate technical feasibility. | Partially implemented | Measure latency, throughput, failure modes, privacy, OAuth/security, false-positive workload and user/administrator acceptance. No organisational deployment has occurred. |
| RQ8 | How does it perform on zero-day attacks? | Isolation Forest produces an anomaly score from a safe-email baseline. UI correctly describes it as a zero-day proxy. | Pending research evidence | Evaluate on chronologically later/unseen campaigns and novel attachment families excluded from training. Anomaly detection alone is not proof of zero-day detection or vulnerability eradication. |

## Objective traceability

| ID | Proposal objective (PDF p.11) | Repository mapping | Status |
|---|---|---|---|
| O1 | Layered AI/ML/NLP defence that identifies and flags malicious mail | `backend/pipeline.py`, `backend/model_service.py`, `backend/ollama_client.py`, Gmail analysis flow in `src/main.jsx` | Implemented as prototype |
| O2 | Detect attachment, embedded-link and sender warning indicators | `backend/security_layers.py`; layer explanations in the reading pane | Implemented for static indicators; deeper content/link reputation remains pending |
| O3 | Evaluate NLP classifiers, neural networks and anomaly detection together | `backend/evaluate.py`, `/evaluation`, Research dashboard | Partially implemented; bootstrap-only evaluation is not final evidence |
| O4 | Measure against conventional detection | Rule-based binary baseline in `backend/evaluate.py` | Partially implemented; needs stronger comparable baselines on research data |
| O5 | Measure zero-day effectiveness | Isolation Forest layer | Pending research evidence |
| O6 | Identify real-time organisational deployment challenges | Gmail prototype exposes latency, OAuth and privacy considerations | Pending structured study and analysis |
| O7 | Contribute towards resilient inboxes | Explainable risk scoring and Gmail labelling demonstrate the concept | Pending evidence and defensible conclusions |

## Five-phase methodology status

| Phase | Proposal requirement | Current state | Main gap |
|---|---|---|---|
| 1 | Real + synthetic data, four classes, cleanup and encoding | Four labels and TF-IDF encoding; small synthetic CSV | Acquire/version real datasets; provenance, deduplication, HTML parsing, metadata schema, class balance and independent splits |
| 2 | Generative-AI semantic features | Ollama `llama3.2` produces category, score and explanation | Reproducible prompt/model settings, embedding experiment and labelled semantic evaluation |
| 3 | LR, XGBoost, neural classifier, Random Forest, anomaly detector | All five are executable | Hyperparameter selection on validation data, calibration, persistence, tuning log and robust evaluation |
| 4 | Multi-layer Python architecture | Metadata, URL, attachment, language, semantic AI, ML, anomaly and final integration | External reputation/sandbox integrations and production hardening are intentionally absent |
| 5 | Metrics, confusion matrix, baseline and zero-day comparison | Bootstrap report plus live labelled-mail metrics/dashboard/export | Final experimental datasets, FP/FN analysis, temporal zero-day tests, confidence intervals and significance testing |

## Application evidence added for the proposal

- The Research app in the left rail displays current mailbox counts, average risk, suspicious decisions and anomaly indicators.
- A reviewer can assign one of the proposal's four ground-truth categories to an analysed message.
- The dashboard calculates a live four-class confusion matrix, accuracy and per-class precision, recall and F1.
- The dashboard displays saved bootstrap comparisons for every individual model, the ensemble and a rule-based baseline.
- Export creates a timestamped JSON evidence file containing labels, predictions, layer scores and aggregate metrics.
- `/framework` exposes the categories, models, layers, weights, threshold and honest limitations; `/evaluation` exposes the saved evaluation report.

## Important correction before thesis submission

The proposal's false-positive/false-negative wording on PDF p.18 is internally reversed. Use the standard definitions consistently:

- **False positive (FP):** a legitimate/safe email incorrectly flagged as malicious.
- **False negative (FN):** a malicious email incorrectly allowed as legitimate/safe.

## Claims that must not be made yet

- Do not report bootstrap accuracy as research performance.
- Do not state that zero-day threats are detected or eradicated; only state that anomaly detection is implemented and awaits unseen-data validation.
- Do not describe static attachment checks as virus removal, sandbox execution or complete malware detection.
- Do not state that organisational feasibility is proven by a local Gmail prototype.
- Do not claim stacking, SentenceTransformers, BERT, PyOD, pandas, TensorFlow or PyTorch are implemented unless they are actually added and evaluated. The current equivalents are Ollama, TF-IDF, scikit-learn MLP, Isolation Forest and XGBoost.
