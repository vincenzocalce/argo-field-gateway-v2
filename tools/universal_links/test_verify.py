import io
import json
import plistlib
import subprocess
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

import collect_signed_build as collector
import verify

CONTRACT = verify.parse_json(verify.CONTRACT.read_bytes())
APP_ID = CONTRACT["applicationIdentifier"]
CALLBACK = CONTRACT["path"]
DOMAIN = CONTRACT["domain"]
URL = "https://" + DOMAIN + CALLBACK


def exact():
    return {"applinks": {"details": [{"appIDs": [APP_ID], "components": [{"/": CALLBACK}]}]}}


def evaluate(document=None, **kwargs):
    return verify.inspect(json.dumps(exact() if document is None else document).encode(), DOMAIN, URL, **kwargs)


def statuses(report):
    return {item["check"]: item["status"] for item in report["findings"]}


def signed_build():
    return {
        "schemaVersion": 1, "source": "macos-codesign", "signatureVerified": True,
        "bundleIdentifier": CONTRACT["bundleIdentifier"], "applicationIdentifier": APP_ID,
        "teamIdentifier": CONTRACT["teamIdentifier"], "associatedDomains": ["applinks:" + DOMAIN],
        "capturedAt": "2026-10-18T00:00:00Z", "version": "1.0", "build": "1",
        "executableSHA256": "a" * 64, "codeDirectoryHash": "b" * 40, "sourceCommit": "c" * 40,
        "provisioning": {"applicationIdentifier": APP_ID, "teamIdentifier": CONTRACT["teamIdentifier"],
                         "associatedDomains": ["*"]},
    }


