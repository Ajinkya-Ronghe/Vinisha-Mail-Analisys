# MailDesk research documentation

These documents translate the proposal and assessment PDFs in `requirement_docs/` into an implementation and evidence plan.

- [Requirements traceability](REQUIREMENTS_TRACEABILITY.md) — proposal question/objective to code, evidence and remaining work.
- [Architecture and implementation](ARCHITECTURE_AND_IMPLEMENTATION.md) — layers, models, data flow, API and limitations.
- [Research methodology and experiments](RESEARCH_METHODOLOGY_AND_EXPERIMENTS.md) — reproducible dataset, split, baseline, metric and zero-day protocol.
- [Test plan](TEST_PLAN.md) — unit, integration, Gmail and research acceptance tests.
- [Thesis writing guide](THESIS_WRITING_GUIDE.md) — chapter structure and rubric coverage.
- [Viva and demonstration guide](VIVA_DEMO_GUIDE.md) — presentation flow, demo script and likely questions.

## Evidence labels

The documents consistently use these labels:

- **Implemented**: present and executable in this repository.
- **Partially implemented**: working prototype support exists, but the proposal's complete claim is not yet demonstrated.
- **Pending research evidence**: requires an independent dataset, controlled experiment, analysis or deployment study.
- **Out of scope**: excluded by the proposal or unsafe/inappropriate for the prototype.

The synthetic bootstrap report is a software check. It must not be presented as the thesis's final empirical result.
