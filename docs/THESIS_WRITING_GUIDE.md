# Thesis writing guide aligned to the supplied rubrics

## Assessment priorities

Use the exact institutional template and current word limit. The supplied thesis rubric weights are:

| Area | Weight | What the thesis must demonstrate |
|---|---:|---|
| Structure, layout and academic writing | 5% | Consistent formatting, figures/tables, terminology and readable academic prose |
| Introduction | 10% | Context, problem, gap, aim, objectives/questions, scope and chapter map |
| Literature review | 15% | Critical synthesis of recent, relevant work and a justified research gap |
| Research methods | 20% | Reproducible design, data, preprocessing, models, metrics, ethics and validity |
| Analysis/implementation | 20% | Justified architecture and an accurate account of what was built |
| Results/discussion | 15% | Evidence, baseline/ablation comparisons, error analysis and relation to literature |
| Conclusions/recommendations | 10% | Objective-by-objective conclusions, contribution, limits and future work |
| Citations/references | 5% | Complete, consistent and verifiable sources |

## Front matter

Include title page, declaration, acknowledgements, abstract, table of contents, list of figures, list of tables and abbreviations. Write the abstract last: problem, aim, method, principal results, contribution and limitation, without citations or unsupported claims.

## Chapter 1 — Introduction

1. Establish email as an attack channel and explain why rigid rules are insufficient.
2. Define phishing, malware, threat, anomaly and multi-layer defence consistently.
3. State the precise research gap: limited joint evidence across semantic, learned and static email features, especially on unseen campaigns and deployment feasibility.
4. Reproduce the approved aim, objectives and eight research questions or an approved consolidated set.
5. State the scope from proposal PDF p.13: email analysis and deployment implications, excluding physical security/network intrusion and direct organisational deployment.
6. Summarise contributions without claiming results before they are demonstrated.
7. End with a chapter roadmap.

## Chapter 2 — Literature review

Organise by argument rather than one paper per paragraph:

- conventional rule/signature/reputation filtering and limitations;
- email text/NLP representations and phishing-intent detection;
- metadata, sender authentication, URL and attachment analysis;
- supervised ML, deep/neural and ensemble approaches;
- anomaly/novel-campaign detection and what “zero-day” means in email research;
- explainability, privacy, latency and real-world adoption;
- dataset leakage, temporal evaluation, imbalance and reproducibility.

For each theme compare datasets, classes, split methods, baselines, metrics and limitations. Finish with a table of related work and a clear gap-to-design argument. Verify every reference/DOI and publication status. Because the proposal is dated April 2026 and includes very recent citations, do not rely on a citation until the final publication record has been checked.

## Chapter 3 — Methodology

Follow the five proposal phases and the protocol in `RESEARCH_METHODOLOGY_AND_EXPERIMENTS.md`:

- research philosophy/design and hypotheses where appropriate;
- sources, licences, sampling, canonical schema and four-class annotation;
- privacy/ethics, data minimisation and safe malware handling;
- preprocessing and leakage prevention;
- model/semantic prompt configurations and reproducibility;
- train/validation/test, external and temporal zero-day splits;
- baseline, ensemble and ablation experiment design;
- metrics, confidence intervals/significance and error analysis;
- threats to construct, internal, external and conclusion validity.

Justify every choice. A library list is not a methodology.

## Chapter 4 — Analysis and implementation

Describe the actual repository, not the proposal's aspirational technology list:

- Gmail/OAuth/browser/cache/API context;
- input schema and MIME/header/attachment sampling;
- each static, semantic, supervised and anomaly layer;
- TF-IDF, classifiers and model settings;
- soft probability averaging and weighted layer integration;
- category decision, threshold and explanations;
- Research dashboard and evidence export;
- security/privacy decisions, fallback behaviour and limitations.

Include architecture, sequence and component diagrams; pseudocode for final integration; and small interface screenshots. Reference every figure/table in the text before or immediately after it.

## Chapter 5 — Results and discussion

Suggested order:

1. Dataset composition and quality checks.
2. Individual models and conventional baseline.
3. Ensemble and full multi-layer result.
4. Ablation/feature-family importance for RQ2/RQ3.
5. Semantic/intent subset for RQ4.
6. Attachment/text combination for RQ5.
7. Temporal/unseen results for RQ8.
8. Latency/reliability/usability for RQ7.
9. False-positive and false-negative case analysis.
10. Comparison with literature and threats to validity.

Every table needs dataset/split, sample count and metric definition. Explain surprising or negative results. Do not interpret a high synthetic-bootstrap score as generalisation.

## Chapter 6 — Conclusion and recommendations

Answer each research question with one of: supported, partially supported, not supported or inconclusive, followed by the exact evidence. Then state contributions, limitations, recommendations and bounded future work. Do not introduce new experiments or literature in the conclusion.

## Suggested figures and tables

- Research design phases and dataset flow.
- System context and analysis pipeline.
- Canonical feature schema.
- Dataset source/class/split distribution.
- Model/hyperparameter table.
- Per-model metrics and confidence intervals.
- Full four-class confusion matrices.
- Rules/AI/full and layer-ablation comparison.
- Temporal zero-day performance.
- Latency/resource/failure results.
- Objective → method → result → conclusion traceability matrix.

## Final submission checklist

- Every objective appears in methodology, results and conclusion.
- Results use the untouched test manifests, not bootstrap data.
- FP/FN definitions are corrected and used consistently.
- “Zero-day” has an operational definition and no eradication claim.
- All tables/figures are numbered, captioned, legible and cited in text.
- Every in-text citation has one reference entry and vice versa.
- Direct quotation is rare, marked and page-cited; paraphrases still cite sources.
- Acronyms are expanded once; labels/model names are consistent.
- Grammar, spelling, pagination, headings and institutional formatting are checked.
- Appendices contain proposal, annotation guide, prompts/configurations, ethics approval where applicable, detailed metrics and test evidence.
