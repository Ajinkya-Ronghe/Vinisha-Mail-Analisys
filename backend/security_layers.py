import base64
import hashlib
import ipaddress
import re
from pathlib import Path
from typing import Dict, List, Tuple
from urllib.parse import urlparse

from .schemas import AttachmentInput, EmailInput, LayerResult


URL_PATTERN = re.compile(r"(?:https?://|www\.)[^\s<>'\"]+", re.IGNORECASE)
URGENT_TERMS = {
    "act now", "urgent", "immediately", "final warning", "account suspended",
    "verify your account", "password expires", "limited time", "access blocked",
}
CREDENTIAL_TERMS = {
    "password", "login", "sign in", "verify identity", "credentials", "one-time password", "otp",
}
PAYMENT_TERMS = {
    "wire transfer", "bank account", "gift card", "payment required", "invoice overdue", "crypto",
}
SUSPICIOUS_EXTENSIONS = {
    ".exe", ".dll", ".scr", ".bat", ".cmd", ".com", ".js", ".jse", ".vbs", ".vbe",
    ".ps1", ".msi", ".jar", ".hta", ".lnk", ".iso", ".img", ".docm", ".xlsm", ".pptm",
}
ARCHIVE_EXTENSIONS = {".zip", ".rar", ".7z", ".gz", ".bz2", ".tar"}
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "cutt.ly"}
EXECUTABLE_MAGIC = (b"MZ", b"\x7fELF", b"#!")


def clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def domain_from_address(value: str) -> str:
    match = re.search(r"@([^>\s]+)", value or "")
    return match.group(1).strip(".>").lower() if match else ""


def metadata_layer(email: EmailInput) -> LayerResult:
    headers = {key.lower(): value for key, value in email.headers.items()}
    findings: List[str] = []
    score = 0.0
    from_domain = domain_from_address(email.sender_email or headers.get("from", ""))
    reply_domain = domain_from_address(headers.get("reply-to", ""))
    return_domain = domain_from_address(headers.get("return-path", ""))
    auth = headers.get("authentication-results", "").lower()

    if reply_domain and from_domain and reply_domain != from_domain:
        score += 0.32
        findings.append("Reply-To domain differs from the sender domain")
    if return_domain and from_domain and return_domain != from_domain:
        score += 0.18
        findings.append("Return-Path domain differs from the sender domain")
    for protocol, weight in (("spf", 0.18), ("dkim", 0.18), ("dmarc", 0.24)):
        if re.search(rf"\b{protocol}\s*=\s*(?:fail|softfail|temperror|permerror)", auth):
            score += weight
            findings.append(f"{protocol.upper()} authentication did not pass")
    if auth:
        passed = all(f"{item}=pass" in auth.replace(" ", "") for item in ("spf", "dkim", "dmarc"))
        if passed and not findings:
            findings.append("SPF, DKIM and DMARC passed")
    else:
        score += 0.08
        findings.append("Authentication-Results header is unavailable")
    if from_domain.startswith("xn--"):
        score += 0.25
        findings.append("Sender uses an internationalized/punycode domain")
    if not headers.get("message-id"):
        score += 0.08
        findings.append("Message-ID header is missing")
    if not findings:
        findings.append("No obvious sender or authentication anomaly found")
    return LayerResult(score=clamp(score), findings=findings)


def extract_urls(email: EmailInput) -> List[str]:
    values = URL_PATTERN.findall(f"{email.subject}\n{email.body}")
    return list(dict.fromkeys(value.rstrip(".,);]}") for value in values))


