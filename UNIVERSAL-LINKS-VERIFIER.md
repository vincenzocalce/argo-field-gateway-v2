# VIN-7 — verificatore riproducibile Universal Links

**Gate OPEN / REVIEW_REQUIRED.** Questo strumento confronta il contratto
documentato, un JSON AASA e, quando disponibile, un manifest acquisito dalla
`.app` firmata. Non implementa il matcher Apple e non dichiara T0 superato.
Non modifica AASA, DNS, server pubblico, firma, app o impostazioni Meta.

## Contratto e provenienza

Il riferimento è la riconciliazione VIN-7 del 14/10, confermata dall'audit del
16/10, letta il 18/10/2026. Il piano wearable usa `www.seagroup.info`; l'apex
`seagroup.info` rimane una scelta non riconciliata. Il default serve a verificare
quel piano, non costituisce approvazione di un nuovo dominio o target iOS.

| Campo | Atteso |
| --- | --- |
| Host del link | `www.seagroup.info` |
| Percorso | `/argo/wearable/callback` |
| application-identifier | `N6JGN24QMU.it.vincenzocalce.argo.wearable` |
| Bundle | `it.vincenzocalce.argo.wearable` |
| Team documentato | `N6JGN24QMU` |
| Entitlement firmato | `applinks:www.seagroup.info` |

Il contratto è versionato in `tools/universal_links/contract.json`. Il prefix
dell'application-identifier e il Team ID sono campi distinti: il secondo non
viene ricostruito dal primo. Le impostazioni `DEVELOPMENT_TEAM=N6JGN24QML` e
`PRODUCT_BUNDLE_IDENTIFIER=com.vincenzocalce.ARGO` dell'archivio Xcode storico
non sono entitlements firmati. Nessun manifest reale viene inventato da esse.

Base del lavoro: head #13 `314760aed0fca3fbc7b3e26aad46ae4558f5f320`, branch
`integration/gateway-ios-security-5v-aasa`. #13 era OPEN, DRAFT e NON MERGED al
controllo del 18/10; main `3e53f6f3f1ec7e3ed22014f412bb828c7e31edef`.

## Esecuzione offline

Python 3.9+ standard library; nessun pacchetto Python da installare. Comandi
dalla radice del repository. La suite Python viene eseguita anche nella CI
gateway sullo stesso checkout, senza richieste al dominio pubblico.

```sh
npm run test:universal-links
python3 tools/universal_links/verify.py --out universal-links-results/repository
python3 tools/universal_links/verify.py \
  --aasa tools/universal_links/fixtures/public-2026-10-14.transcribed.json \
  --out universal-links-results/historical
```

Il secondo confronto produce volutamente exit **2**, perché rileva `paths:["*"]`.
La fixture è una **trascrizione** del JSON nel testo VIN-7 del 14/10: non è il
corpo originale da 167 byte, non ne conserva l'hash e non prova lo stato attuale
del sito. Il suo hash è quello della trascrizione.

Ogni directory di output deve essere nuova. Contiene `report.json` e
`report.md`, con data UTC, SHA-256 degli input, corrispondenze, incompatibilità
e informazioni/prove mancanti. Gli output reali e i manifest della build vanno
in `universal-links-results/`, esclusa da Git. Solo evidenze pubbliche revisionate
o fixture sintetiche vanno aggiunte al repository.

Codici di uscita:

- **0**: nessuna incompatibilità rilevata negli input forniti. Può restare
  `INCOMPLETE`: build, pubblicazione e prove dispositivo non sono dedotte.
- **2**: almeno un'incompatibilità col contratto.
- **3**: errore di input/lettura oppure acquisizione di rete non riuscita.

Il campo `gate` è sempre `OPEN — REVIEW_REQUIRED`. Non usare exit 0 o CI verde
per chiudere VIN-7. Anche un manifest coerente mantiene aperte le prove fisiche.

## Lettura pubblica facoltativa, solo GET

```sh
python3 tools/universal_links/verify.py --fetch \
  --out universal-links-results/public
```

Richiede direttamente `https://www.seagroup.info/.well-known/apple-app-site-association`,
con timeout, trust TLS standard, nessuna autenticazione e nessun redirect seguito.
Controlla HTTP 200, MIME JSON, assenza di Location e limite 128 KiB; conserva
il corpo ricevuto (`aasa.body`) e i metadati essenziali nel report. Un errore di
rete è dato mancante, non prova di indisponibilità globale. Un HTTP misurato è
un'osservazione da quella rete; eventuali proxy intermedi e la CDN Apple restano
da confrontare sul Mac. Non vengono inviate richieste al callback.

`--domain seagroup.info` permette una diagnosi dell'apex, segnala il contrasto
col contratto www e non lo autorizza. `--callback-url` confronta un URL candidato:
HTTPS, host e path devono essere esatti; query e frammento sono liberi.
Il JSON AASA non contiene il dominio: un file locale da solo lascia sempre la
pubblicazione sul dominio come MISSING. Non dedurre l'host dal nome del file.

