# VIN-7 — verifica Universal Links

Data UTC: 2026-10-23T21:36:30.425182+00:00

Esito: **INCOMPLETE**. Gate: **OPEN — REVIEW_REQUIRED**.

Il confronto statico non sostituisce swcutil, firma verificata sul Mac o prova iPhone.

SHA-256 AASA: `b5d6ff87efa450d954a76fffea5268017b7af4581d9eae837b393b4513e5eac3`

## Corrispondenze

- `domain.contract`: www.seagroup.info
- `callback.url`: HTTPS, host e percorso esatti; query/frammento non vincolati.
- `aasa.json`: JSON valido, chiavi uniche, dimensione entro 128 KiB.
- `aasa.details.0.identity`: N6JGN24QMU.it.vincenzocalce.argo.wearable
- `aasa.details.0.components`: Unico componente esatto; query/frammento liberi.
- `aasa.applicationIdentifier`: N6JGN24QMU.it.vincenzocalce.argo.wearable

## Incompatibilità

Nessuna.

## Informazioni/prove mancanti

- `aasa.publication`: JSON locale: host, HTTP, TLS e pubblicazione non verificati.
- `build.signedEvidence`: Acquisire la .app firmata su Mac con collect_signed_build.py.
- `apple.matcher`: swcutil sul Mac: positivi e negativi, poi confronto origine/CDN Apple.
- `iphone.endToEnd`: Stessa build installata: apertura da Note, avvio freddo/caldo, URL nell'handler e negativi.
- `wearable.configuration`: Confermare app ricevente e URL effettivo configurato in Meta.
