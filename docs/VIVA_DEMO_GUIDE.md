# Viva and application demonstration guide

The supplied video rubric rewards a clear introduction/conclusion (15), coherent argument supported by literature (15), communication (10) and critical reflection (10). Use the application as evidence inside a research argument, not as the whole presentation.

## Suggested 12-minute structure

| Time | Content |
|---:|---|
| 0:00–1:00 | Problem, motivation and research gap |
| 1:00–2:00 | Aim, research questions and scope |
| 2:00–3:15 | Literature synthesis and why a multi-layer design follows |
| 3:15–4:30 | Five-phase methodology, datasets/splits and evaluation |
| 4:30–6:00 | Architecture and integration decision |
| 6:00–8:30 | Live application demonstration |
| 8:30–10:15 | Baseline, model, ablation and zero-day results |
| 10:15–11:15 | Limitations, ethics and organisational feasibility |
| 11:15–12:00 | Objective-by-objective conclusion and contribution |

Adjust the timings to the institution's required duration.

## Demo script

1. Start on the Mail view and identify the Gmail source, not a static mock inbox.
2. Open a safe controlled email, run analysis and briefly show category, risk, explanation and layer chips.
3. Open a harmless phishing test email and show how metadata/URL/language/semantic/ML evidence corroborates the decision.
4. Assign independent ground-truth labels; emphasise that labels are not derived from predictions.
5. Open Research results from the left rail.
6. Explain mailbox summary, four-class confusion matrix, per-class metrics and model/baseline comparison.
7. Point to the bootstrap warning. State that final thesis claims use the independently versioned test datasets.
8. Show one exported JSON result and explain reproducibility/privacy handling.
9. If Ollama is unavailable, demonstrate the designed lexical fallback rather than pausing the viva.

Record a backup screen capture and screenshots in case live OAuth, Gmail or Ollama is unavailable.

## Core argument

Use this chain throughout:

```text
Rigid/single-layer filters miss contextual or novel evidence
→ different email attributes provide complementary signals
→ a transparent multi-layer ensemble can combine them
→ controlled baselines and ablations test the added value
→ temporal unseen tests assess, but do not guarantee, zero-day resilience
```

## Critical reflection points

- Accuracy alone is inadequate with imbalanced threat data; per-class recall/F1 and safe-email FPR matter operationally.
- Synthetic data improves coverage but can inflate performance and introduce generator artefacts.
- Semantic models add contextual reasoning but also latency, non-determinism and prompt/model-version dependence.
- Anomaly scores may detect novelty but can flag legitimate new senders; zero-day claims require temporal/family holdouts.
- Static attachment inspection is safer for the prototype but cannot replace sandbox behaviour analysis.
- A Gmail pilot demonstrates integration feasibility, not enterprise deployment, governance or long-term drift handling.

## Likely questions and concise answers

**Why these four classes?** They match the approved proposal and separate legitimate mail, generic malicious/social-engineering threats, credential/deception phishing and attachment-led malware. The annotation guide resolves overlap.

**Why combine rules and AI?** Rules are transparent and strong for known technical indicators; learned/semantic models capture patterns and intent. Ablations quantify whether the combination adds value.

**Why call the MLP a neural classifier rather than deep learning?** The current implementation is a small scikit-learn MLP. It should not be overstated as a deep architecture unless a separate deep model is implemented and evaluated.

**How is data leakage prevented?** Vocabulary/model fitting uses training data only, while duplicate templates, campaigns, domains and attachment families are grouped into one split. Temporal and external tests remain untouched.

**Does Isolation Forest prove zero-day detection?** No. It provides a novelty score. Evidence comes only from locked-model tests on later/unseen campaigns and families compared with baselines.

**Why local Ollama?** It offers a practical semantic layer with reduced external data disclosure. Experiments must freeze its model digest/prompt and report fallback and latency.

**Can it detect malware?** It detects static attachment risk indicators and combines them with email context. It does not execute files or claim complete malware identification.

**What is the contribution?** A traceable multi-layer prototype plus a controlled evaluation design showing how static, semantic, supervised and anomaly evidence can be compared and combined for four email threat classes.

## Delivery checklist

- Use readable diagrams and result tables rather than code screenshots.
- Cite literature on slides containing external claims.
- Define specialised terms before using them.
- Rehearse transitions and keep within time.
- Keep the bootstrap warning visible and distinguish implementation from final evidence.
- Finish with direct answers to the research questions, main limitation and next research step.