def url_layer(email: EmailInput) -> LayerResult:
    urls = extract_urls(email)
    findings: List[str] = []
    score = 0.0
    sender_domain = domain_from_address(email.sender_email)

    for url in urls[:25]:
        parsed = urlparse(url if "://" in url else f"http://{url}")
        host = (parsed.hostname or "").lower()
        risky = False
        try:
            ipaddress.ip_address(host)
            score += 0.28
            findings.append(f"Link uses an IP address: {host}")
            risky = True
        except ValueError:
            pass
        if host in SHORTENERS:
            score += 0.18
            findings.append(f"Shortened link found: {host}")
            risky = True
        if "xn--" in host:
            score += 0.24
            findings.append(f"Punycode link found: {host}")
            risky = True
        if url.count("@") or host.count("-") >= 3 or len(host.split(".")) >= 5:
            score += 0.14
            findings.append(f"Obfuscated-looking link found: {host}")
            risky = True
        if parsed.scheme == "http" and any(term in parsed.path.lower() for term in ("login", "verify", "account", "password")):
            score += 0.18
            findings.append(f"Sensitive action requested over HTTP: {host}")
            risky = True
        if sender_domain and host and sender_domain not in host and risky:
            score += 0.06

    if not urls:
        findings.append("No web links found")
    elif not findings:
        findings.append(f"Checked {len(urls)} link(s); no obvious static warning sign found")
    return LayerResult(score=clamp(score), findings=findings)


def _decode_attachment(value: str) -> bytes:
    padded = value.replace("-", "+").replace("_", "/")
    padded += "=" * (-len(padded) % 4)
    return base64.b64decode(padded, validate=False)


def attachment_layer(attachments: List[AttachmentInput]) -> Tuple[LayerResult, Dict[str, str]]:
    findings: List[str] = []
    hashes: Dict[str, str] = {}
    score = 0.0

    for attachment in attachments[:20]:
        name = attachment.name or "unnamed attachment"
        suffixes = [item.lower() for item in Path(name).suffixes]
        final_suffix = suffixes[-1] if suffixes else ""
        if final_suffix in SUSPICIOUS_EXTENSIONS:
            score += 0.48
            findings.append(f"High-risk attachment type: {name}")
        elif final_suffix in ARCHIVE_EXTENSIONS:
            score += 0.16
            findings.append(f"Archive requires deeper inspection: {name}")
        if len(suffixes) >= 2 and suffixes[-2] in {".pdf", ".doc", ".jpg", ".png", ".txt"}:
            score += 0.35
            findings.append(f"Possible double-extension disguise: {name}")

        if attachment.data_base64:
            try:
                content = _decode_attachment(attachment.data_base64)
            except (ValueError, base64.binascii.Error):
                findings.append(f"Could not decode attachment sample: {name}")
                continue
            hashes[name] = hashlib.sha256(content).hexdigest()
            lowered = content[:524288].lower()
            if any(content.startswith(magic) for magic in EXECUTABLE_MAGIC):
                score += 0.55
                findings.append(f"Executable content detected in {name}")
            if any(marker in lowered for marker in (b"autoopen", b"document_open", b"powershell", b"wscript.shell", b"javascript")):
                score += 0.38
                findings.append(f"Script or macro indicator found in {name}")
            if attachment.size > len(content):
                findings.append(f"Only a safe-size sample of {name} was inspected")
        elif attachment.size:
            findings.append(f"Attachment metadata checked but content was not available: {name}")

    if not attachments:
        findings.append("No attachments found")
    elif not findings:
        findings.append(f"Checked {len(attachments)} attachment(s); no static warning sign found")
    return LayerResult(score=clamp(score), findings=findings), hashes


def language_indicators(email: EmailInput) -> LayerResult:
    text = f"{email.subject} {email.body}".lower()
    findings: List[str] = []
    score = 0.0
    matches = sorted(term for term in URGENT_TERMS if term in text)
    if matches:
        score += min(0.32, 0.10 + 0.06 * len(matches))
        findings.append(f"Urgency language: {', '.join(matches[:3])}")
    credential_matches = sorted(term for term in CREDENTIAL_TERMS if term in text)
    if credential_matches:
        score += min(0.28, 0.08 + 0.05 * len(credential_matches))
        findings.append(f"Credential-related language: {', '.join(credential_matches[:3])}")
    payment_matches = sorted(term for term in PAYMENT_TERMS if term in text)
    if payment_matches:
        score += min(0.30, 0.10 + 0.06 * len(payment_matches))
        findings.append(f"Payment-pressure language: {', '.join(payment_matches[:3])}")
    if text.count("!") >= 3 or (email.subject.isupper() and len(email.subject) > 8):
        score += 0.12
        findings.append("Unusually forceful writing style")
    if not findings:
        findings.append("No obvious urgency, credential, or payment-language pattern found")
    return LayerResult(score=clamp(score), findings=findings)
