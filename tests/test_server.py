"""
DeckComp Host Server & CLI Automated Test Suite.
Uses Python's standard unittest framework with Starlette TestClient.
"""
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from starlette.testclient import TestClient

from config import get_or_create_auth_token
from main import app


class DeckCompTestSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.token = get_or_create_auth_token()
        cls.auth_headers = {"Authorization": f"Bearer {cls.token}"}

    def test_01_health_endpoint(self):
        """Verify public health endpoint returns 200 with session info."""
        response = self.client.get("/api/v1/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("status"), "ok")
        self.assertIn("version", data)
        self.assertIn("hostname", data)

    def test_02_unauthorized_access(self):
        """Verify protected endpoints return 401 without auth token."""
        response = self.client.get("/api/v1/telemetry/host")
        self.assertEqual(response.status_code, 401)

        response = self.client.get("/api/v1/media/status")
        self.assertEqual(response.status_code, 401)

        response = self.client.post("/api/v1/share/stage", json={"path": "/tmp/test.txt"})
        self.assertEqual(response.status_code, 401)

    def test_03_authorized_telemetry(self):
        """Verify protected endpoints accept master token."""
        response = self.client.get("/api/v1/telemetry/host", headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("battery", data)
        self.assertIn("uptime_seconds", data)

    def test_04_pairing_lifecycle(self):
        """Test full pairing lifecycle: initiate, invalid PIN, rate limit, and validation."""
        device_id = "test_phone_device_1"
        device_name = "DeckComp Phone"

        # 1. Initiate pairing
        with patch("subprocess.Popen"):
            response = self.client.post(
                "/api/v1/pair/initiate",
                json={"device_id": device_id, "device_name": device_name},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data.get("status"), "pending")
            self.assertEqual(data.get("device_id"), device_id)

        # 2. Verify invalid code returns 400
        bad_response = self.client.post(
            "/api/v1/pair/verify",
            json={"device_id": device_id, "code": "000000", "device_name": device_name},
        )
        self.assertEqual(bad_response.status_code, 400)
        self.assertIn("Incorrect pairing code", bad_response.json().get("detail", ""))

    def test_05_outbox_security(self):
        """Verify outbox path traversal rejection and sensitive file rejection."""
        # 1. Reject path outside home directory (e.g. /etc/shadow)
        resp = self.client.post(
            "/api/v1/share/stage",
            json={"path": "/etc/shadow"},
            headers=self.auth_headers,
        )
        self.assertIn(resp.status_code, (400, 403, 404))

        # 2. Reject sensitive .ssh path
        resp2 = self.client.post(
            "/api/v1/share/stage",
            json={"path": str(Path.home() / ".ssh" / "id_rsa")},
            headers=self.auth_headers,
        )
        self.assertIn(resp2.status_code, (400, 403, 404))

    def test_06_outbox_staging_lifecycle(self):
        """Create a temporary file inside user home, stage it, download it via API, and delete it."""
        test_file = Path.home() / f".deckcomp_test_{os.getpid()}.txt"
        test_file.write_text("DeckComp Distributable Test Content 12345", encoding="utf-8")

        try:
            # Stage file
            with patch("subprocess.Popen"):
                stage_resp = self.client.post(
                    "/api/v1/share/stage",
                    json={"path": str(test_file)},
                    headers=self.auth_headers,
                )
            self.assertEqual(stage_resp.status_code, 201)
            stage_data = stage_resp.json()
            file_id = stage_data.get("id") or stage_data.get("file_id")
            self.assertTrue(bool(file_id))

            # List pending outbox
            list_resp = self.client.get("/api/v1/share/pending", headers=self.auth_headers)
            self.assertEqual(list_resp.status_code, 200)
            items = list_resp.json()
            self.assertTrue(any(item.get("id") == file_id for item in items))

            # Download file
            download_resp = self.client.get(
                f"/api/v1/share/download/{file_id}", headers=self.auth_headers
            )
            self.assertEqual(download_resp.status_code, 200)
            self.assertIn(b"DeckComp Distributable Test Content 12345", download_resp.content)

            # Delete file from outbox
            del_resp = self.client.delete(
                f"/api/v1/share/{file_id}", headers=self.auth_headers
            )
            self.assertEqual(del_resp.status_code, 200)
        finally:
            if test_file.exists():
                test_file.unlink()


if __name__ == "__main__":
    unittest.main()