## Cosa controlla e limiti intenzionali

- JSON valido senza chiavi duplicate/NaN; struttura `applinks.details`.
- Identificativo app presente; formato moderno `components` oppure legacy
  `appID`/`paths`. Verifica tutte le voci relative all'app attesa, non solo la prima.
- Un solo percorso esatto. Rileva wildcard, slash finale, suffissi, discendenti,
  maiuscole, regole aggiuntive/esclusioni e modificatori non previsti. Un commento
  nel componente non altera la regola. Altre app nel documento sono fuori dal
  contratto di questa app.
- Opzioni sconosciute sono segnalate per revisione, senza affermare che il
  formato sia invalido per Apple. Non simula precedenza, normalizzazione URL,
  cache o comportamento iOS. Formati più articolati richiedono revisione.
- Nel manifest: bundle, application-identifier, Team ID, entitlement esatto
  senza modalità developer, metadati di tracciabilità e confronto con i campi
  selezionati del profilo. La wildcard del provisioning è distinta dalla
  wildcard dei percorsi AASA; non viene aggiunta al contratto URL.

## Acquisire la build sul Mac

Usare la `.app` esportata dalla stessa build che verrà installata sull'iPhone.
Un archivio antecedente all'esportazione può essere firmato diversamente.
Per una `.ipa`, estrarla localmente e indicare il bundle in `Payload/`.

```sh
python3 tools/universal_links/collect_signed_build.py '/percorso/ARGO.app' \
  --out universal-links-results/signed-build.json
python3 tools/universal_links/verify.py \
  --signed-build universal-links-results/signed-build.json \
  --out universal-links-results/build-comparison
python3 tools/universal_links/verify.py --fetch \
  --signed-build universal-links-results/signed-build.json \
  --out universal-links-results/public-and-build
```

Il collector esegue `codesign --verify --strict`, estrae gli entitlements firmati,
legge Info.plist, CDHash e hash dell'eseguibile; se presente decodifica il profilo
con `security cms`. Salva solo i campi necessari, mai UDID, certificati, profilo
integrale, keychain groups o percorsi personali. Se la verifica firma fallisce,
non produce il manifest. L'assenza del profilo resta MISSING e va interpretata
secondo la distribuzione utilizzata.

Se noto, aggiungere `--source-commit <SHA completo di 40 caratteri>`: è un dato
dichiarato dall'operatore, non ricavato dal binario. Senza questo valore la
tracciabilità resta incompleta. Il verificatore Linux confronta il manifest
importato; non autentica autonomamente la firma e non prova quale app sia
installata. Questa acquisizione richiede ancora esecuzione sul Mac reale.

## Prove Apple e iPhone ancora necessarie

Sul Mac eseguire il validatore Apple sul JSON del repository e su quello pubblico,
conservando comando, output e data. Verificare prima la sintassi di `swcutil`
nella versione macOS utilizzata.

```sh
sudo swcutil dl -d www.seagroup.info
sudo swcutil verify -d www.seagroup.info \
  -j .well-known/apple-app-site-association \
  -u 'https://www.seagroup.info/argo/wearable/callback?source=VIN-7'
```

Ripetere con la matrice seguente. Questi sono **attesi contrattuali**, non esiti
del matcher Apple già misurati.

| Variante | Atteso |
| --- | --- |
| callback esatto | Incluso |
| callback con query / frammento | Incluso |
| callback/ | Escluso |
| callback/extra | Escluso |
| callbackExtra | Escluso |
| /ARGO/WEARABLE/CALLBACK | Escluso |
| /altro-percorso | Escluso |

Confermare app ricevente (ARGO corrente o target wearable separato), URL Meta,
handler della stessa build, origine e CDN Apple. Su iPhone fisico: link in Note,
pressione prolungata e apertura nell'app, avvio freddo/caldo, ricezione dell'URL
nell'handler con parametri sintetici, query e negativi; fallback web senza app.
Registrare versione iOS, build/versione, hash/CDHash, commit, data UTC e risultati.
Digitare nella barra Safari, HTTP 200, test Node/Python, simulatori, HealthKit o
Core Motion non sostituiscono la prova end-to-end. La modalità developer non
valida il normale percorso CDN. Nessuna chiusura automatica del gate è prevista.

## Fonti

- [VIN-7](https://linear.app/vincenzocalce/issue/VIN-7/verificare-aasa-e-universal-links-wearable)
- [PR #13](https://github.com/vincenzocalce/argo-field-gateway-v2/pull/13)
- [Apple — Supporting associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
- [Apple — TN3155](https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links)
- [Apple — App ID Prefix e firma](https://developer.apple.com/library/archive/qa/qa1879/_index.html)
