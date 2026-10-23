# VIN-7 — evidenze del 23 ottobre 2026

**OPEN — REVIEW_REQUIRED. Nessun merge, deploy o prova Mac/iPhone.**

Base del verificatore PR #18: `075e3d0745eb8fe3b948ba919aac1d00301e2603`.
Base integrazione PR #13: `314760aed0fca3fbc7b3e26aad46ae4558f5f320`.
I file `verify.py`, `collect_signed_build.py`, `contract.json` e l'AASA servito
non sono modificati da questa proposta. L'aggiunta è il preparatore locale e
la procedura di correzione, con test ed evidenze. Nessun risultato nuovo sul
PostgreSQL TEST operativo o su database effimeri è prodotto localmente.

## Misure pubbliche

| Input | Rapporto | Esito |
| --- | --- | --- |
| AASA www, 21:36:07 UTC / 23:36:07 Roma | [JSON](public/report.json), [Markdown](public/report.md), [corpo originale](public/aasa.body) | 200/application/json, wildcard globale incompatibile |
| AASA apex, 21:36:12 UTC / 23:36:12 Roma | [JSON](apex/report.json), [Markdown](apex/report.md), [corpo](apex/aasa.body) | 301 verso www, non seguito |
| Callback www, 21:36:56 UTC / 23:36:56 Roma | [metadati](callback/report.json), [corpo](callback/body) | 301 verso HTTP con slash finale, non seguito |
| AASA repository locale | [JSON](repository/report.json), [Markdown](repository/report.md) | INCOMPLETE, nessuna incompatibilità statica |

Il MIME effettivo www è `application/json`. Il corpo pubblico è identico
byte-per-byte all'evidenza del 18/10; SHA-256
`de3f317296bc040a58bc4b42710ce6a466d0f2acbe66dc0a89973d9db8e0f45b`.
Il file repository ha SHA-256
`b5d6ff87efa450d954a76fffea5268017b7af4581d9eae837b393b4513e5eac3`.

`public/curl.headers` è un GET preliminare indipendente delle 21:35:22–23 UTC:
include l'header dell'intermediario di rete e quello HTTP/2 ricevuto. La misura
riproducibile successiva è quella del verificatore nel report, non una verifica
indipendente della CDN Apple o del certificato osservato da un iPhone.

Il rapporto apex indica anche il contrasto col dominio del contratto. La sua
riga `callback.url MATCH` verifica soltanto la forma dell'URL candidato rispetto
al parametro domain della diagnosi: non autorizza l'apex e non effettua GET al
callback. Il callback www è stato letto separatamente con `NoRedirect` della
stessa libreria standard usata dal verificatore, TLS standard e timeout 20 s.

## Riproduzione

Da radice repository, scegliendo directory di output nuove:

```sh
python3 tools/universal_links/verify.py --fetch \
  --out universal-links-results/public-new
python3 tools/universal_links/verify.py --fetch --domain seagroup.info \
  --out universal-links-results/apex-new
python3 tools/universal_links/verify.py \
  --out universal-links-results/repository-new
```

Il 23/10 le prime due esecuzioni restituiscono exit 2 (incompatibilità), la
terza exit 0 / INCOMPLETE. Non rappresentano guasti del test suite; nessuna
esecuzione dichiara PASS wearable.

## Test locali eseguiti

Linux; Node **24.19.0**, npm **11.9.0**, Python **3.12.14**.

- `npm ci --ignore-scripts --no-audit --no-fund`: completato dal lockfile.
- Suite originale PR #18: **28/28 PASS**, [log](python-baseline-tests.txt).
- Suite Python con preparatore: **37/37 PASS** (28 esistenti + 9 nuovi), [log](python-tests.txt).
- `npm test`: **57/57 PASS**, zero fail/skip, [riepilogo](node-summary.txt).
- `git diff --check`: PASS.

I nuovi test bloccano identità diverse, build settings al posto della firma,
campi mancanti, profilo incoerente, domini diversi/modalità developer, wildcard,
modifiche non revisionate all'AASA e sovrascrittura dell'output. Il caso positivo
usa un manifest **sintetico**, copia solo il candidato locale e conserva il gate
aperto. Non è un'acquisizione codesign su Mac né un test su dispositivo.

I corpi HTTP e i log selezionati qui sono pubblici/sintetici. Gli archivi iOS
privati ispezionati e le eventuali future evidenze di firma non vengono caricati.
Per differenze di identità e passaggi sul Mac/iPhone, vedere
[AASA-CORRECTION.md](../../../AASA-CORRECTION.md).
