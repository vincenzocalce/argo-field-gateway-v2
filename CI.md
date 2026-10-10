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

L'integrazione include package-lock.json: i due job integration usano npm ci.
I due commit reference restano storici e senza lockfile, quindi la loro risoluzione
può variare. Anche l'immagine hosted Ubuntu può evolvere.

## Integrazione token + 5V

La proposta integra PR #1 (26f6d59), #2 (8432925) e il workflow invariato di
PR #3 (8bcb933), partendo da main 3e53f6f. La PR #4 AASA resta esclusa.

createApp() legge VERIFY_TOKEN dall'ambiente e rifiuta valori assenti, vuoti o
composti soltanto da spazi prima di costruire l'app. Nessun fallback; i valori
validi sono confrontati esattamente. L'importazione non apre listener; l'entrypoint
node server.js intercetta l'errore di configurazione e termina con exit code 1.
La fixture HTTP token chiama esplicitamente createApp().listen su loopback/porta 0.
La suite 5V imposta un token sintetico nel proprio processo e conserva tutti gli
otto casi originari. Il middleware observability-5v.js è identico alla PR #2.

npm test esegue esplicitamente test/*.test.js (8 test token/entrypoint).
npm run test:5v esegue test-5v.cjs (8 test 5V), senza duplicare i conteggi.
Nessuno skip o test disabilitato. Aggiunti controlli di validazione della factory
per le tre configurazioni invalide e avvio diretto con token valido.

## Verifica locale — 9 ottobre 2026

Node 24.19.0, npm 11.9.0, Express 4.22.3; dipendenze installate con npm install
--ignore-scripts --no-audit --no-fund e fissate nel lockfile.
- npm test: PASS, 8/8, 0 falliti, 0 skipped.
- npm run test:5v: PASS, 8/8, 0 falliti, 0 skipped.
- npm ls --all: exit 0; git diff --check: exit 0.

Nessuna regressione rilevata nei contratti coperti. Le stampe SyntaxError,
PayloadTooLargeError e request aborted sono attese nei test negativi 400/413/abort;
non rappresentano fallimenti della suite. Rimane il comportamento preesistente
dell'error handler Express, distinto dai record JSON 5V.
Questi risultati locali non sono risultati GitHub Actions: consultare i check della
PR integrativa per stato e SHA realmente eseguiti. Il run storico 37432760050
riguarda la PR #3 senza integrazione, non questa revisione.

## Significato delle evidenze

CI PASS = suite sintetiche superate per SHA e ambiente registrati.
Non certifica deploy Render, webhook Meta configurato, traffico operativo, metriche
5V MISURATO, persistenza, parse_run_id, PostgreSQL TEST o superamento del gate M1.
Non modifica protezioni del branch e non impedisce da sola un merge manuale:
per quel vincolo rendere obbligatori i due check integration nelle regole del repository.

PR #1/#2/#3/#4 e main non modificati da questa proposta. Nessun merge automatico.


## Integrazione AASA — 10/10/2026

Il branch integration/aasa-token-5v estende PR #5 con AASA della PR #4.
La matrice aggiunge integration-aasa (npm run test:aasa) sul medesimo ref evento.
Verifica locale: token 8/8, 5V 8/8, AASA 6/6, zero skip/fail; Node 24.19.0,
npm 11.9.0, Express 4.22.3 da npm ci. Dettagli e gap requisiti in AASA.md.
Lo stato CI della PR #5 sopra riportato è storico e non certifica questa revisione.
Nessuna deduzione su dominio pubblico, deploy, build iOS, PostgreSQL TEST o M1.
