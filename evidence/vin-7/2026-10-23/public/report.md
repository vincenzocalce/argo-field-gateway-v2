# VIN-7 — verifica Universal Links

Data UTC: 2026-10-23T21:36:10.849407+00:00

Esito: **INCOMPATIBLE**. Gate: **OPEN — REVIEW_REQUIRED**.

Il confronto statico non sostituisce swcutil, firma verificata sul Mac o prova iPhone.

SHA-256 AASA: `de3f317296bc040a58bc4b42710ce6a466d0f2acbe66dc0a89973d9db8e0f45b`

## Corrispondenze

- `domain.contract`: www.seagroup.info
- `callback.url`: HTTPS, host e percorso esatti; query/frammento non vincolati.
- `http.status`: 200
- `http.mime`: application/json
- `http.redirect`: Nessun Location.
- `http.scope`: GET da questo ambiente; trust TLS standard. Non verifica CDN Apple.
- `aasa.json`: JSON valido, chiavi uniche, dimensione entro 128 KiB.
- `aasa.details.0.identity`: N6JGN24QMU.it.vincenzocalce.argo.wearable
- `aasa.applicationIdentifier`: N6JGN24QMU.it.vincenzocalce.argo.wearable

## Incompatibilità

- `aasa.details.0.paths`: paths deve contenere solo il callback esatto, senza wildcard o esclusioni.

## Informazioni/prove mancanti

- `build.signedEvidence`: Acquisire la .app firmata su Mac con collect_signed_build.py.
- `apple.matcher`: swcutil sul Mac: positivi e negativi, poi confronto origine/CDN Apple.
- `iphone.endToEnd`: Stessa build installata: apertura da Note, avvio freddo/caldo, URL nell'handler e negativi.
- `wearable.configuration`: Confermare app ricevente e URL effettivo configurato in Meta.
