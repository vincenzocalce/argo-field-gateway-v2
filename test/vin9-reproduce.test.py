"""Preflight regression tests, synthetic bytes only; never contact a database."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "replay", Path(__file__).resolve().parents[1] / "scripts/vin9-reproduce.py")
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.archive = self.home / "input.zip"
        self.archive.write_bytes(b"synthetic archive bytes")
        self.root = self.home / "repo"
        self.root.mkdir()
        self.output = self.home / "evidence"

    def test_wrong_archive_hash_creates_nothing(self):
        with self.assertRaisesRegex(ValueError, "Archive SHA256 mismatch"):
            replay.prepare(self.archive, self.output, self.root)
        self.assertFalse(self.output.exists())

    def test_existing_evidence_is_never_overwritten(self):
        self.output.mkdir()
        sentinel = self.output / "comparison.json"
        sentinel.write_bytes(b"previous evidence")
        with self.assertRaisesRegex(ValueError, "Output already exists"):
            replay.prepare(self.archive, self.output, self.root)
        self.assertEqual(sentinel.read_bytes(), b"previous evidence")

    def test_output_inside_checkout_rejected(self):
        with self.assertRaisesRegex(ValueError, "outside the source checkout"):
            replay.prepare(self.archive, self.root / "evidence", self.root)
        self.assertFalse((self.root / "evidence").exists())

    def test_code_drift_rejected_even_with_accepted_input(self):
        (self.root / "adapter.js").write_bytes(b"modified code")
        original = b"approved code"
        blob = hashlib.sha1(b"blob " + str(len(original)).encode() + b"\0" + original).hexdigest()
        with patch.object(replay, "ARCHIVE_SHA256", replay.sha(self.archive)), \
             patch.object(replay, "ADAPTER_BLOBS", {"adapter.js": blob}):
            with self.assertRaisesRegex(ValueError, "Adapter blob mismatch"):
                replay.prepare(self.archive, self.output, self.root)
        self.assertFalse(self.output.exists())

    def test_symlinked_input_rejected(self):
        link = self.home / "alias.zip"
        link.symlink_to(self.archive)
        with self.assertRaisesRegex(ValueError, "Symlinks are not allowed"):
            replay.prepare(link, self.output, self.root)
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
