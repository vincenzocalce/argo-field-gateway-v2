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

## Test riproducibili

Richiesto Node >=18 per node:test/fetch. Dopo npm install:

```sh
npm run test:aasa
```

I test aprono il gateway su loopback e porta effimera: status, MIME, JSON esatto,
assenza di redirect, varianti errate del percorso, HEAD e callback GET con query.
server.js esporta app per i test; npm start continua ad aprire la porta normale.
Nessuna nuova dipendenza. Il repository base non contiene un lockfile.

Verifica del 06/10/2026: 4/4 test superati, Node 24.19.0, Express 4.22.3.
Nell'ambiente di verifica una dipendenza transitiva non era ancora disponibile
nell'installazione locale: esecuzione con NODE_PATH del runtime preinstallato.
git diff --check superato. Nessun test su dispositivo o dominio pubblico eseguito.

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

## Isolamento

Base main: 3e53f6f3f1ec7e3ed22014f412bb828c7e31edef.
Nessun commit delle PR #1 (VERIFY_TOKEN) o #2 (5V) incluso.
Al merge conservare gli script test delle altre PR e rieseguire tutte le suite;
eventuali conflitti server.js/package.json vanno risolti in integrazione.
La patch non modifica validazione token o log e non effettua deploy.

Riferimenti Apple:
- https://developer.apple.com/documentation/xcode/supporting-associated-domains
- https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links
