# VIN-7 — verifica Universal Links

Data UTC: 2026-10-23T21:36:17.253003+00:00

Esito: **INCOMPATIBLE**. Gate: **OPEN — REVIEW_REQUIRED**.

Il confronto statico non sostituisce swcutil, firma verificata sul Mac o prova iPhone.

SHA-256 AASA: `ede97dbf06b3e703cd950b3591a29351ce9b24eccab58b1a913b3c7e4571bf02`

## Corrispondenze

- `callback.url`: HTTPS, host e percorso esatti; query/frammento non vincolati.
- `http.scope`: GET da questo ambiente; trust TLS standard. Non verifica CDN Apple.

## Incompatibilità

- `domain.contract`: Rilevato: seagroup.info; atteso: www.seagroup.info
- `http.status`: Rilevato: 301; atteso: 200
- `http.mime`: Rilevato: text/html; atteso: application/json
- `http.redirect`: Location presente; non seguito.
- `aasa.json`: Expecting value: line 1 column 1 (char 0)

## Informazioni/prove mancanti

- `build.signedEvidence`: Acquisire la .app firmata su Mac con collect_signed_build.py.
- `apple.matcher`: swcutil sul Mac: positivi e negativi, poi confronto origine/CDN Apple.
- `iphone.endToEnd`: Stessa build installata: apertura da Note, avvio freddo/caldo, URL nell'handler e negativi.
- `wearable.configuration`: Confermare app ricevente e URL effettivo configurato in Meta.