class ContractTests(unittest.TestCase):
    def test_repository_document_is_exact_but_gate_open(self):
        raw = (verify.ROOT / ".well-known/apple-app-site-association").read_bytes()
        report = verify.inspect(raw, DOMAIN, URL)
        self.assertNotIn("INCOMPATIBLE", statuses(report).values())
        self.assertEqual(report["result"], "INCOMPLETE")
        self.assertEqual(report["gate"], "OPEN — REVIEW_REQUIRED")
        self.assertEqual(statuses(report)["build.signedEvidence"], "MISSING")
        self.assertEqual(statuses(report)["aasa.publication"], "MISSING")

    def test_legacy_exact_supported(self):
        report = evaluate({"applinks": {"apps": [], "details": [{"appID": APP_ID, "paths": [CALLBACK]}]}})
        self.assertEqual(statuses(report)["aasa.details.0.paths"], "MATCH")

    def test_all_unauthorized_legacy_paths_rejected(self):
        for path in ("*", CALLBACK + "*", CALLBACK + "/*", CALLBACK + "/", CALLBACK + "/extra", CALLBACK + "Extra", CALLBACK.upper()):
            with self.subTest(path=path):
                report = evaluate({"applinks": {"details": [{"appID": APP_ID, "paths": [path]}]}})
                self.assertEqual(report["result"], "INCOMPATIBLE")

    def test_components_reject_broadening_restrictions_and_unknown_modifiers(self):
        for component in ({"/": "*"}, {"/": CALLBACK, "exclude": True},
                          {"/": CALLBACK, "caseSensitive": False}, {"/": CALLBACK, "?": {"x": "y"}},
                          {"/": CALLBACK, "#": "token"}, {}, "bad"):
            with self.subTest(component=component):
                document = exact()
                document["applinks"]["details"][0]["components"] = [component]
                self.assertEqual(evaluate(document)["result"], "INCOMPATIBLE")

    def test_extra_grants_and_exclusions_cannot_be_hidden(self):
        for extra in ({"/": "*"}, {"/": CALLBACK, "exclude": True}):
            document = exact()
            document["applinks"]["details"][0]["components"].append(extra)
            self.assertEqual(evaluate(document)["result"], "INCOMPATIBLE")
        document = exact()
        document["applinks"]["details"].append({"appID": APP_ID, "paths": ["*"]})
        self.assertEqual(evaluate(document)["result"], "INCOMPATIBLE")

    def test_comment_does_not_change_rule(self):
        document = exact()
        document["applinks"]["details"][0]["components"][0]["comment"] = "VIN-7"
        self.assertNotEqual(evaluate(document)["result"], "INCOMPATIBLE")

    def test_wrong_app_id_is_not_a_match(self):
        document = exact()
        document["applinks"]["details"][0]["appIDs"] = ["N6JGN24QML.com.vincenzocalce.ARGO"]
        self.assertEqual(statuses(evaluate(document))["aasa.applicationIdentifier"], "INCOMPATIBLE")

    def test_malformed_and_ambiguous_schemas_rejected(self):
        variants = [None, [], {}, {"applinks": []}, {"applinks": {"details": {}}},
                    {"applinks": {"details": [None]}}, {"applinks": {"details": [{"appIDs": "bad"}]}},
                    {"applinks": {"details": [{"appIDs": [APP_ID], "appID": APP_ID, "paths": [CALLBACK]}]}}]
        for document in variants:
            with self.subTest(document=document):
                self.assertEqual(verify.inspect(json.dumps(document).encode(), DOMAIN, URL)["result"], "INCOMPATIBLE")
        document = exact()
        document["applinks"]["details"][0]["paths"] = [CALLBACK]
        self.assertEqual(evaluate(document)["result"], "INCOMPATIBLE")

    def test_duplicate_keys_non_json_and_oversize_rejected(self):
        for raw in (b'{"applinks": {}, "applinks": {}}', b'{"x": NaN}', b'<html>error</html>', b'\xff', b' ' * (verify.MAX_AASA_BYTES + 1)):
            with self.subTest(raw_length=len(raw)):
                self.assertEqual(verify.inspect(raw, DOMAIN, URL)["result"], "INCOMPATIBLE")

    def test_unknown_options_require_review(self):
        document = exact()
        document["applinks"]["defaults"] = {"caseSensitive": False}
        self.assertEqual(statuses(evaluate(document))["aasa.options"], "MISSING")

    def test_callback_query_and_fragment_allowed_variants_rejected(self):
        raw = json.dumps(exact()).encode()
        for suffix in ("?source=VIN-7", "#trace", "?source=VIN-7#trace"):
            self.assertEqual(statuses(verify.inspect(raw, DOMAIN, URL + suffix))["callback.url"], "MATCH")
        for url in (URL + "/", URL + "Extra", URL + "/extra", URL.upper(),
                    URL.replace("https:", "http:"), URL.replace(DOMAIN, "seagroup.info"),
                    URL.replace(DOMAIN, DOMAIN + ":443"), URL.replace(DOMAIN, "user@" + DOMAIN),
                    URL.replace("callback", "%63allback")):
            with self.subTest(url=url):
                self.assertEqual(statuses(verify.inspect(raw, DOMAIN, url))["callback.url"], "INCOMPATIBLE")
        self.assertEqual(statuses(verify.inspect(raw, "seagroup.info", URL))["domain.contract"], "INCOMPATIBLE")

    def test_http_status_mime_redirect(self):
        good = {"status": 200, "contentType": "application/json; charset=utf-8", "location": None}
        self.assertNotIn("INCOMPATIBLE", statuses(evaluate(transport=good)).values())
        for field, value in (("status", 301), ("contentType", "text/html"), ("location", "https://elsewhere.test")):
            transport = {**good, field: value}
            self.assertEqual(evaluate(transport=transport)["result"], "INCOMPATIBLE")

    def test_failed_fetch_is_missing_not_site_failure(self):
        report = verify.inspect(None, DOMAIN, URL, transport={"error": "timeout"})
        self.assertEqual(statuses(report)["aasa.publication"], "MISSING")
        self.assertEqual(statuses(report)["aasa.json"], "MISSING")


