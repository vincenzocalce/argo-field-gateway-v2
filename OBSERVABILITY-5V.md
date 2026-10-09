# Gateway — osservabilità 5V v0.1

Patch indipendente su base `3e53f6f3f1ec7e3ed22014f412bb828c7e31edef`.
Protocollo: https://app.notion.com/p/3ef686efdb8e81d29bc5ea6094db490f
Solo i POST `/webhook` e `/argo/wearable/callback` sono strumentati.
Nessuna implementazione AASA, argo-mission-1.1, persistenza M1 o modifica ai gate.
Nessun deploy e nessuna misura su traffico operativo sono stati eseguiti.

## Contratto JSON Lines

Un record `schema=argo.gateway.5v.v1` per richiesta completata/interrotta.
Gli altri log storici di avvio e verifica GET restano testuali: filtrare per schema.

| Campo | Significato |
| --- | --- |
| received_at / completed_at | Timestamp UTC server all'ingresso nel middleware / emissione del record |
| channel | meta_whatsapp oppure wearable |
| gateway_run_id | UUID generato all'avvio del processo; non è parse_run_id né run di estrazione |
| request_id | UUID server per ricezione; retry diversi ricevono UUID diversi |
| raw_bytes | Octet del corpo HTTP effettivamente osservato prima del parser, solo se completo |
| raw_bytes_observed | Conteggio parziale disponibile anche in caso di interruzione |
| raw_complete | Corpo interamente osservato prima dell'emissione |
| raw_sha256 | SHA-256 del corpo HTTP originale, non di JSON riserializzato; null se incompleto |
| content_encoding | identity, gzip, deflate, br oppure other; mai valore arbitrario di header |
| native_ids | Identificativi stringa espliciti, massimo 256 caratteri ciascuno, massimo 100 elementi |
| native_ids_truncated | Segnala che altri ID validi non sono stati inclusi |
| http_status | Esito HTTP lato server; null su abort, non prova di ricezione lato client |
| outcome | finished oppure aborted |
| duration_ms | Tempo monotono dall'ingresso al finish/abort; non latenza di ingestione |

I byte escludono header, TLS e framing chunked. Con Content-Encoding gzip/deflate
si misurano i byte compressi arrivati al gateway, NON una dimensione pre-compressione
alla sorgente. Conservare la codifica e non aggregare questo dato come volume
logico non compresso senza una misura aggiuntiva. Un proxy può trasformare il corpo
prima del gateway: perimetro di misura = stream HTTP visto da Node.

Meta: `entry[].changes[].value.messages[].id` identifica il messaggio;
`statuses[].id` è solo un riferimento al messaggio, etichettato
`status_message_reference`, non una chiave univoca della notifica di stato.
Wearable: si legge solo `event_id` se presente come stringa esplicita. Questo
non stabilisce un nuovo contratto per il producer. Nessun ID viene dedotto da
utente, telefono, dispositivo, kg o targa. ID assenti/non conformi: array vuoto.
Un POST può contenere più eventi; gli ID sono non verificati e controllati dal
mittente. Hash uguali non dimostrano identità semantica; nessuna deduplicazione.

I log di body preesistenti sui due POST sono rimossi. Il nuovo record non contiene
payload, testo messaggi, header, query, token o campi personali estratti.
Gli ID nativi e gli hash possono comunque essere correlabili: autorizzazioni e
retention del log devono essere definiti prima della raccolta operativa.
Nessun buffer raw aggiuntivo e nessuna dipendenza nuova; crypto e perf_hooks nativi.
La durata comprende l'elaborazione HTTP fino al finish, non il tempo di invio del
log. Un errore sincrono del sink viene ignorato per preservare la risposta;
crash, sink indisponibile o log persi possono produrre copertura incompleta.
Questi log non sono una garanzia di persistenza né di acquisizione esattamente una volta.

## Test locali riproducibili

Usare Node con test runner nativo (test verificati con Node 24.19.0).

```sh
npm install --package-lock=false --ignore-scripts
npm run test:5v
```

Gli 8 test HTTP su loopback usano solo dati sintetici e porte effimere:
UTF-8 e risposte; retry/ID mancanti; gzip e chunked; 400 e 413;
GET/health/routing; batch/status/limite ID; abort; errore sink.
Gli stack Express su stderr per i test negativi sono attesi.
Il repository base non ha lockfile: registrare `node --version`, `npm --version`
e `npm ls --all` con le evidenze; la risoluzione futura delle dipendenze può variare.

## Verifica manuale in ambiente autorizzato — NON ESEGUITA

In due terminali, dopo aver scelto esplicitamente l'ambiente:

```sh
PORT=3000 node server.js > gateway-5v.log 2> gateway-errors.log
```

```sh
printf '%s' '{"event_id":"synthetic-5v-001"}' > synthetic-5v.json
curl -i -H 'Content-Type: application/json' --data-binary @synthetic-5v.json http://127.0.0.1:3000/argo/wearable/callback
wc -c < synthetic-5v.json
sha256sum synthetic-5v.json
```

Atteso: risposta 200 con body ricevuto invariato; una riga JSON con hash/byte
corrispondenti al file e `native_ids` contenente l'ID sintetico. Ripetere: stesso
hash, request_id diverso. Usare i test automatici per webhook e casi negativi.
Non aggiungere dati sintetici alle misure operative.

## Raccolta futura delle evidenze

1. Fissare istanza/sorgente, commit, versioni Node/dipendenze, finestra [inizio,fine)
   e timezone Europe/Rome, copertura del servizio e trasformazioni del proxy.
2. Esportare JSON Lines filtrati per schema, conservare run di estrazione,
   metodo/versione, query o comando e checksum del file esportato. Collegare ogni
   gateway_run_id all'istanza nell'evidence manifest esterno.
3. Contare ricezioni separatamente da eventi unici; sommare solo raw_bytes completi
   nel perimetro/codifica dichiarato. Riportare abort, incomplete, ID mancanti,
   troncamenti e interruzioni di copertura separatamente; null non equivale a zero.
4. received_at alimenta finestre di arrivo. Manca event_time verificato: eventi
   unici per EVENT_TIME e p95 di ingestione restano NON MISURATO. Non usare
   duration_ms in loro sostituzione. Restano fuori anche revisioni, byte curated,
   retention, completezza semantica e Value.
5. Solo dopo raccolta reale: registrare evidence_ref immutabile o export con hash,
   data effettiva, versione codice/metodo e run_id di estrazione; passare a
   MISURATO/DA_VALIDARE, senza retrodatazioni o promozione automatica a VALIDATO.

Rollback della patch: revert del suo commit. Nessuna migrazione dati necessaria.
