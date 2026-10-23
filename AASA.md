# A.R.G.O. wearable — AASA

Stato T0: **REVIEW_REQUIRED**. La patch e i test locali non costituiscono
verifica del dominio pubblico, TLS, entitlement o apertura dell'app iOS.

## Procedura corrente — 23/10/2026

Vedi [proposta di correzione condizionata alla firma](AASA-CORRECTION.md) e
[evidenze HTTP aggiornate](evidence/vin-7/2026-10-23/README.md). Il pubblico
www serve ancora `paths:["*"]`; l'apex redirige. Il riferimento operativo resta
`www.seagroup.info` e il callback esatto. I build settings storici non provano
l'AppID firmato. Il preparatore copia il candidato solo dopo il confronto della
firma dichiarata e la conferma del ricevitore; nessuna pubblicazione automatica.

## Verificatore VIN-7 — 18/10/2026

Disponibile il [verificatore riproducibile](UNIVERSAL-LINKS-VERIFIER.md) per
JSON AASA, host, callback esatto e manifest della build firmata. Il riferimento
VIN-7 riconciliato usa `www.seagroup.info`; le citazioni dell'apex nelle sezioni
storiche sotto non sono una decisione successiva. Nessuna wildcard autorizzata.
I risultati statici non chiudono il gate. Vedi anche le
[evidenze del 18 ottobre](evidence/vin-7/2026-10-18/README.md).

## Integrazione gateway iOS — 13/10/2026

File AASA e perimetro del callback restano invariati. La factory è ora in
`src/app.js` e riesportata da `server.js`; l'avvio valida VERIFY_TOKEN prima
di inizializzare PostgreSQL e aprire listener. La suite AASA originaria resta
inclusa nella verifica congiunta descritta in [GATEWAY-INTEGRATION.md](GATEWAY-INTEGRATION.md).
Le sezioni datate sotto documentano la provenienza della PR #7, non il nuovo
esito CI o un deploy di questa revisione.

## Contratto

GET /.well-known/apple-app-site-association restituisce direttamente 200,
Content-Type application/json (con charset UTF-8), senza Location/redirect.
Il JSON sorgente è nel file omonimo senza estensione nella directory .well-known;
il gateway lo carica e valida all'avvio e lo serve tramite una route esplicita.

App: N6JGN24QMU.it.vincenzocalce.argo.wearable.
Il componente "/" autorizza esclusivamente /argo/wearable/callback.
Query e frammento non sono vincolati. Nessun wildcard: sottopercorsi e suffissi
non sono autorizzati. Non aggiungere "*" senza una decisione esplicita.

## Integrazione PR #4 + PR #5 — 10/10/2026

La factory `createApp()` resta l'unico export. Importare il modulo non apre porte;
`npm start` valida VERIFY_TOKEN e apre il listener. Token assente, vuoto o composto
solo da spazi resta un errore; nessun fallback. Il JSON AASA viene letto e analizzato
nella factory dopo la validazione del token. Middleware 5V e parser mantengono ordine
e implementazione della PR #5. Nessuna dipendenza nuova; lockfile conservato.

## Riconciliazione requisiti — REVIEW_REQUIRED

VIN-7 riporta `/argo/wearable/callback*`, mentre PR #4 e lo stato sviluppatori del
06/10 descrivono il callback esatto. L'allineamento T0 del 28/09 documenta GET/POST
simulati sul solo callback e cita anche `www.seagroup.info`: host apex e www restano
da riconciliare con gli entitlement della build firmata.

- `/argo/wearable/callback`: autorizzato dall'AASA proposto, GET/POST implementati.
- Query sul callback: non vincolata dall'AASA, contratto GET verificato.
- `/argo/wearable/callback/extra`: non autorizzato; HTTP 404.
- `/argo/wearable/callbackExtra`: non autorizzato; HTTP 404.
- `callback*` includerebbe anche suffissi, non soltanto sottopercorsi.
- Per autorizzare in futuro solo callback e discendenti servono due componenti,
  callback esatto e `callback/*`, dopo conferma dei requisiti/build.

Si conserva il perimetro della PR #4; la discrepanza non è dichiarata risolta.
Le tolleranze Express esistenti (case/slash finale) non sono un'autorizzazione AASA.
I test HTTP e il confronto JSON non simulano il matcher Apple su dispositivo.

Fonti consultate:
- https://linear.app/vincenzocalce/issue/VIN-7/verificare-aasa-e-universal-links-wearable
- https://github.com/vincenzocalce/argo-field-gateway-v2/pull/4
- https://app.notion.com/p/3f1686efdb8e813eb107dcf238e03793
- https://app.notion.com/p/3ea686efdb8e8172aaeff871672e87b5

## Test riproducibili

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run test:5v
npm run test:aasa
```

Node 24.19.0, npm 11.9.0, Express 4.22.3. Eseguiti con dipendenze locali dal lockfile:
8/8 token, 8/8 5V, 6/6 AASA; zero fallimenti/skip. `npm ls --all` e
`git diff --check` superati. Le suite token/5V preesistenti sono inalterate.
I quattro casi AASA originali restano, con fixture adattata alla factory e token
sintetico temporaneo; aggiunti verifica isolamento AASA/log 5V e rifiuto sottopercorsi.
`npm test` seleziona esplicitamente la suite token per mantenere conteggi distinti.
CI aggiunge integration-aasa sulla stessa revisione evento degli altri job integration.
Gli errori 400/413/abort prodotti dai test negativi 5V sono attesi.

## Gate di rilascio ancora aperti — riferimento corrente www

1. Accertare l'app ricevente e gli entitlements della stessa build firmata
   installata sul dispositivo. Non dedurre l'AppID dai build settings.
2. Seguire [AASA-CORRECTION.md](AASA-CORRECTION.md) per preparare il candidato
   dopo il confronto dell'identità; la sua pubblicazione richiede un'azione
   successiva autorizzata sul virtual host `www.seagroup.info`.
3. Verificare AASA HTTPS pubblico diretto 200/application/json senza Location;
   correggere separatamente il redirect HTTP/slash del callback esatto.
4. Verificare `applinks:www.seagroup.info`, matcher Apple/CDN, handler e prove
   positive/negative su iPhone reale. L'apex non viene aggiunto automaticamente.
5. Acquisire data, host, versione pubblicata, hash AASA e build, entitlements
   ed esiti dispositivo prima di qualsiasi decisione T0 PASS.

Controllo pubblico riproducibile (sola lettura, nessun redirect seguito):

```sh
python3 tools/universal_links/verify.py --fetch \
  --out universal-links-results/public-recheck
```

Il risultato statico, anche senza incompatibilità, non chiude il gate.
Le citazioni dell'apex nelle sezioni datate sopra sono provenienza storica.

## Provenienza

Base di integrazione: PR #5, f1690d131eaf819630f804bfe5c649ca726c6060.
AASA e casi originari: PR #4, 9976a4bee677fa38fbf86ae8c87c32ed27d2e31c.
Proposta su branch separato; nessun merge o deploy. T0 e VIN-7 restano aperti.

Riferimenti Apple:
- https://developer.apple.com/documentation/xcode/supporting-associated-domains
- https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links
