# argo-field-gateway-v2

Gateway ARGO per Meta/WhatsApp, wearable e missioni dell'app iOS.

## API missioni iOS

- `POST /argo/missions`: valida e salva una missione completa.
- `GET /argo/missions/:id`: legge una missione salvata.
- L'UUID della missione è la chiave primaria: un secondo invio dello stesso UUID
  risponde `already_exists` senza creare duplicati.
- Ogni missione deve contenere almeno 15 produttori e, per ciascun produttore,
  i CER `150106`, `200301` e `200108`.

Le API richiedono `Authorization: Bearer <ARGO_API_TOKEN>` oppure
`X-ARGO-API-Key: <ARGO_API_TOKEN>`.

## Telemetria Zenit per l'app iOS

- `GET /argo/telemetry/vehicles`: elenco mezzi normalizzato.
- `GET /argo/telemetry/vehicles/:vehicleId/daily?from=<RFC3339>&to=<RFC3339>`:
  missioni, chilometri, soste, minuti di sosta e ultima posizione.

La chiave Zenit resta esclusivamente sul gateway. L'app usa l'autenticazione
A.R.G.O. e non chiama direttamente il fornitore. Contratto, configurazione e
file Swift pronti per Xcode sono descritti in [ZENIT-TELEMETRY.md](ZENIT-TELEMETRY.md).

## Variabili Render

- `DATABASE_URL`: URL interno del PostgreSQL Render nella stessa regione.
- `ARGO_API_TOKEN`: credenziale lunga e casuale usata dall'app iOS.
- `VERIFY_TOKEN`: obbligatorio per l'avvio e per ogni factory. Valore assente,
  vuoto o di soli spazi impedisce l'avvio prima di creare il Pool PostgreSQL,
  eseguire SQL o aprire una porta. Nessun token predefinito; il confronto Meta
  conserva esattamente il valore configurato, inclusi eventuali spazi.
- `ZENIT_API_KEY`: chiave Zenit read-only, configurata solo su Render.
- `ZENIT_API_BASE_URL`: opzionale; normalmente si usa il valore predefinito
  `https://api.zenittelematics.com`.

Se `DATABASE_URL` non è configurata, il gateway continua a ricevere gli altri
eventi ma le API missioni rispondono `503`; questo evita di interrompere il
servizio esistente durante la migrazione.

`ARGO_API_TOKEN` assente/vuoto/di soli spazi rende le API missioni e telemetria non configurate
(`503`); credenziale mancante o errata su API configurata restituisce `401`.
`ZENIT_API_KEY` assente rende le sole API telemetria non configurate (`503`).
Le due credenziali svolgono ruoli distinti. `.env.example` non contiene segreti;
`npm start` non carica automaticamente `.env`. Per l'avvio locale si può usare
`node --env-file=.env server.js` dopo avere configurato i valori effettivi.

## Gateway integrato

`src/app.js` contiene l'unica `createApp()`, riesportata da `server.js`.
Importare uno dei moduli non inizializza il DB e non apre listener.
`npm start` richiama `start()`: token, schema/diagnostica DB, poi listener.
L'health check conserva `status`/`service` e il campo aggiuntivo `database`
della PR #8; quest'ultimo indica configurazione, non disponibilità in tempo reale.

Il middleware 5V resta prima dei parser ed è limitato ai POST Meta e wearable.
Misura byte/hash originali, anche compressi. I loro limiti restano 100 KB;
le missioni iOS accettano fino a 1 MB. JSON invalido e gzip invalido rispondono
`400`, corpi eccessivi `413`; i dettagli SQL e i payload non entrano nei log.
I percorsi sconosciuti sono registrati con una label fissa, senza URL grezzi.

L'AASA resta identico alla PR #7: JSON senza estensione, MIME JSON e nessun
redirect; autorizza il solo callback esatto. Vedere [AASA.md](AASA.md) per i gate
del dominio e del dispositivo ancora aperti.

L'idempotenza PostgreSQL resta atomica su UUID con `ON CONFLICT DO NOTHING`:
un reinvio dello stesso UUID, anche con payload diverso, restituisce `200`
`already_exists` e conserva il primo payload. Non è un'API di aggiornamento.
GET con UUID invalido restituisce `400`; UUID valido assente restituisce `404`.

## Test

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

`npm test` include le suite token, startup, iOS, diagnostica/privacy, 5V, AASA
e integrazione HTTP. I test con fake SQL sono esplicitamente distinti dalla
prova PostgreSQL reale. Per quest'ultima su un database dedicato di test:

```bash
ARGO_TEST_DATABASE_URL='postgres://user:password@localhost:5432/argo_gateway_test?sslmode=disable' npm run test:postgres
```

La suite reale richiede una URL esplicita e un nome DB contenente un segmento
`test`; non usa `DATABASE_URL` operativa e non fa skip. Crea solo schemi univoci
temporanei, poi li rimuove. La CI esegue entrambe le suite sulla stessa revisione
dell'evento, con PostgreSQL 16 isolato e senza credenziali operative.
Dettagli e limiti in [CI.md](CI.md) e [GATEWAY-INTEGRATION.md](GATEWAY-INTEGRATION.md).
