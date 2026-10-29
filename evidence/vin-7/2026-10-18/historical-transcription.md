# VIN-7 — verifica Universal Links

Data UTC: 2026-10-18T17:47:49.302394+00:00

Esito: **INCOMPATIBLE**. Gate: **OPEN — REVIEW_REQUIRED**.

Il confronto statico non sostituisce swcutil, firma verificata sul Mac o prova iPhone.

SHA-256 AASA: `63d7d7cab9003d279c0a88914084a7d1ede68fef8b9a4f4f077def2f3e4b0848`

## Corrispondenze

- `domain.contract`: www.seagroup.info
- `callback.url`: HTTPS, host e percorso esatti; query/frammento non vincolati.
- `aasa.json`: JSON valido, chiavi uniche, dimensione entro 128 KiB.
- `aasa.details.0.identity`: N6JGN24QMU.it.vincenzocalce.argo.wearable
- `aasa.applicationIdentifier`: N6JGN24QMU.it.vincenzocalce.argo.wearable

## Incompatibilità

- `aasa.details.0.paths`: paths deve contenere solo il callback esatto, senza wildcard o esclusioni.

## Informazioni/prove mancanti

- `aasa.publication`: JSON locale: host, HTTP, TLS e pubblicazione non verificati.
- `build.signedEvidence`: Acquisire la .app firmata su Mac con collect_signed_build.py.
- `apple.matcher`: swcutil sul Mac: positivi e negativi, poi confronto origine/CDN Apple.
- `iphone.endToEnd`: Stessa build installata: apertura da Note, avvio freddo/caldo, URL nell'handler e negativi.
- `wearable.configuration`: Confermare app ricevente e URL effettivo configurato in Meta.
