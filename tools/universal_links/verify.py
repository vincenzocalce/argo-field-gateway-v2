#!/usr/bin/env python3
"""Conservative VIN-7 contract checks, NOT an implementation of Apple's matcher."""
import argparse
import hashlib
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = Path(__file__).with_name("contract.json")
MAX_AASA_BYTES = 128 * 1024


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key: " + key)
        result[key] = value
    return result


def parse_json(raw):
    def invalid_constant(value):
        raise ValueError("Non-JSON constant: " + value)
    return json.loads(raw, object_pairs_hook=unique_object, parse_constant=invalid_constant)


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def string(value):
    return isinstance(value, str) and bool(value.strip())


def strings(value):
    return isinstance(value, list) and all(string(item) for item in value)


def host_only(value):
    return isinstance(value, str) and bool(re.fullmatch(
        r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", value)) and ".." not in value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_aasa(domain):
    """Read only, system TLS trust, no redirects, credentials or unbounded body."""
    url = "https://" + domain + "/.well-known/apple-app-site-association"
    metadata = {"url": url, "capturedAt": utc_now(), "redirectsFollowed": False}
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    opener = urllib.request.build_opener(NoRedirect())
    try:
        try:
            response = opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            metadata.update({"status": response.code,
                             "contentType": response.headers.get("Content-Type", ""),
                             "location": response.headers.get("Location"),
                             "tls": "system-trust-accepted"})
            raw = response.read(MAX_AASA_BYTES + 1)
        metadata["sha256"] = sha256(raw)
        metadata["bytesRead"] = len(raw)
        metadata["truncated"] = len(raw) > MAX_AASA_BYTES
        return raw, metadata
    except (urllib.error.URLError, OSError, TimeoutError) as error:
        metadata["error"] = str(error)
        return None, metadata


def inspect(raw, domain, callback_url, signed=None, transport=None, source=None):
    contract = parse_json(CONTRACT.read_bytes())
    findings = []

    def add(code, status, message):
        findings.append({"check": code, "status": status, "message": message})

    def compare(code, actual, expected):
        if actual is None or actual == "" or actual == []:
            add(code, "MISSING", "Dato assente; atteso: " + str(expected))
        elif type(actual) is type(expected) and actual == expected:
            add(code, "MATCH", str(actual))
        else:
            add(code, "INCOMPATIBLE", "Rilevato: " + str(actual) + "; atteso: " + str(expected))

    compare("domain.contract", domain, contract["domain"])
    parsed = urllib.parse.urlsplit(callback_url)
    if (parsed.scheme == "https" and parsed.netloc == domain
            and parsed.path == contract["path"]):
        add("callback.url", "MATCH", "HTTPS, host e percorso esatti; query/frammento non vincolati.")
    else:
        add("callback.url", "INCOMPATIBLE", "Richiesto https://" + domain + contract["path"])

    if transport is None:
        add("aasa.publication", "MISSING", "JSON locale: host, HTTP, TLS e pubblicazione non verificati.")
    elif transport.get("error"):
        add("aasa.publication", "MISSING", "Acquisizione non riuscita da questo ambiente; vedi transport.error.")
    else:
        compare("http.status", transport.get("status"), 200)
        compare("http.mime", transport.get("contentType", "").split(";", 1)[0].strip().lower(), "application/json")
        add("http.redirect", "INCOMPATIBLE" if transport.get("location") else "MATCH",
            "Location presente; non seguito." if transport.get("location") else "Nessun Location.")
        add("http.scope", "MATCH", "GET da questo ambiente; trust TLS standard. Non verifica CDN Apple.")

    target = contract["applicationIdentifier"]
    if raw is None:
        add("aasa.json", "MISSING", "Nessun corpo disponibile.")
    else:
        try:
            if len(raw) > MAX_AASA_BYTES:
                raise ValueError("AASA oltre 128 KiB")
            aasa = parse_json(raw)
            if not isinstance(aasa, dict) or not isinstance(aasa.get("applinks"), dict):
                raise ValueError("applinks deve essere un oggetto")
            links = aasa["applinks"]
            details = links.get("details")
            if not isinstance(details, list) or not details:
                raise ValueError("applinks.details deve essere un array non vuoto")
            add("aasa.json", "MATCH", "JSON valido, chiavi uniche, dimensione entro 128 KiB.")
            if set(links) - {"details", "apps"}:
                add("aasa.options", "MISSING", "Opzioni applinks non supportate dal verificatore; revisione Apple necessaria.")
            if "apps" in links and links["apps"] != []:
                add("aasa.apps", "INCOMPATIBLE", "Il campo legacy applinks.apps deve essere [].")
            found = False
            for index, entry in enumerate(details):
                code = "aasa.details." + str(index)
                if not isinstance(entry, dict):
                    add(code, "INCOMPATIBLE", "La voce deve essere un oggetto.")
                    continue
                modern = "appIDs" in entry
                legacy = "appID" in entry
                ids = entry.get("appIDs") if modern else [entry.get("appID")]
                if modern == legacy or not strings(ids) or not ids:
                    add(code, "INCOMPATIBLE", "Identità ambigua o malformata: usare appIDs oppure appID.")
                    continue
                if target not in ids:
                    add(code, "MATCH", "Voce per altra app; non dimostra associazione dell'app richiesta.")
                    continue
                found = True
                add(code + ".identity", "MATCH", target)
                allowed = {"appIDs", "appID", "components", "paths"}
                if set(entry) - allowed:
                    add(code + ".options", "MISSING", "Opzioni details non supportate; nessun PASS dedotto.")
                has_components, has_paths = "components" in entry, "paths" in entry
                if has_components == has_paths:
                    add(code + ".rules", "INCOMPATIBLE", "Usare un solo formato: components oppure paths.")
                    continue
                if has_paths:
                    if not legacy:
                        add(code + ".format", "INCOMPATIBLE", "Il formato legacy paths richiede appID.")
                    if entry["paths"] == [contract["path"]]:
                        add(code + ".paths", "MATCH", "Unico percorso esatto nel formato legacy.")
                    else:
                        add(code + ".paths", "INCOMPATIBLE", "paths deve contenere solo il callback esatto, senza wildcard o esclusioni.")
                else:
                    components = entry["components"]
                    if not isinstance(components, list) or not components:
                        add(code + ".components", "INCOMPATIBLE", "components deve essere un array non vuoto.")
                        continue
                    # Strict allowlist: no attempt to emulate Apple pattern precedence.
                    # Extra rules, exclusions and case/query modifiers need review.
                    valid = len(components) == 1 and isinstance(components[0], dict)
                    if valid:
                        rule = components[0]
                        valid = (set(rule) <= {"/", "comment"}
                                 and rule.get("/") == contract["path"]
                                 and ("comment" not in rule or isinstance(rule["comment"], str)))
                    add(code + ".components", "MATCH" if valid else "INCOMPATIBLE",
                        "Unico componente esatto; query/frammento liberi." if valid else
                        "Il contratto richiede un solo componente '/' esatto; regole aggiuntive, wildcard e modificatori non autorizzati.")
            add("aasa.applicationIdentifier", "MATCH" if found else "INCOMPATIBLE",
                target if found else "Identificativo richiesto non presente: " + target)
        except (ValueError, UnicodeError, TypeError) as error:
            add("aasa.json", "INCOMPATIBLE", str(error))

    if signed is None:
        add("build.signedEvidence", "MISSING", "Acquisire la .app firmata su Mac con collect_signed_build.py.")
    elif (not isinstance(signed, dict) or type(signed.get("schemaVersion")) is not int
          or signed.get("schemaVersion") != 1):
        add("build.schema", "INCOMPATIBLE", "Manifest firmato: schemaVersion 1 richiesto.")
    else:
        add("build.evidenceLimit", "MATCH", "Confronto di manifest importato; non autentica la firma né prova la build installata.")
        compare("build.source", signed.get("source"), "macos-codesign")
        compare("build.signatureVerification", signed.get("signatureVerified"), True)
        compare("build.bundleIdentifier", signed.get("bundleIdentifier"), contract["bundleIdentifier"])
        compare("build.applicationIdentifier", signed.get("applicationIdentifier"), target)
        # The expected Team ID is explicit, never inferred from the App ID prefix.
        compare("build.teamIdentifier", signed.get("teamIdentifier"), contract["teamIdentifier"])
        domains = signed.get("associatedDomains")
        entitlement = "applinks:" + domain
        if not strings(domains):
            add("build.associatedDomains", "MISSING", "Array Associated Domains assente o malformato.")
        elif entitlement in domains:
            add("build.associatedDomains", "MATCH", entitlement + "; eventuali altri host non sono validati.")
        else:
            add("build.associatedDomains", "INCOMPATIBLE", "Manca " + entitlement + "; wildcard, apex e ?mode=developer non sono equivalenti.")
        for field in ("capturedAt", "version", "build", "executableSHA256", "codeDirectoryHash", "sourceCommit"):
            value = signed.get(field)
            valid = string(value)
            if valid and field in ("executableSHA256", "codeDirectoryHash", "sourceCommit"):
                length = 64 if field == "executableSHA256" else 40
                valid = bool(re.fullmatch(r"[0-9a-fA-F]{" + str(length) + r"}", value))
            if valid and field == "capturedAt":
                try:
                    valid = datetime.fromisoformat(value.replace("Z", "+00:00")).tzinfo is not None
                except ValueError:
                    valid = False
            add("build." + field, "MATCH" if valid else "MISSING",
                str(value) if valid else "Tracciabilità della build incompleta o formato non valido.")
        profile = signed.get("provisioning")
        if not isinstance(profile, dict):
            add("profile", "MISSING", "Profilo non acquisito; verificare se presente nella distribuzione testata.")
        else:
            compare("profile.teamIdentifier", profile.get("teamIdentifier"), signed.get("teamIdentifier"))
            profile_id = profile.get("applicationIdentifier")
            app_id = signed.get("applicationIdentifier")
            if not string(profile_id) or not string(app_id):
                add("profile.applicationIdentifier", "MISSING", "Identificativi profilo/firma mancanti.")
            else:
                exact = profile_id == app_id
                wildcard = (profile_id.endswith(".*") and profile_id.count("*") == 1
                            and app_id.startswith(profile_id[:-1]))
                add("profile.applicationIdentifier", "MATCH" if exact or wildcard else "INCOMPATIBLE",
                    "Confronto profilo/firma; wildcard del provisioning distinta dai percorsi AASA.")
            profile_domains = profile.get("associatedDomains")
            if not strings(profile_domains):
                add("profile.associatedDomains", "MISSING", "Permesso Associated Domains del profilo non disponibile.")
            else:
                add("profile.associatedDomains", "MATCH" if entitlement in profile_domains or "*" in profile_domains else "INCOMPATIBLE",
                    "Confronto del permesso profilo per " + entitlement)

    for code, message in (
        ("apple.matcher", "swcutil sul Mac: positivi e negativi, poi confronto origine/CDN Apple."),
        ("iphone.endToEnd", "Stessa build installata: apertura da Note, avvio freddo/caldo, URL nell'handler e negativi."),
        ("wearable.configuration", "Confermare app ricevente e URL effettivo configurato in Meta.")):
        add(code, "MISSING", message)
    incompatible = any(item["status"] == "INCOMPATIBLE" for item in findings)
    return {"schemaVersion": 1, "generatedAt": utc_now(), "contract": contract,
            "source": source, "aasaSHA256": sha256(raw) if raw is not None else None,
            "transport": transport, "result": "INCOMPATIBLE" if incompatible else "INCOMPLETE",
            "gate": "OPEN — REVIEW_REQUIRED", "findings": findings}


def markdown(report):
    lines = ["# VIN-7 — verifica Universal Links", "", "Data UTC: " + report["generatedAt"],
             "", "Esito: **" + report["result"] + "**. Gate: **" + report["gate"] + "**.",
             "", "Il confronto statico non sostituisce swcutil, firma verificata sul Mac o prova iPhone.",
             "", "SHA-256 AASA: `" + str(report["aasaSHA256"]) + "`", ""]
    for status, label in (("MATCH", "Corrispondenze"), ("INCOMPATIBLE", "Incompatibilità"), ("MISSING", "Informazioni/prove mancanti")):
        lines += ["## " + label, ""]
        entries = [item for item in report["findings"] if item["status"] == status]
        lines += ["- `" + item["check"] + "`: " + item["message"].replace("\n", " ") for item in entries] or ["Nessuna."]
        lines.append("")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    inputs = parser.add_mutually_exclusive_group()
    inputs.add_argument("--aasa", type=Path, help="JSON locale (default: file del repository)")
    inputs.add_argument("--fetch", action="store_true", help="GET HTTPS sul dominio, senza redirect")
    parser.add_argument("--domain", default="www.seagroup.info", help="Host da confrontare col contratto, non una nuova autorizzazione")
    parser.add_argument("--callback-url", help="URL candidato, query/frammento ammessi")
    parser.add_argument("--signed-build", type=Path)
    parser.add_argument("--out", type=Path, help="Directory nuova per JSON/Markdown e corpo acquisito")
    args = parser.parse_args(argv)
    try:
        if not host_only(args.domain):
            raise ValueError("--domain deve essere un hostname minuscolo senza schema, porta, path o wildcard")
        if args.out and args.out.exists():
            raise ValueError("--out esiste già: scegliere una directory nuova per conservare le evidenze")
        transport = None
        if args.fetch:
            raw, transport = fetch_aasa(args.domain)
            source = {"kind": "https-get", "url": transport["url"]}
        else:
            path = args.aasa or ROOT / ".well-known/apple-app-site-association"
            raw = path.read_bytes()
            try:
                source_path = str(path.resolve().relative_to(ROOT))
            except ValueError:
                source_path = path.name
            source = {"kind": "local-file", "file": source_path}
        signed_raw = args.signed_build.read_bytes() if args.signed_build else None
        signed = parse_json(signed_raw) if signed_raw is not None else None
        callback = args.callback_url or "https://" + args.domain + "/argo/wearable/callback"
        report = inspect(raw, args.domain, callback, signed, transport, source)
        if args.signed_build:
            report["signedBuildSHA256"] = sha256(signed_raw)
        if args.out:
            args.out.mkdir(parents=True)
            (args.out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
            (args.out / "report.md").write_text(markdown(report))
            if args.fetch and raw is not None:
                (args.out / "aasa.body").write_bytes(raw)
        print(json.dumps(report, indent=2, ensure_ascii=False))
        if report["result"] == "INCOMPATIBLE":
            return 2
        return 3 if args.fetch and (raw is None) else 0
    except (OSError, ValueError, UnicodeError) as error:
        print("Input error: " + str(error), file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
