#!/usr/bin/env python3
"""Collect only selected fields from an actual signed .app on macOS; no upload."""
import argparse
import hashlib
import json
import platform
import plistlib
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def run(command):
    return subprocess.run(command, check=True, capture_output=True, timeout=60)


def selected_entitlements(entitlements):
    return {
        "applicationIdentifier": entitlements.get("application-identifier"),
        "teamIdentifier": entitlements.get("com.apple.developer.team-identifier"),
        "associatedDomains": entitlements.get("com.apple.developer.associated-domains"),
    }


def manifest(info, entitlements, details, executable, profile, source_commit):
    cdhash = re.search(r"^CDHash=(\S+)$", details, re.MULTILINE)
    result = {
        "schemaVersion": 1,
        "source": "macos-codesign",
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "signatureVerified": True,
        "bundleIdentifier": info.get("CFBundleIdentifier"),
        "version": info.get("CFBundleShortVersionString"),
        "build": info.get("CFBundleVersion"),
        "executableSHA256": hashlib.sha256(executable).hexdigest(),
        "codeDirectoryHash": cdhash.group(1) if cdhash else None,
        "sourceCommit": source_commit,
        "sourceCommitProvenance": "operator-supplied; not inferred from binary",
        **selected_entitlements(entitlements),
        "provisioning": selected_entitlements(profile.get("Entitlements", {})) if profile else None,
    }
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", type=Path, help=".app effettivamente esportata/installata, non .xcodeproj")
    parser.add_argument("--source-commit", help="Commit della build, dichiarato dall'operatore (non auto-deducibile)")
    parser.add_argument("--out", type=Path, required=True, help="Nuovo file JSON locale")
    args = parser.parse_args(argv)
    try:
        if platform.system() != "Darwin":
            raise ValueError("Eseguire sul Mac con la .app firmata; nessuna acquisizione eseguita.")
        if args.out.exists():
            raise ValueError("Il file di output esiste già; scegliere un nuovo nome.")
        if args.source_commit and not re.fullmatch(r"[0-9a-fA-F]{40}", args.source_commit):
            raise ValueError("--source-commit richiede uno SHA Git completo di 40 cifre esadecimali.")
        app = args.app.resolve(strict=True)
        if app.suffix != ".app" or not app.is_dir():
            raise ValueError("Occorre il bundle .app iOS firmato.")
        # Verify before extracting: neither build settings nor an unsigned plist is evidence.
        run(["/usr/bin/codesign", "--verify", "--strict", str(app)])
        entitlements = plistlib.loads(run([
            "/usr/bin/codesign", "-d", "--entitlements", ":-", str(app)]).stdout)
        details_result = run(["/usr/bin/codesign", "-dv", "--verbose=4", str(app)])
        details = details_result.stderr.decode("utf-8", errors="replace")
        info = plistlib.loads((app / "Info.plist").read_bytes())
        executable_name = info.get("CFBundleExecutable")
        if not isinstance(executable_name, str) or Path(executable_name).name != executable_name:
            raise ValueError("CFBundleExecutable assente o non valido.")
        executable = (app / executable_name).read_bytes()
        profile_path = app / "embedded.mobileprovision"
        profile = None
        if profile_path.exists():
            profile = plistlib.loads(run([
                "/usr/bin/security", "cms", "-D", "-i", str(profile_path)]).stdout)
        result = manifest(info, entitlements, details, executable, profile, args.source_commit)
        # Never save the full provisioning profile, certificates, UDIDs or keychain groups.
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with args.out.open("x", encoding="utf-8") as output:
            json.dump(result, output, indent=2, ensure_ascii=False)
            output.write("\n")
        print("Manifest salvato. Verificare che corrisponda alla build installata; gate iPhone ancora aperto.")
        return 0
    except (ValueError, OSError, plistlib.InvalidFileException, subprocess.SubprocessError) as error:
        # Do not dump captured stderr/profile material into logs.
        print("Acquisizione non completata: " + str(error), file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
