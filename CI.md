# Gateway CI — perimetro e integrazione

Il workflow ci.yml esegue su pull_request, push a main e workflow_dispatch:
- reference-pr1-token: npm test al commit 26f6d59f1b866bf631bed2ed7fb886d2492f3591;
- reference-pr2-5v: npm run test:5v al commit 8432925c9cc95fce0c8a9417c0038e7d9d2ef3be;
- integration-token: npm test sulla revisione dell'evento;
- integration-5v: npm run test:5v sulla stessa revisione dell'evento.

Su pull_request la revisione di integrazione è il merge commit di prova creato da GitHub,
non un merge automatico delle PR #1 e #2. I job reference sono evidenza degli SHA
storici, non dei successivi aggiornamenti delle PR. I check appartengono alla PR che
contiene il workflow, non vengono retroattivamente aggiunti ai due vecchi head.

Entrambi i job integration devono passare. Script assente, installazione fallita o test
fallito fanno fallire il rispettivo job: nessun --if-present, continue-on-error o skip
per script assenti. fail-fast false permette di ottenere tutti i risultati.

## Riproduzione e dipendenze

Node fissato a 24.19.0; Actions fissate a SHA; runner ubuntu-24.04.
Ogni job stampa commit effettivo, node --version, npm --version e npm ls --all.
Con package-lock.json o npm-shrinkwrap.json: npm ci --ignore-scripts --no-audit --no-fund.
Senza: npm install --package-lock=false --ignore-scripts --no-audit --no-fund.
Cache npm non abilitata. Nessun token operativo o secret richiesto.

La procedura è ripetibile, ma senza lockfile versionato la risoluzione delle dipendenze
NON è identica garantita tra run. Anche l'immagine hosted Ubuntu può evolvere.
Per fissare l'albero futuro, generare e revisionare package-lock.json insieme
all'integrazione; il workflow passerà automaticamente a npm ci e fallirà se manifest
e lockfile divergono, senza fallback a install.

## Gate di integrazione attualmente aperto

main non ha nessuno dei due script: questa PR CI da sola deve restare rossa nei job
integration. Integrare entrambe le patch e conservare entrambi gli script.

Le patch modificano entrambe package.json e server.js. La suite token della PR #1
avvia server.js tramite require; la PR #2 introduce createApp e avvio solo quando
require.main === module. Adeguare la fixture della suite token all'entrypoint integrato,
preservando i test assente/vuoto/spazi, handshake e contratto HTTP. Non disabilitare test.
La validazione VERIFY_TOKEN va mantenuta e i test 5V devono usare una configurazione
sintetica esplicita dove richiesta dalla futura API integrata.

I due job integration verificano separatamente i comandi; npm test (node --test)
potrebbe includere anche test-5v.cjs. Non sommare i conteggi dei job come test unici.

## Significato delle evidenze

CI PASS = suite sintetiche superate per SHA e ambiente registrati.
Non certifica deploy Render, webhook Meta configurato, traffico operativo, metriche
5V MISURATO, persistenza, parse_run_id, PostgreSQL TEST o superamento del gate M1.
Non modifica protezioni del branch e non impedisce da sola un merge manuale:
per quel vincolo rendere obbligatori i due check integration nelle regole del repository.

Preparazione: YAML analizzato localmente; nessuna suite dichiarata PASS prima dei
risultati effettivi GitHub. PR #1/#2 e main non modificati da questa proposta.