class SignedBuildTests(unittest.TestCase):
    def test_coherent_manifest_never_passes_gate(self):
        report = evaluate(signed=signed_build())
        self.assertNotIn("INCOMPATIBLE", statuses(report).values())
        self.assertEqual(report["gate"], "OPEN — REVIEW_REQUIRED")
        self.assertEqual(statuses(report)["iphone.endToEnd"], "MISSING")

    def test_team_and_bundle_mismatch_detected_separately(self):
        signed = signed_build()
        signed.update(teamIdentifier="N6JGN24QML", bundleIdentifier="com.vincenzocalce.ARGO",
                      applicationIdentifier="N6JGN24QML.com.vincenzocalce.ARGO")
        checks = statuses(evaluate(signed=signed))
        for field in ("teamIdentifier", "bundleIdentifier", "applicationIdentifier"):
            self.assertEqual(checks["build." + field], "INCOMPATIBLE")

    def test_prefix_is_not_inferred_from_team(self):
        signed = signed_build()
        signed["applicationIdentifier"] = "OTHERPRE01." + CONTRACT["bundleIdentifier"]
        checks = statuses(evaluate(signed=signed))
        self.assertEqual(checks["build.teamIdentifier"], "MATCH")
        self.assertEqual(checks["build.applicationIdentifier"], "INCOMPATIBLE")

    def test_entitlements_require_exact_domain_ordinary_mode(self):
        for domain in ("applinks:seagroup.info", "applinks:*.seagroup.info", "applinks:" + DOMAIN + "?mode=developer", "applinks:https://" + DOMAIN):
            signed = signed_build()
            signed["associatedDomains"] = [domain]
            self.assertEqual(statuses(evaluate(signed=signed))["build.associatedDomains"], "INCOMPATIBLE")

    def test_incomplete_manifest_and_failed_signature(self):
        checks = statuses(evaluate(signed={"schemaVersion": 1}))
        self.assertEqual(checks["build.applicationIdentifier"], "MISSING")
        self.assertEqual(checks["profile"], "MISSING")
        signed = signed_build()
        signed["signatureVerified"] = False
        self.assertEqual(statuses(evaluate(signed=signed))["build.signatureVerification"], "INCOMPATIBLE")
        self.assertEqual(evaluate(signed=[])["result"], "INCOMPATIBLE")

    def test_mistyped_attestation_and_invalid_trace_fields_are_not_matches(self):
        signed = signed_build()
        signed.update(signatureVerified=1, sourceCommit="unknown", capturedAt="yesterday", executableSHA256="not-a-hash")
        checks = statuses(evaluate(signed=signed))
        self.assertEqual(checks["build.signatureVerification"], "INCOMPATIBLE")
        for field in ("sourceCommit", "capturedAt", "executableSHA256"):
            self.assertEqual(checks["build." + field], "MISSING")

    def test_profile_prefix_mismatch_and_wildcard_are_distinct_from_aasa(self):
        signed = signed_build()
        signed["provisioning"]["applicationIdentifier"] = "OTHERPRE01.*"
        self.assertEqual(statuses(evaluate(signed=signed))["profile.applicationIdentifier"], "INCOMPATIBLE")
        signed["provisioning"]["applicationIdentifier"] = "N6JGN24QMU.*"
        self.assertEqual(statuses(evaluate(signed=signed))["profile.applicationIdentifier"], "MATCH")

    def test_collector_filters_private_profile_material(self):
        entitlement = {"application-identifier": APP_ID, "com.apple.developer.team-identifier": CONTRACT["teamIdentifier"],
                       "com.apple.developer.associated-domains": ["applinks:" + DOMAIN], "keychain-access-groups": ["private"]}
        profile = {"Entitlements": entitlement, "ProvisionedDevices": ["secret-udid"], "DeveloperCertificates": [b"secret-cert"]}
        data = collector.manifest({"CFBundleIdentifier": CONTRACT["bundleIdentifier"], "CFBundleVersion": "1"},
                                  entitlement, "CDHash=" + "a" * 40, b"synthetic binary", profile, None)
        serialized = json.dumps(data)
        for private in ("secret-udid", "secret-cert", "keychain-access-groups", "private"):
            self.assertNotIn(private, serialized)
        self.assertEqual(data["applicationIdentifier"], APP_ID)
        self.assertIsNone(data["sourceCommit"])

    def test_collector_refuses_non_mac_without_creating_output(self):
        with tempfile.TemporaryDirectory() as tmp, patch("platform.system", return_value="Linux"), patch("sys.stderr", new_callable=io.StringIO):
            output = Path(tmp) / "signed.json"
            self.assertEqual(collector.main(["demo.app", "--out", str(output)]), 3)
            self.assertFalse(output.exists())

    def test_collector_command_pipeline_simulated_not_real_codesign(self):
        with tempfile.TemporaryDirectory() as tmp, patch("platform.system", return_value="Darwin"), patch("sys.stdout", new_callable=io.StringIO):
            app = Path(tmp) / "ARGO.app"
            app.mkdir()
            (app / "Info.plist").write_bytes(plistlib.dumps({"CFBundleExecutable": "ARGO", "CFBundleIdentifier": CONTRACT["bundleIdentifier"]}))
            (app / "ARGO").write_bytes(b"synthetic executable")
            entitlement = {"application-identifier": APP_ID}
            outputs = [subprocess.CompletedProcess([], 0, b"", b""),
                       subprocess.CompletedProcess([], 0, plistlib.dumps(entitlement), b"Executable=fixture"),
                       subprocess.CompletedProcess([], 0, b"", ("CDHash=" + "b" * 40 + "\n").encode())]
            output = Path(tmp) / "manifest.json"
            with patch.object(collector, "run", side_effect=outputs) as commands:
                self.assertEqual(collector.main([str(app), "--out", str(output)]), 0)
                self.assertEqual(commands.call_args_list[0].args[0][:3], ["/usr/bin/codesign", "--verify", "--strict"])
            data = json.loads(output.read_text())
            self.assertEqual(data["applicationIdentifier"], APP_ID)
            self.assertIsNone(data["provisioning"])
            self.assertNotIn(str(app), output.read_text())

    def test_collector_failed_codesign_does_not_write_manifest(self):
        with tempfile.TemporaryDirectory() as tmp, patch("platform.system", return_value="Darwin"), patch("sys.stderr", new_callable=io.StringIO):
            app = Path(tmp) / "ARGO.app"
            app.mkdir()
            output = Path(tmp) / "manifest.json"
            with patch.object(collector, "run", side_effect=subprocess.CalledProcessError(1, ["codesign"])):
                self.assertEqual(collector.main([str(app), "--out", str(output)]), 3)
            self.assertFalse(output.exists())


