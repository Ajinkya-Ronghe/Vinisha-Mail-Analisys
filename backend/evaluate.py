"""Reproducible hold-out evaluation for the bootstrap baseline models."""

import json
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier

from .estimators import EncodedXGBoostClassifier
from .model_service import CLASSES, DATASET_PATH, ROOT, load_dataset
from .schemas import EmailInput
from .security_layers import language_indicators, url_layer


def evaluate() -> dict:
    texts, labels = load_dataset(DATASET_PATH)
    train_texts, test_texts, train_labels, test_labels = train_test_split(
        texts, labels, test_size=0.30, random_state=42, stratify=labels
    )
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
    train_matrix = vectorizer.fit_transform(train_texts).toarray()
    test_matrix = vectorizer.transform(test_texts).toarray()
    estimators = [
        ("logistic_regression", LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42)),
        ("random_forest", RandomForestClassifier(n_estimators=120, class_weight="balanced", random_state=42)),
        ("xgboost", EncodedXGBoostClassifier(n_estimators=100, max_depth=3, learning_rate=0.1)),
        ("neural_classifier", MLPClassifier(hidden_layer_sizes=(32,), max_iter=800, random_state=42)),
    ]
    results = {}
    fitted = []
    for name, estimator in estimators:
        estimator.fit(train_matrix, train_labels)
        predictions = estimator.predict(test_matrix)
        fitted.append((name, estimator))
        results[name] = metrics(test_labels, predictions)

    ensemble = VotingClassifier(estimators=fitted, voting="soft")
    ensemble.fit(train_matrix, train_labels)
    results["soft_voting_ensemble"] = metrics(test_labels, ensemble.predict(test_matrix))
    binary_actual = np.asarray(["safe" if label == "safe" else "suspicious" for label in test_labels])
    binary_predictions = []
    for text in test_texts:
        subject, _, body = text.partition("\n")
        email = EmailInput(subject=subject, body=body)
        score = max(language_indicators(email).score, url_layer(email).score)
        binary_predictions.append("suspicious" if score >= 0.25 else "safe")
    results["rule_based_binary_baseline"] = {
        "accuracy": float(accuracy_score(binary_actual, binary_predictions)),
        "classification_report": classification_report(
            binary_actual,
            binary_predictions,
            labels=["safe", "suspicious"],
            output_dict=True,
            zero_division=0,
        ),
        "confusion_matrix": confusion_matrix(
            binary_actual, binary_predictions, labels=["safe", "suspicious"]
        ).tolist(),
    }
    return {
        "warning": "Bootstrap synthetic data only; these metrics are a pipeline check and not research evidence.",
        "dataset": str(DATASET_PATH.relative_to(ROOT)),
        "train_samples": len(train_labels),
        "test_samples": len(test_labels),
        "labels": list(CLASSES),
        "models": results,
    }


def metrics(actual, predicted) -> dict:
    return {
        "accuracy": float(accuracy_score(actual, predicted)),
        "classification_report": classification_report(
            actual, predicted, labels=list(CLASSES), output_dict=True, zero_division=0
        ),
        "confusion_matrix": confusion_matrix(actual, predicted, labels=list(CLASSES)).tolist(),
    }


if __name__ == "__main__":
    result = evaluate()
    destination = ROOT / "reports" / "bootstrap_evaluation.json"
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    print(f"\nSaved {destination}")
