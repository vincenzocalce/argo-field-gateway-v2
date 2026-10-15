# Muse Spark Open — laboratorio ARGO v0.1

Data: 15 ottobre 2026. Modulo sperimentale richiamabile da Node, accompagnato da CLI. Runtime richiesto: Node 22 o successivo. Nessuna nuova dipendenza. Baseline: main `3e53f6f3f1ec7e3ed22014f412bb828c7e31edef`.

## Esperimenti

| Prova | Input | Verifica |
| --- | --- | --- |
| E1 — estrazione | `fixtures/complete.txt` | Due righe, data, area, operatore, targa e pesi identici a `expected.json`. |
| E2 — qualità | `fixtures/missing.txt` e `fixtures/conflict.txt` | Campi assenti null, comunicazioni contrastanti conservate, conflitto segnalato e istruzione ostile ignorata. |
| E3 — visione | Foto PNG/JPEG di un foglio sintetico con gli stessi dati di E1 | Confronto con `expected.json`; illeggibile diventa null. La foto va preparata e controllata prima dell'invio. |

Le fixture sono sintetiche: non contengono persone, missioni o targhe operative. I risultati sono proposte documentali, sempre `review_required: true` ed `eligible_for_import: false`. Non rappresentano missioni iOS e non soddisfano il loro contratto API/SQL.

## Stato verificato

- 10/10 test locali superati su Node 24.19.0 con risposte simulate: attivazione, credenziali, trasporto testo/immagine, limiti, modello, errori, validazione, valutazione e protezione dei file.
- Test modello reali E1/E2/E3: **NON ESEGUITI**, chiave OpenRouter assente nell'ambiente.
- Accuratezza, costo reale, latenza reale, capacità visiva e resistenza all'istruzione ostile: **NON MISURATI**.
- Nessun collegamento automatico a WhatsApp, app iOS, Notion o PostgreSQL; nessun endpoint aggiunto. Il gateway continua a usare il codice preesistente. Nessun merge/deploy o avanzamento M1 dimostrato.

I test simulati verificano il codice, non le capacità di Muse. La fixture immagine del test automatico verifica esclusivamente il formato del trasporto; non costituisce una foto decodificabile o un test visivo reale.

## Accesso al modello

Il catalogo ufficiale OpenRouter consultato il 15/10/2026 elenca `meta/muse-spark-open`. La CLI usa esclusivamente questo modello e l'endpoint HTTPS OpenRouter fisso, senza strumenti o fallback di provider configurati. Un modello restituito con identificativo diverso viene rifiutato; verificare l'eventuale alias canonico prima di modificare tale controllo. Disponibilità, accesso dell'account e supporto effettivo dei parametri devono essere verificati con la prima chiamata.

Una chiave OpenRouter con credito va configurata localmente; non inserirla nei file versionati. `.env.example` contiene solo nomi di variabili e attivazione inizialmente false. Per attivare le prove, creare `experiments/muse/.env` con permessi 600, inserire la chiave e impostare `ARGO_MUSE_EXPERIMENT_ENABLED=true`. Non serve modificare Render per queste prove locali.

```bash
cp experiments/muse/.env.example experiments/muse/.env
chmod 600 experiments/muse/.env
# Modificare localmente il file prima del comando seguente.
mkdir -p experiments/muse/results
node --env-file=experiments/muse/.env experiments/muse/run.js experiments/muse/fixtures/complete.txt experiments/muse/results/E1.json
node experiments/muse/evaluate.js experiments/muse/results/E1.json complete
node --env-file=experiments/muse/.env experiments/muse/run.js experiments/muse/fixtures/missing.txt experiments/muse/results/E2-missing.json
node experiments/muse/evaluate.js experiments/muse/results/E2-missing.json missing
node --env-file=experiments/muse/.env experiments/muse/run.js experiments/muse/fixtures/conflict.txt experiments/muse/results/E2-conflict.json
node experiments/muse/evaluate.js experiments/muse/results/E2-conflict.json conflict
```

Per E3 creare una foto PNG/JPEG (massimo 2 MiB) dei dati sintetici E1 e un file di istruzioni con testo «Estrai le righe visibili; i dati da estrarre sono nell'immagine». Eseguire:

```bash
node --env-file=experiments/muse/.env experiments/muse/run.js istruzioni.txt experiments/muse/results/E3.json --image foglio-sintetico.png
node experiments/muse/evaluate.js experiments/muse/results/E3.json complete
```

La CLI effettua una sola richiesta per comando, senza retry, con massimo 4096 token di output e timeout di 60 secondi. Il limite token non è un tetto di spesa globale: impostare il limite di spesa anche sull'account/chiave del provider. Output riservati con permessi 600 e creazione esclusiva; un percorso esistente causa errore prima della chiamata. Gli esiti restano fuori da Git. Gli input vengono trasmessi a OpenRouter e al suo provider di inferenza: iniziare con i dati sintetici inclusi.

## Valutazione e decisione

`expected.json` è il riferimento stabilito prima della prova. L'evaluator confronta esattamente i campi delle righe e la data e controlla la presenza di una segnalazione per il conflitto; il significato della segnalazione va letto manualmente. Un alias testuale diverso viene contato come differenza. Controllare anche ogni valore estratto rispetto alla fonte: lo schema corretto non dimostra la veridicità del dato.

Ogni report registra run ID sperimentale (non `parse_run_id` PostgreSQL), timestamp, modello richiesto/restituito, hash del prompt, del testo, dell'eventuale immagine e del risultato, durata e consumo/costo quando comunicati dal provider. Ripetere ogni prova con un nuovo percorso di output per osservare la variabilità; temperatura zero non garantisce identità dei risultati.

Prima di estendere l'uso, predisporre almeno 30 casi distinti con risposta di riferimento revisionata, misurare esattezza dei campi, valori inventati, riconoscimento dei mancanti/conflitti, durata e costo. Criterio preliminare proposto: almeno 95% dei campi esatti e zero targhe/pesi inventati; ogni conflitto deve essere conservato e segnalato. Qualsiasi valore inventato blocca l'estensione e richiede correzione e nuova prova. Tre fixture sono uno smoke test, non una validazione statistica.

Previsioni dei carichi, distribuzione del lavoro e rischio DMS richiedono esperimenti separati e dati di riferimento validati: questo modulo estrae dati documentali. Nessuna evidenza del laboratorio determina PASS M1 o autorizza importazioni automatiche.

## Riprodurre i test del codice

```bash
node --test experiments/muse/client.test.js
```

## Fonti tecniche

- https://research.meta.ai/blog/muse-spark-open
- https://openrouter.ai/api/v1/models
- https://openrouter.ai/docs/api_reference/overview

Le fonti supportano la scelta dell'interfaccia; non attestano l'esecuzione degli esperimenti ARGO.
