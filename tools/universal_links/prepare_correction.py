#!/usr/bin/env python3
"""Stage the existing exact AASA after identity review; never deploy or pass T0."""
import argparse
import json
import sys
from pathlib import Path

import verify


def prepare(signed_raw, confirmed_application_identifier):
    contract = verify.parse_json(verify.CONTRACT.read_bytes())
    if confirmed_application_identifier != contract["applicationIdentifier"]:
        raise ValueError("App ricevente diversa dal contratto: riconciliare in una PR separata, senza dedurre AppID dal Team ID.")
    signed = verify.parse_json(signed_raw)
    raw = (verify.ROOT / ".well-known/apple-app-site-association").read_bytes()
    # Copy the reviewed repository bytes, not a new ID composed from build settings.
    expected = {"applinks": {"details": [{
        "appIDs": [contract["applicationIdentifier"]],
        "components": [{"/": contract["path"]}],
    }]}}
    if verify.parse_json(raw) != expected:
        raise ValueError("AASA repository diverso dal candidato minimo revisionato: revisione richiesta.")
    report = verify.inspect(raw, contract["domain"],
                            "https://" + contract["domain"] + contract["path"],
                            signed=signed, source={"kind": "local-file",
                            "file": ".well-known/apple-app-site-association"})
    # Apple/device/publication remain missing by design, but software, identity,
    # provisioning and traceability must all match before even staging a file.
    blocking = [item["check"] for item in report["findings"]
                if item["status"] == "INCOMPATIBLE" or
                (item["status"] == "MISSING" and
                 item["check"].startswith(("build.", "profile", "aasa."))
                 and item["check"] != "aasa.publication")]
    if blocking:
        raise ValueError("Candidato non prodotto; verifiche mancanti/incompatibili: " + ", ".join(blocking))
    report["signedBuildSHA256"] = verify.sha256(signed_raw)
    report["preparation"] = {
        "status": "STAGED_FOR_REVIEW_ONLY",
        "confirmedApplicationIdentifier": confirmed_application_identifier,
        "confirmationProvenance": "operator-supplied; not independent signature verification",
        "publicationPerformed": False,
        "deviceTestPerformed": False,
    }
    return raw, report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--signed-build", type=Path, required=True)
    parser.add_argument("--confirmed-application-identifier", required=True,
                        help="App ricevente confermata dopo esame della stessa build firmata")
    parser.add_argument("--out", type=Path, required=True, help="Nuova directory locale, mai pubblicata automaticamente")
    args = parser.parse_args(argv)
    try:
        if args.out.exists():
            raise ValueError("Output già presente; usare una nuova directory.")
        raw, report = prepare(args.signed_build.read_bytes(), args.confirmed_application_identifier)
        args.out.mkdir(parents=True)
        (args.out / "apple-app-site-association").write_bytes(raw)
        (args.out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        (args.out / "report.md").write_text(verify.markdown(report), encoding="utf-8")
        print("Candidato locale pronto per revisione; nessun deploy. Gate OPEN — REVIEW_REQUIRED.")
        return 0
    except (OSError, ValueError, UnicodeError) as error:
        print("Preparazione bloccata: " + str(error), file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
