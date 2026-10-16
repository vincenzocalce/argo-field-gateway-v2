# Muse Spark Open — laboratorio ARGO v0.1

Data: 15 ottobre 2026. Modulo sperimentale richiamabile da Node, accompagnato da CLI. Runtime richiesto: Node 22 o successivo. Nessuna nuova dipendenza. Baseline: main `3e53f6f3f1ec7e3ed22014f412bb828c7e31edef`.

## Esperimenti

| Prova | Input | Verifica |
| --- | --- | --- |
| E1 — estrazione | `fixtures/complete.txt` | Due righe, data, area, operatore, targa e pesi identici a `expected.json`. |
| E2 — qualità | `fixtures/missing.txt` e `fixtures/conflict.txt` | Campi assenti null, comunicazioni contrastanti conservate, conflitto segnalato e istruzione ostile ignorata. |
| E3 — visione | Foto PNG/JPEG di un foglio sintetico con gli stessi dati di E1 | Confronto con `expected.json`; illeggibile diventa null. La foto va preparata e controllata prima dell'invio. |

Le fixture sono sintetiche: non contengono persone, missioni o targhe operative. I risultati sono proposte documentali, sempre `review_required: true` ed `eligible_for_import: false`. Non rappresentano missioni iOS e non soddisfano il loro contratto API/SQL.

## Stato verificato — aggiornamento 16 ottobre 2026

- 16/16 test locali su Node 24.19.0: risposte simulate, controlli dell'evaluator e replay offline di report storici. Nessuna nuova chiamata al modello in questo aggiornamento.
- Le chiamate reali della sessione Mac sono documentate nella [relazione Notion](https://app.notion.com/p/3fb686efdb8e817db2eec490305c46bf). Con v2 complete/missing risultano positivi, conflict negativo; con v3 è documentato positivo il solo conflitto.
- Recuperati `v3-conflict.json` e `v2-conflict-diagnostic.json`, entrambi sintetici. Il replay verifica hash input/risultato v3 e rifiuto dello schema v2. Non è una interrogazione reale ripetuta né una attestazione indipendente del provider.
- Il testo esatto v3 non è contenuto nel report recuperato: è disponibile solo il suo hash. `prompts/v4-generalized.txt` è una nuova implementazione dei requisiti descritti in Notion, NON una copia byte per byte di v3. Il prompt pubblicato precedente è archiviato in `prompts/published-v1.txt`.
- v4: prove reali complete/missing/conflict/boundaries, messaggio operativo e multimodalità **DA ESEGUIRE**. Nessuna accuratezza generalizzabile dimostrata. Beneficio di tempo non misurato.
- Importazione automatica disabilitata; revisione umana obbligatoria. Nessun merge/deploy o avanzamento M1.

I mock sono ora marcati `SIMULATED`; i vecchi report dei test del client potevano riportare LIVE anche con trasporto sostituito. Le evidenze storiche non sono state riscritte. La firma immagine nei test verifica solo il trasporto. E3 nei primi report è il nome della prova testuale conflict, non una prova visiva.

### Differenze delle istruzioni

| Requisito | Prompt pubblicato precedente | v3 secondo Notion | Nuovo v4 |
|---|---|---|---|
| Etichette complete / schema esplicito | presenti | presenti e rafforzati | conservati |
| Ultima intestazione territoriale | non esplicita | documentata | esplicita, senza equivalenze geografiche |
| Alternative / righe ripetute | solo conflitti | alternative documentate | nessuna scelta o deduplicazione |
| Portate / anomalie dedotte | non esplicito | vietate senza evidenza | divieto esplicito |
| Eccezione per organizzazione specifica | assente nel pubblicato | riferimento da generalizzare | regola generale su organizzazioni/clienti/produttori |

Il confronto v3 è semantico sulla relazione, non un diff del sorgente mancante. Recuperare il testo originale con hash `ef4c46b1bc6e0a7ead675038a603faa678401cf83636b6437a8d426026727ddf` per chiudere questo punto.

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

`fixtures/boundaries.txt` aggiunge un caso nuovo rispetto alle prove storiche: cambio intestazione, ripetizioni identiche, zero esplicito e campi null. È un caso di regressione progettato durante questo aggiornamento, non un campione indipendente di validazione.

`expected.json` è il riferimento stabilito prima della prova. L'evaluator confronta esattamente i campi delle righe e la data e controlla la presenza di una segnalazione per il conflitto; il significato della segnalazione va letto manualmente. Un alias testuale diverso viene contato come differenza. Controllare anche ogni valore estratto rispetto alla fonte: lo schema corretto non dimostra la veridicità del dato.

Ogni nuovo report conserva anche il testo originale integrale, le righe incluse quelle vuote, e il testo/versione del prompt. Questi dati rimangono nei risultati locali esclusi da Git: non pubblicare report operativi. La conservazione della fonte non garantisce automaticamente la copertura delle righe estratte; questa richiede un riferimento revisionato. L’evaluator conta righe mancanti/modificate e inattese/modificate preservando la molteplicità, oltre al confronto esatto ordinato. Non può rilevare omissioni in un messaggio arbitrario privo di riferimento.

Ogni report registra run ID sperimentale (non `parse_run_id` PostgreSQL), timestamp, modello richiesto/restituito, hash del prompt, del testo, dell'eventuale immagine e del risultato, durata e consumo/costo quando comunicati dal provider. Ripetere ogni prova con un nuovo percorso di output per osservare la variabilità; temperatura zero non garantisce identità dei risultati.

Prima di estendere l'uso, predisporre almeno 30 casi distinti con risposta di riferimento revisionata, misurare esattezza dei campi, valori inventati, riconoscimento dei mancanti/conflitti, durata e costo. Criterio preliminare proposto: almeno 95% dei campi esatti e zero targhe/pesi inventati; ogni conflitto deve essere conservato e segnalato. Qualsiasi valore inventato blocca l'estensione e richiede correzione e nuova prova. Tre fixture sono uno smoke test, non una validazione statistica.

Previsioni dei carichi, distribuzione del lavoro e rischio DMS richiedono esperimenti separati e dati di riferimento validati: questo modulo estrae dati documentali. Nessuna evidenza del laboratorio determina PASS M1 o autorizza importazioni automatiche.

## Riprodurre i test del codice

```bash
node --test experiments/muse/*.test.js
```

## Fonti tecniche

- https://research.meta.ai/blog/muse-spark-open
- https://openrouter.ai/api/v1/models
- https://openrouter.ai/docs/api_reference/overview

Le fonti supportano la scelta dell'interfaccia; non attestano l'esecuzione degli esperimenti ARGO.
