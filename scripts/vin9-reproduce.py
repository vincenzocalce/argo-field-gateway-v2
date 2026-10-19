#!/usr/bin/env python3
"""Two isolated documentary runs of M1 v0.1.0. No DB/network clients.

Run metadata are new offline evidence, never operational parse_run_id values.
Only the archive and adapter pinned below are accepted. See VIN9_REPRODUCIBILITY.md.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import stat
import subprocess
import sys
import uuid
import zipfile

ARCHIVE_SHA256 = "96fc9dd70f66a850ca98b67bb9d4b1f7451287d1259d7e12c916b11a20cf641b"
ADAPTER_COMMIT = "059901889dbdcc5e4c752ad06d522922601c44b9"
ADAPTER_BLOBS = {
    "scripts/vin9-adapt.js": "3f214662e1625afc31f8a40c297b9ad4d8b34d50",
    "src/vin9-adapter.js": "91a451db7affb287ae08dd6c26ac7aae142637de",
    "src/validation.js": "21be47e8abfca308afcc06e272234e3149db0e77",
}
ROOT = Path(__file__).resolve().parents[1]


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def sha(path):
    return digest(path.read_bytes())


def canonical(value):
    # Versioned documentary comparison, NOT an RFC 8785/native-source claim.
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def write_json(path, value):
    with path.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")


def no_symlinks(path):
    path = Path(os.path.abspath(path))
    for item in [path, *path.parents]:
        if item.is_symlink():
            raise ValueError("Symlinks are not allowed")
    return path


def prepare(archive, output, root=ROOT):
    archive, output = no_symlinks(archive), no_symlinks(output)
    root = root.resolve()
    if output.exists():
        raise ValueError("Output already exists; refusing to overwrite")
    if output == root or output in root.parents or root in output.parents:
        raise ValueError("Evidence output must be outside the source checkout")
    if output == archive or output in archive.parents:
        raise ValueError("Output overlaps the input archive")
    if sha(archive) != ARCHIVE_SHA256:
        raise ValueError("Archive SHA256 mismatch")
    source_hashes = {}
    for name, expected in ADAPTER_BLOBS.items():
        path = no_symlinks(root / name)
        data = path.read_bytes()
        actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if actual != expected:
            raise ValueError("Adapter blob mismatch: " + name)
        source_hashes[name] = digest(data)
    output.mkdir(mode=0o700)  # existing parent required; exclusive creation
    return archive, output, source_hashes


def snapshot(folder):
    return {p.relative_to(folder).as_posix(): sha(p)
            for p in sorted(folder.rglob("*")) if p.is_file()}


def extract(archive, target):
    target.mkdir(mode=0o700)
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate archive member")
        if sum(i.file_size for i in z.infolist()) > 20_000_000:
            raise ValueError("Archive exceeds documentary package size limit")
        for item in z.infolist():
            name = Path(item.filename)
            if (name.is_absolute() or ".." in name.parts or "\\" in item.filename
                    or stat.S_ISLNK(item.external_attr >> 16)):
                raise ValueError("Unsafe archive member")
        z.extractall(target)
        for name in names:
            if not name.endswith("/") and (target / name).read_bytes() != z.read(name):
                raise ValueError("Extracted bytes differ from archive")


def command(argv, stdout, stderr):
    # Do not pass connection strings, tokens or preload hooks to child processes.
    env = {k: os.environ[k] for k in ("PATH", "SYSTEMROOT", "WINDIR") if k in os.environ}
    env.update({"TZ": "UTC", "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1"})
    with stdout.open("xb") as out, stderr.open("xb") as err:
        return subprocess.run(argv, stdout=out, stderr=err, env=env,
                              timeout=60, check=False).returncode


def run(archive, output, node="node"):
    archive, output, source_hashes = prepare(archive, output)
    checks, runs, reports = [], [], []
    result = {
        "protocol_version": "vin9-offline-replay-1.0.0",
        "execution_kind": "DOCUMENTARY_OFFLINE_ONLY",
        "started_at": now(), "adapter_commit": ADAPTER_COMMIT,
        "adapter_source_sha256": source_hashes,
        "runner_sha256": sha(Path(__file__).resolve()),
        "archive_sha256": ARCHIVE_SHA256,
        "python": sys.version, "platform": platform.platform(),
        "parse_run_id": None, "postgresql_test": "NOT_EXECUTED",
        "database_idempotency": "NOT_EXECUTED", "master_approval": "NOT_ATTESTED",
        "M1": "NOT_DEMONSTRATED", "runs": runs, "checks": checks,
    }

    def check(name, ok):
        checks.append({"check": name, "result": "OK_OFFLINE" if ok else "FAIL_OFFLINE"})
        if not ok:
            raise ValueError("Check failed: " + name)

    try:
        node_path = shutil.which(node)
        if not node_path:
            raise ValueError("Node executable unavailable")
        rc = command([node_path, "--version"], output / "node-version.log", output / "node-version.stderr")
        check("node_version_recorded", rc == 0)
        result["node"] = (output / "node-version.log").read_text().strip()
        for index in (1, 2):
            target = output / f"run-{index}"
            target.mkdir(mode=0o700)
            inputs = target / "inputs"
            extract(archive, inputs)
            before = snapshot(inputs)
            meta = {"offline_execution_id": str(uuid.uuid4()), "started_at": now(),
                    "parse_run_id": None, "input_sha256": before,
                    "execution_kind": "DOCUMENTARY_OFFLINE_ONLY"}
            runs.append(meta)
            rc = command([sys.executable, str(inputs / "verify_offline.py")],
                         target / "original-verifier.json", target / "original-verifier.stderr")
            meta["original_verifier_exit_code"] = rc
            check(f"run_{index}_original_verifier_exit", rc == 0)
            original = json.loads((target / "original-verifier.json").read_text())
            check(f"run_{index}_34_original_checks", len(original["results"]) == 34
                  and all(c["result"] == "OK_OFFLINE" for c in original["results"]))
            meta["package_offline_run_id"] = original["offline_run_id"]
            report_file = target / "adapter-report.json"
            args = [node_path, str(ROOT / "scripts/vin9-adapt.js"), "--input-dir", str(inputs),
                    "--output", str(report_file)]
            rc = command(args, target / "adapter.log", target / "adapter.stderr")
            meta["adapter_exit_code"] = rc
            check(f"run_{index}_adapter_exit", rc == 0)
            report = json.loads(report_file.read_text())
            reports.append(report)
            meta["adapter_output_sha256"] = sha(report_file)
            meta["adapter_semantic_sha256"] = digest(canonical(report))
            segments = {s["name"]: s for s in report["segments"]}
            expected = {"baseline": (50, 52640), "addendum_delta": (4, 5418),
                        "additive": (54, 58058), "excluded_24_A": (18, 15858),
                        "excluded_24_B": (10, 7220)}
            for name, (count, kg) in expected.items():
                check(f"run_{index}_{name}_reconciled", segments[name]["summary"]["inflows"]
                      == {"count": count, "total_kg": kg})
            check(f"run_{index}_outflows_separate", segments["baseline_outflows"]["summary"]["outflows"]
                  == {"count": 1, "total_kg": 1680}
                  and segments["excluded_24_A"]["summary"]["outflows"] == {"count": 2, "total_kg": 8260})
            check(f"run_{index}_54_reuses", len(report["overlaps"]) == 54
                  and all(o["relation"] == "REUSED_DOCUMENTARY_EVIDENCE" for o in report["overlaps"]))
            check(f"run_{index}_no_import_eligibility", all(
                r["eligible_for_import"] is False and not r["sql_shape_compatible"] and not r["api_shape_compatible"]
                for s in report["segments"] for r in s["records"]))
            # This tests filesystem retry protection, NOT database idempotency.
            rc = command(args, target / "overwrite-retry.log", target / "overwrite-retry.stderr")
            check(f"run_{index}_overwrite_refused_without_change", rc != 0
                  and "Output already exists" in (target / "overwrite-retry.stderr").read_text()
                  and sha(report_file) == meta["adapter_output_sha256"])
            check(f"run_{index}_all_input_bytes_unchanged", snapshot(inputs) == before)
            meta["completed_at"] = now()
            meta["original_verifier_sha256"] = sha(target / "original-verifier.json")
            write_json(target / "execution.json", meta)
        check("distinct_offline_execution_ids", runs[0]["offline_execution_id"] != runs[1]["offline_execution_id"])
        check("distinct_package_run_ids", runs[0]["package_offline_run_id"] != runs[1]["package_offline_run_id"])
        check("identical_all_input_checksums", runs[0]["input_sha256"] == runs[1]["input_sha256"])
        check("identical_adapter_bytes", (output / "run-1/adapter-report.json").read_bytes()
              == (output / "run-2/adapter-report.json").read_bytes())
        check("identical_semantic_output", canonical(reports[0]) == canonical(reports[1]))
        # Negative case on an isolated copy; untouched archive remains authoritative.
        bad = output / "tampered-inputs"
        shutil.copytree(output / "run-1/inputs", bad)
        with (bad / "baseline_v0.1.json").open("ab") as handle:
            handle.write(b"\n")
        bad_output = output / "tampered-report.json"
        rc = command([node_path, str(ROOT / "scripts/vin9-adapt.js"), "--input-dir", str(bad),
                      "--output", str(bad_output)], output / "tampered.log", output / "tampered.stderr")
        check("tampered_bytes_rejected_without_output", rc != 0 and not bad_output.exists()
              and "SHA256 mismatch" in (output / "tampered.stderr").read_text())
        check("original_archive_unchanged", sha(archive) == ARCHIVE_SHA256)
        check("adapter_sources_unchanged", source_hashes == {n: sha(ROOT / n) for n in source_hashes})
        result["totals_by_segment"] = {s["name"]: s["summary"] for s in reports[0]["segments"]}
        result["status"] = "OK_OFFLINE_ONLY"
    except Exception as exc:
        result["status"] = "FAIL_OFFLINE"
        result["error"] = str(exc)
    finally:
        result["completed_at"] = now()
        write_json(output / "comparison.json", result)
        # Ledger excludes itself; errors and negative-case bytes remain inspectable.
        ledger = "".join(f"{value}  {name}\n" for name, value in snapshot(output).items())
        with (output / "SHA256SUMS").open("x") as handle:
            handle.write(ledger)
    print(json.dumps({"status": result["status"], "checks": len(checks),
                      "M1": result["M1"], "postgresql_test": result["postgresql_test"]}))
    return 0 if result["status"] == "OK_OFFLINE_ONLY" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--node", default="node")
    args = parser.parse_args()
    try:
        return run(args.archive, args.output, args.node)
    except (OSError, ValueError) as exc:
        print("VIN-9 preflight failed: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
