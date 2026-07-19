import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier


class EncodedXGBoostClassifier(ClassifierMixin, BaseEstimator):
    """XGBoost adapter that preserves the project's human-readable class names."""

    def __init__(self, n_estimators=100, max_depth=3, learning_rate=0.1, random_state=42):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.random_state = random_state

    def fit(self, features, labels):
        self.encoder_ = LabelEncoder().fit(labels)
        self.classes_ = self.encoder_.classes_
        self.model_ = XGBClassifier(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            learning_rate=self.learning_rate,
            objective="multi:softprob",
            eval_metric="mlogloss",
            random_state=self.random_state,
            n_jobs=2,
        )
        self.model_.fit(features, self.encoder_.transform(labels))
        return self

    def predict(self, features):
        return self.encoder_.inverse_transform(np.asarray(self.model_.predict(features), dtype=int))

    def predict_proba(self, features):
        return self.model_.predict_proba(features)

