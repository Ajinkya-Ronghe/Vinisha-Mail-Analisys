import unittest

from backend.schemas import AttachmentInput, EmailInput
from backend.security_layers import attachment_layer, metadata_layer, url_layer


class SecurityLayerTests(unittest.TestCase):
    def test_failed_authentication_and_reply_to_mismatch_raise_metadata_risk(self):
        email = EmailInput(
            sender_email="accounts@trusted.example",
            headers={
                "reply-to": "collector@evil.example",
                "authentication-results": "spf=fail dkim=fail dmarc=fail",
                "message-id": "<1@example>",
            },
        )
        result = metadata_layer(email)
        self.assertGreaterEqual(result.score, 0.7)
        self.assertTrue(any("Reply-To" in finding for finding in result.findings))

    def test_ip_login_url_raises_url_risk(self):
        result = url_layer(
            EmailInput(sender_email="notice@example.com", body="Open http://192.0.2.10/login now")
        )
        self.assertGreaterEqual(result.score, 0.4)

    def test_double_extension_and_executable_content_raise_attachment_risk(self):
        result, hashes = attachment_layer(
            [AttachmentInput(name="invoice.pdf.exe", size=4, data_base64="TVpYWQ==")]
        )
        self.assertGreaterEqual(result.score, 0.9)
        self.assertIn("invoice.pdf.exe", hashes)


if __name__ == "__main__":
    unittest.main()
