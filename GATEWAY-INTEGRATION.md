# Revisione integrativa del gateway A.R.G.O. — 13 ottobre 2026

## Fonti e perimetro

- PR #7: `9584a9a64222c12c251dfba526a2691821671f05`,
  https://github.com/vincenzocalce/argo-field-gateway-v2/pull/7
- PR #8: `42fb696dfc15c539a0c5c5cca4aef974f0592cc5`,
  https://github.com/vincenzocalce/argo-field-gateway-v2/pull/8
- Main osservato: `3e53f6f3f1ec7e3ed22014f412bb828c7e31edef`.
- Nota TEST corrente v1.1 dell'11/10/2026:
  https://app.notion.com/p/3f6686efdb8e81dab114e05f30dea20c

La proposta parte dallo head completo della PR #8, comprese le correzioni ai log,
alla diagnostica e ai riferimenti UUID già presenti in quel ramo. Integra gli
asset AASA, il middleware 5V e i test della PR #7, riconciliando gli entrypoint.
Le PR sorgenti e main non vengono modificati; nessun merge o deploy eseguito.
La PR #12 (adattatore documentale M1) è separata e non è inclusa.

## Confronto e decisioni applicate

| Aspetto | PR #7 | PR #8 | Integrazione |
| --- | --- | --- | --- |
| VERIFY_TOKEN | Obbligatorio, confronto esatto | Fallback `argo-test-token` | Obbligatorio prima di Pool/SQL/listener; nessun fallback |
| Factory | In server.js | In src/app.js; server avvia anche all'import | Unica in src/app.js, riesportata da server.js; start esplicito e main guard |
| Missioni | Assenti | POST/GET autenticati, PostgreSQL UUID | Conservati, con GET UUID invalido 400 |
| Idempotenza | Assente | PK UUID, ON CONFLICT DO NOTHING | Conservata atomicamente; primo payload resta anche su reinvio diverso |
| Parser | 100 KB; errori 400/413 | 1 MB globale; errori trasformati in 500 | 1 MB missioni, 100 KB altri; status client conservati anche su gzip malformato |
| 5V | Stream raw prima del parser | Log HTTP dopo parser | Middleware 5V identico #7 prima dei parser; log HTTP prima dei parser |
| AASA | JSON e route esatti | Assente | File/configurazione invariati; route JSON 200 senza redirect |
| Log | Nessun body nei 5V | Riferimenti missione hash, ma path/error grezzi possibili | Label fisse e errori sanitizzati, sink guasto non modifica risposta |
| Health | status/service | Anche campo database | Estensione database conservata; indica configurazione, non liveness DB |
| CI | Suite separate e riferimenti storici | Nessun workflow nel ramo | Suite congiunta e PostgreSQL reale sullo stesso ref evento |

Le suite sorgenti sono conservate. Cambiano solo le fixture necessarie: token
sintetico esplicito per i test iOS, configurazioni operative escluse dai processi
unitari e aspettativa health estesa con il campo `database` della PR #8.
Le risposte di errore parser diventano JSON sanitizzato; status HTTP storici
400/413 sono conservati, senza includere dettagli o stack Express.

## Verifiche locali riproducibili

Runtime: Node 24.19.0 / npm 11.9.0; dipendenze locali dal package-lock.json:
Express 4.22.3 / pg 8.23.1 / supertest 7.3.1. Nessun NODE_PATH esterno necessario.

- `npm ci --ignore-scripts --no-audit --no-fund`: completato.
- `npm ls --all`: completato senza dipendenze mancanti.
- `npm test`: **50/50 PASS**, 0 falliti/cancellati/skip/todo, eseguiti localmente
  il 13/10/2026. I risultati CI della revisione pubblicata sono distinti.
- `node --check server.js`, `node --check src/app.js` e sintassi suite PostgreSQL:
  superati.
- `git diff --check`: superato alla preparazione.

Copertura congiunta: token mancante/vuoto/spazi, confronto esatto e fallback
storico respinto; import senza I/O; avvio/schema/listener e cleanup su errore;
HTTP Meta/wearable, AASA esatto/HEAD/rifiuto percorsi, autenticazione iOS,
limiti distinti, JSON/gzip malformati, wire hash compresso, abort e sink guasto,
validazione 15 produttori e CER, roundtrip e retry tramite fixture SQL, privacy.
I test con fixture SQL non dimostrano persistenza PostgreSQL.

## Verifica PostgreSQL reale

Nove test in `test/postgres/integration.test.js`: schema ripetibile senza perdita
dati, due UUID distinti, reinvio anche maiuscolo, dodici reinvii concorrenti con
un solo inserimento, conservazione del primo payload/colonne/timestamp,
nuova app e nuova connessione Pool, diagnostica aggregata, errore SQL effettivo
sanitizzato e coesistenza AASA/5V/token/API con persistenza nella stessa app.

La suite richiede `ARGO_TEST_DATABASE_URL`, non usa `DATABASE_URL`, crea solo
schemi temporanei e li rimuove. Se manca la URL, fallisce senza skip.
Localmente PostgreSQL non è stato eseguito per il vincolo UID del runtime.
La CI usa un servizio PostgreSQL 16 reale e isolato: l'esito verrà indicato
nella PR solo dopo la lettura del run effettivo. [CI.md](CI.md) contiene i comandi.

## Evidenze pregresse e limiti

La nota Notion v1.1 documenta la prova dell'11 ottobre del ramo #8 su Render e
PostgreSQL TEST: POST 200, GET 304, 2 righe e 2 UUID distinti, 0 duplicati.
È una prova pregressa del ramo distribuito `42fb696`, non una nuova esecuzione
di questa integrazione. Il 304 è la rilettura condizionale Express; i nuovi
test di roundtrip verificano il payload con GET 200 senza cache condizionale.

Restano aperti i gate AASA su dominio/entitlement/device, la discrepanza
callback esatto vs callback*, il gate M1 parse_run_id/hash e la validazione
della nuova revisione su Render TEST e produzione. La policy TLS PostgreSQL
preesistente della PR #8 non è modificata da questa integrazione; i test CI
usano esclusivamente la connessione locale del runner.
Nessun esito locale, CI o TEST equivale a validazione di produzione.
