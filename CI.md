# Gateway CI — integrazione PR #7 e #8

Il job `regression` esegue `npm test` e `npm run test:postgres` sullo stesso
checkout della revisione evento, senza ref storici nella matrice. Per una PR
GitHub usa il merge commit di prova: non è un merge della PR in `main`.
Il log registra SHA effettivo, Node, npm, client/server PostgreSQL e dipendenze.

Node 24.19.0, runner ubuntu-24.04, Actions fissate a SHA, lockfile versionato;
installazione tramite `npm ci --ignore-scripts --no-audit --no-fund`.
Il servizio PostgreSQL 16 è isolato nel runner e usa solo credenziali sintetiche.
L'immagine `postgres:16` e il runner possono evolvere: la versione server effettiva
è registrata nel run. Nessun secret Render/Meta/iOS o database operativo richiesto.

Entrambe le suite sono obbligatorie: assenza script, configurazione PostgreSQL
mancante, installazione o test fallito interrompono il job. Nessun `--if-present`,
`continue-on-error` o test PostgreSQL saltato. La suite reale crea e rimuove solo
schemi temporanei univoci in un DB il cui nome contiene un segmento `test`.

La CI si attiva su pull_request, push a main e workflow_dispatch. Nessun job di
merge, pubblicazione, deploy o modifica dei branch protetti è presente.
I vecchi job reference della PR #7 sono sostituiti dalla verifica congiunta
dell'intero gateway: nessun run storico è attribuito alla nuova revisione.

## Riproduzione

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm ls --all
npm test
ARGO_TEST_DATABASE_URL='postgres://user:password@localhost:5432/argo_gateway_test?sslmode=disable' npm run test:postgres
git diff --check
```

`npm test` esegue i test HTTP/contratti/startup e le fixture SQL; la suite
PostgreSQL reale è separata e deve essere eseguita anche se la prima è verde.
Non usare una URL operativa per la suite reale.

## Evidenze al momento della preparazione

La suite locale con PostgreSQL non è eseguita: il runtime ha UID 0 e non consente
il cambio utente; `initdb` ufficiale rifiuta l'avvio come root. Non è usato un
emulatore. I risultati locali e i limiti sono in [GATEWAY-INTEGRATION.md](GATEWAY-INTEGRATION.md).
L'esito PostgreSQL deve essere letto dal run Actions della PR integrativa,
insieme al suo SHA e ai log, prima di dichiararlo PASS.

Anche un run CI verde riguarda un PostgreSQL sintetico del runner: non prova
un deploy Render, il dominio AASA pubblico, l'app iOS firmata, il traffico Meta,
la produzione o il gate M1. Nessuna protezione del branch è modificata.