class AcquisitionAndCliTests(unittest.TestCase):
    def test_redirect_handler_never_follows(self):
        handler = verify.NoRedirect()
        request = urllib.request.Request("https://www.seagroup.info/.well-known/apple-app-site-association")
        for status in (301, 302, 303, 307, 308):
            self.assertIsNone(handler.redirect_request(request, None, status, "", {}, "https://other.test"))

    def test_http_error_body_is_preserved_without_following(self):
        error = urllib.error.HTTPError(URL, 301, "Moved", {"Content-Type": "text/html", "Location": "https://other.test"}, io.BytesIO(b"redirect"))
        with patch("urllib.request.OpenerDirector.open", side_effect=error):
            raw, metadata = verify.fetch_aasa(DOMAIN)
        self.assertEqual(raw, b"redirect")
        self.assertEqual(metadata["status"], 301)
        self.assertFalse(metadata["redirectsFollowed"])

    def test_network_error_has_no_fabricated_body(self):
        with patch("urllib.request.OpenerDirector.open", side_effect=urllib.error.URLError("offline")):
            raw, metadata = verify.fetch_aasa(DOMAIN)
        self.assertIsNone(raw)
        self.assertIn("error", metadata)

    def test_cli_outputs_report_exit_codes_and_preserves_evidence(self):
        with tempfile.TemporaryDirectory() as tmp, patch("sys.stdout", new_callable=io.StringIO), patch("sys.stderr", new_callable=io.StringIO):
            output = Path(tmp) / "reports"
            self.assertEqual(verify.main(["--out", str(output)]), 0)
            report = json.loads((output / "report.json").read_text())
            self.assertEqual(report["result"], "INCOMPLETE")
            self.assertIn("Informazioni/prove mancanti", (output / "report.md").read_text())
            self.assertEqual(verify.main(["--out", str(output)]), 3)
            bad = Path(tmp) / "bad.json"
            bad.write_text('{"applinks":{"details":[{"appID":"' + APP_ID + '","paths":["*"]}]}}')
            self.assertEqual(verify.main(["--aasa", str(bad)]), 2)
            self.assertEqual(verify.main(["--aasa", str(bad) + "-missing"]), 3)
            self.assertEqual(verify.main(["--domain", "https://example.test/path"]), 3)


if __name__ == "__main__":
    unittest.main()
