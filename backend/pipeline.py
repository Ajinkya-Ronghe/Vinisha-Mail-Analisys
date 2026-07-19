import asyncio
from typing import Dict, List

from .model_service import CLASSES, ModelService
from .ollama_client import analyze_semantics
from .schemas import AnalysisResponse, EmailInput, LayerResult
from .security_layers import attachment_layer, language_indicators, metadata_layer, url_layer

LAYER_WEIGHTS = {
    "semantic_ai": 0.30,
    "machine_learning": 0.30,
    "metadata": 0.13,
    "urls": 0.10,
    "attachments": 0.12,
    "anomaly_detection": 0.05,
}
RISK_THRESHOLD = 0.48


class AnalysisPipeline:
    def __init__(self):
        self.models = ModelService()

    async def analyze(self, email: EmailInput, use_ollama: bool = True) -> AnalysisResponse:
        metadata = metadata_layer(email)
        urls = url_layer(email)
        attachments, _hashes = attachment_layer(email.attachments)
        language = language_indicators(email)
        class_probabilities, model_scores, anomaly_score = self.models.predict(email.subject, email.body)
        anomaly = LayerResult(
            score=anomaly_score,
            findings=[
                "Message differs from the safe-email baseline"
                if anomaly_score >= 0.55
                else "Message is reasonably similar to the safe-email baseline"
            ],
        )

        if use_ollama:
            semantic_data = await asyncio.to_thread(analyze_semantics, email)
        else:
            semantic_data = {
                "available": False,
                "category": "threat",
                "risk_score": language.score,
                "reason": "Semantic model disabled for this request.",
            }
        semantic_score = float(semantic_data["risk_score"]) if semantic_data["available"] else language.score
        semantic = LayerResult(score=semantic_score, findings=[str(semantic_data["reason"])])

        ml_risk = 1.0 - class_probabilities.get("safe", 0.0)
        ml_findings = [
            f"ML ensemble favours {max(class_probabilities, key=class_probabilities.get)} "
            f"({max(class_probabilities.values()):.0%})"
        ]
        ml = LayerResult(score=ml_risk, findings=ml_findings)

        # Each independent layer contributes to a transparent soft-voting decision.
        risk_score = (
            LAYER_WEIGHTS["semantic_ai"] * semantic.score
            + LAYER_WEIGHTS["machine_learning"] * ml.score
            + LAYER_WEIGHTS["metadata"] * metadata.score
            + LAYER_WEIGHTS["urls"] * urls.score
            + LAYER_WEIGHTS["attachments"] * attachments.score
            + LAYER_WEIGHTS["anomaly_detection"] * anomaly.score
        )
        risk_score = max(0.0, min(1.0, risk_score))
        corroborated_ml_risk = ml.score >= 0.75 and max(metadata.score, urls.score, language.score) >= 0.25
        suspicious = (
            risk_score >= RISK_THRESHOLD
            or attachments.score >= 0.55
            or metadata.score >= 0.70
            or corroborated_ml_risk
        )

        category_scores: Dict[str, float] = {name: float(class_probabilities.get(name, 0.0)) for name in CLASSES}
        semantic_category = str(semantic_data["category"])
        if semantic_data["available"] and semantic_category in category_scores:
            category_scores[semantic_category] += 0.35
        category_scores["phishing"] += 0.30 * urls.score + 0.18 * metadata.score
        category_scores["malware"] += 0.55 * attachments.score
        category_scores["threat"] += 0.20 * language.score + 0.15 * anomaly.score
        if not suspicious:
            category = "safe"
        else:
            category = max(("threat", "phishing", "malware"), key=lambda item: category_scores[item])

        layers = {
            "metadata": metadata,
            "urls": urls,
            "attachments": attachments,
            "language": language,
            "semantic_ai": semantic,
            "machine_learning": ml,
            "anomaly_detection": anomaly,
        }
        indicators = _rank_findings(layers)
        reason = semantic.findings[0] if semantic_data["available"] else (indicators[0] if indicators else ml_findings[0])
        confidence = risk_score if suspicious else 1.0 - risk_score
        model_scores = {**model_scores, "semantic_ai": semantic.score, "anomaly_detection": anomaly.score}
        return AnalysisResponse(
            suspicious=suspicious,
            category=category,
            confidence=confidence,
            risk_score=risk_score,
            reason=reason,
            indicators=indicators,
            layers=layers,
            model_scores=model_scores,
        )


def _rank_findings(layers: Dict[str, LayerResult]) -> List[str]:
    ignored = ("No ", "Checked ", "Message is reasonably", "SPF, DKIM")
    ranked = sorted(layers.values(), key=lambda item: item.score, reverse=True)
    findings: List[str] = []
    for layer in ranked:
        findings.extend(item for item in layer.findings if not item.startswith(ignored))
    return list(dict.fromkeys(findings))[:8]
