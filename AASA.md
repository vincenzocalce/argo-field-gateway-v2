# A.R.G.O. wearable — AASA

Stato T0: **REVIEW_REQUIRED**. La patch e i test locali non costituiscono
verifica del dominio pubblico, TLS, entitlement o apertura dell'app iOS.

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

## Gate di rilascio ancora aperti

1. Confermare che seagroup.info sia l'host definitivo del link e instradare questo
   specifico endpoint al gateway (o pubblicare lo stesso JSON sull'host).
   Un endpoint sul solo dominio Render non associa automaticamente seagroup.info.
2. Verificare HTTPS, catena TLS attendibile e risposta pubblica diretta senza
   redirect a www, login, slash finale o altro host. Il reverse proxy/CDN deve
   preservare JSON e MIME; controllare anche eventuali cache.
3. Nella build iOS firmata verificare application-identifier =
   N6JGN24QMU.it.vincenzocalce.argo.wearable e Associated Domains =
   applinks:seagroup.info, se questo è il dominio confermato.
4. Verificare su dispositivo reale un link da Notes/Mail verso
   https://seagroup.info/argo/wearable/callback, la consegna all'app e la gestione
   del callback; verificare anche che un percorso estraneo non sia associato.
   Considerare la cache AASA Apple durante reinstallazione/aggiornamento.
5. Allegare evidenze con data UTC, commit distribuito, host, header/body,
   verifica TLS, build/entitlement e risultato dispositivo prima di T0 PASS.

Controllo pubblico manuale dopo deploy (non usare -L o -k):

```sh
curl --silent --show-error --max-redirs 0 --dump-header /tmp/argo-aasa.headers --output /tmp/argo-aasa.body https://seagroup.info/.well-known/apple-app-site-association
cat /tmp/argo-aasa.headers
node -e 'console.log(JSON.parse(require("node:fs").readFileSync("/tmp/argo-aasa.body", "utf8")))'
```

Il solo exit code di curl non prova il successo: verificare 200, application/json,
assenza di Location e confronto integrale con il JSON della patch.

## Provenienza

Base di integrazione: PR #5, f1690d131eaf819630f804bfe5c649ca726c6060.
AASA e casi originari: PR #4, 9976a4bee677fa38fbf86ae8c87c32ed27d2e31c.
Proposta su branch separato; nessun merge o deploy. T0 e VIN-7 restano aperti.

Riferimenti Apple:
- https://developer.apple.com/documentation/xcode/supporting-associated-domains
- https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links
