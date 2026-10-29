# VIN-7 — evidenze del 18/10/2026

**Gate Universal Links / T0: OPEN — REVIEW_REQUIRED.** Queste evidenze
documentano il verificatore e un GET pubblico; non la firma di una build reale
né l'apertura end-to-end su iPhone.

Codice verificatore: `ed0a499720c311e401d9746897cd2b51ff0c8e9c`.
Tree codice `721a7515ac878d8ca50840898bfe18ac38daafe0`, identico a quello
verificato localmente prima della pubblicazione tramite API GitHub.
Base #13: `314760aed0fca3fbc7b3e26aad46ae4558f5f320`.
Il commit successivo aggiunge soltanto questi rapporti. L'AASA del gateway,
le route, il dominio pubblico e la firma dell'app non sono modificati.

## Controlli effettivamente eseguiti

Ambiente locale Linux; Node 24.19.0, npm 11.9.0, Python 3.12.14.

| Controllo | Risultato | Evidenza |
| --- | --- | --- |
| Installazione lockfile `npm ci --ignore-scripts --no-audit --no-fund` | Completata, 104 pacchetti | Esecuzione locale |
| `npm test` | 57/57 PASS, zero fail/skip | [Sintesi Node](node-summary.txt) |
| `npm run test:universal-links` | 28/28 PASS | [Log Python](python-tests.txt) |
| JSON AASA del repository | AppID e callback esatto corrispondono; pubblicazione e build non provate | [Rapporto](repository.md), [JSON](repository.json) |
| JSON storico trascritto da VIN-7 | INCOMPATIBLE: wildcard globale | [Rapporto](historical-transcription.md) |
| GET pubblico www del 18/10 | HTTP 200, application/json, nessun Location; INCOMPATIBLE: wildcard globale | [Rapporto](public.md), [Metadati JSON](public.json), [Corpo originale](public.aasa.json) |
| `git diff --check` | PASS | Controllo locale |

I sei test HTTP AASA preesistenti sono inclusi nei 57 test Node; non vengono
sommati nuovamente. I test Python della build sono sintetici e simulano i comandi
del collector: **non** sono un'esecuzione di codesign/security su Mac. Il blocco
del collector fuori macOS è stato testato. Nessuna esecuzione locale PostgreSQL
in questa attività; eventuali risultati CI successivi vanno citati separatamente.

## Osservazione pubblica corrente

GET iniziato alle **17:46:33 UTC / 19:46:33 Europe/Rome** del 18/10/2026:

`https://www.seagroup.info/.well-known/apple-app-site-association`

- Trust TLS standard accettato; redirect non seguiti.
- Status 200; Content-Type `application/json`; nessun Location.
- Corpo originale: 167 byte, senza troncamento.
- SHA-256: `de3f317296bc040a58bc4b42710ce6a466d0f2acbe66dc0a89973d9db8e0f45b`.
- AppID corrispondente: `N6JGN24QMU.it.vincenzocalce.argo.wearable`.
- `paths: ["*"]`: incompatibile con il solo `/argo/wearable/callback`.

L'hash coincide con quello documentato in VIN-7 il 14/10. Questo è un nuovo GET
effettivo, non un riuso della rilevazione storica. Il rapporto pubblicato è una
nuova elaborazione dello stesso corpo catturato, con il codice al commit indicato;
`transport.capturedAt` conserva l'ora della richiesta, `generatedAt` quella
dell'elaborazione. Non è stata ripetuta la richiesta per rigenerare il rapporto.

Nessun nuovo controllo di apex, endpoint callback, Render o CDN Apple è stato
eseguito: per questi elementi restano solo le osservazioni storiche in VIN-7.
Il solo GET da questo ambiente non dimostra accessibilità da tutte le reti.

SHA-256 JSON repository:
`b5d6ff87efa450d954a76fffea5268017b7af4581d9eae837b393b4513e5eac3`.

La fixture `public-2026-10-14.transcribed.json` è una trascrizione del testo
storico, con hash proprio `63d7d7cab9003d279c0a88914084a7d1ede68fef8b9a4f4f077def2f3e4b0848`;
non va confusa con il corpo originale appena acquisito.

## Riproduzione e attività residue

```sh
git checkout ed0a499720c311e401d9746897cd2b51ff0c8e9c
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run test:universal-links
npm run verify:universal-links
```

Sul ramo contenente queste evidenze è inoltre possibile rianalizzare il corpo
pubblico congelato senza rete:

```sh
python3 tools/universal_links/verify.py \
  --aasa evidence/vin-7/2026-10-18/public.aasa.json
```

Atteso exit 2. Essendo una lettura offline, il nuovo rapporto non riafferma il
controllo HTTP: l'evidenza della pubblicazione è nel rapporto datato `public.json`.

Ancora necessari:

1. Identificare l'app ricevente e acquisire sul Mac la `.app` esportata realmente
   installata: identità firmata, Associated Domains, profilo, versione/build,
   hash/CDHash e commit. Nessun dato ricostruito dal solo progetto Xcode.
2. Confrontare il manifest col verificatore; usare `swcutil` sul JSON esatto e
   pubblico, positivi e negativi, verificando origine e cache CDN Apple.
3. Riconciliare l'AASA pubblico con il requisito esatto in una futura attività
   autorizzata. Qui non è stato modificato alcun dominio.
4. Provare su iPhone fisico la stessa build: Note, app chiusa/aperta, handler,
   query/frammento, negativi, fallback web; confermare URL Meta.
5. Registrare le evidenze e assumere una decisione esplicita sul gate solo dopo
   la prova end-to-end. VIN-7 non è completata da questi test software.

Istruzioni complete: [UNIVERSAL-LINKS-VERIFIER.md](../../../UNIVERSAL-LINKS-VERIFIER.md).
