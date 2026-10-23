import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import prepare_correction
import verify
from test_verify import APP_ID, signed_build


class CorrectionTests(unittest.TestCase):
    # All manifests here are synthetic; no Mac/device evidence is created.
    def test_matching_manifest_copies_exact_bytes_but_leaves_gate_open(self):
        manifest = json.dumps(signed_build()).encode()
        raw, report = prepare_correction.prepare(manifest, APP_ID)
        self.assertEqual(raw, (verify.ROOT / ".well-known/apple-app-site-association").read_bytes())
        self.assertEqual(report["signedBuildSHA256"], verify.sha256(manifest))
        self.assertEqual(report["gate"], "OPEN — REVIEW_REQUIRED")
        self.assertEqual(report["result"], "INCOMPLETE")
        self.assertFalse(report["preparation"]["publicationPerformed"])
        self.assertFalse(report["preparation"]["deviceTestPerformed"])

    def test_receiver_confirmation_is_required_and_cannot_select_another_app(self):
        for identity in ("", "N6JGN24QML.com.vincenzocalce.ARGO"):
            with self.subTest(identity=identity), self.assertRaises(ValueError):
                prepare_correction.prepare(json.dumps(signed_build()).encode(), identity)

    def test_project_settings_or_incomplete_manifest_cannot_stage_candidate(self):
        for data in (None, {}, [], {"DEVELOPMENT_TEAM": "N6JGN24QML"}, {"schemaVersion": 1}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                prepare_correction.prepare(json.dumps(data).encode(), APP_ID)

    def test_identity_signature_and_trace_failures_block_candidate(self):
        fields = {"applicationIdentifier": "OTHERPRE01.it.vincenzocalce.argo.wearable",
                  "bundleIdentifier": "com.vincenzocalce.ARGO", "teamIdentifier": "N6JGN24QML",
                  "signatureVerified": False, "source": "xcode-settings", "sourceCommit": None,
                  "codeDirectoryHash": "invalid", "executableSHA256": None,
                  "capturedAt": "2026-10-23", "version": None, "build": None}
        for field, value in fields.items():
            data = signed_build()
            data[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                prepare_correction.prepare(json.dumps(data).encode(), APP_ID)

    def test_wrong_or_developer_domain_block_candidate(self):
        for domain in ("applinks:seagroup.info", "applinks:*.seagroup.info",
                       "applinks:www.seagroup.info?mode=developer"):
            data = signed_build()
            data["associatedDomains"] = [domain]
            with self.subTest(domain=domain), self.assertRaises(ValueError):
                prepare_correction.prepare(json.dumps(data).encode(), APP_ID)

    def test_missing_or_inconsistent_profile_requires_manual_review(self):
        for profile in (None, {}, {"applicationIdentifier": "OTHERPRE01.*"}):
            data = signed_build()
            data["provisioning"] = profile
            with self.subTest(profile=profile), self.assertRaises(ValueError):
                prepare_correction.prepare(json.dumps(data).encode(), APP_ID)

    def test_repository_cannot_silently_expand_paths_or_other_services(self):
        original = verify.parse_json((verify.ROOT / ".well-known/apple-app-site-association").read_bytes())
        variants = []
        for path in ("*", "/argo/wearable/callback*", "/argo/wearable/callback/*"):
            doc = json.loads(json.dumps(original))
            doc["applinks"]["details"][0]["components"][0]["/"] = path
            variants.append(doc)
        variants.append({**original, "webcredentials": {"apps": [APP_ID]}})
        for doc in variants:
            with tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                (root / ".well-known").mkdir()
                (root / ".well-known/apple-app-site-association").write_text(json.dumps(doc))
                with patch.object(verify, "ROOT", root), self.subTest(document=doc), self.assertRaises(ValueError):
                    prepare_correction.prepare(json.dumps(signed_build()).encode(), APP_ID)

    def test_cli_creates_staging_files_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            manifest = root / "synthetic.json"
            manifest.write_text(json.dumps(signed_build()))
            out = root / "candidate"
            args = ["--signed-build", str(manifest), "--confirmed-application-identifier", APP_ID, "--out", str(out)]
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(prepare_correction.main(args), 0)
                before = {p.name: p.read_bytes() for p in out.iterdir()}
                self.assertEqual(prepare_correction.main(args), 3)
            self.assertEqual(before, {p.name: p.read_bytes() for p in out.iterdir()})
            self.assertEqual(set(before), {"apple-app-site-association", "report.json", "report.md"})

    def test_rejected_input_leaves_no_candidate_directory(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            manifest = root / "settings.json"
            manifest.write_text('{"schemaVersion": 1}')
            out = root / "candidate"
            with contextlib.redirect_stderr(io.StringIO()):
                result = prepare_correction.main(["--signed-build", str(manifest),
                         "--confirmed-application-identifier", APP_ID, "--out", str(out)])
            self.assertEqual(result, 3)
            self.assertFalse(out.exists())


if __name__ == "__main__":
    unittest.main()
