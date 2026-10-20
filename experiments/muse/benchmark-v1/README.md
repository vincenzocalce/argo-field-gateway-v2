# Benchmark A.R.G.O. Muse — corpus separato v1.0.0

Preparato il 20 ottobre 2026. **Accuratezza del modello NON VALIDATA.**
36 messaggi sintetici nuovi, 57 righe attese e 321 campi attesi (data + cinque
campi per riga). Riferimenti proposti dall'assistente, **nessuna revisione
indipendente completata**. Revisione umana obbligatoria; importazione operativa
sempre esclusa. Non è una prova M1 né una verifica delle pesate.

## Origine e separazione

Base: PR #15, commit `3e436ac021fb04314de70fab37f24231439c4c2a`.
I quattro messaggi in `../fixtures` e `../expected.json` restano invariati.
`corpus.json` contiene testi, risultati attesi espliciti, motivazioni e criteri
per la revisione delle anomalie. `CASES.md` è la copia leggibile per revisione.
Tutti i nomi/alias, mezzi, quantità e combinazioni sono sintetici; i territori
reali sono soltanto etichette di prova e non attestano operazioni avvenute.

La verifica rileva zero input uguali alle quattro fixture, anche dopo
normalizzazione degli spazi. Questo dimostra separazione testuale, non
indipendenza statistica, assenza di somiglianze semantiche o indipendenza del
revisore. I casi coprono requisiti noti: non sono un campione casuale del campo.
Nessuna uscita del modello è stata usata per redigere o correggere questi attesi.
Se il corpus viene usato per modificare il prompt, diventa corpus di sviluppo:
serve un nuovo insieme tenuto separato per la successiva valutazione.

| Casi | Copertura principale |
|---|---|
| B001–B006 | Cambi area, intestazioni vuote/ripetute, etichette simili e punteggiatura |
| B007–B012 | Ripetizioni, inoltri, due eventi, alias e targhe condivisi, ordine |
| B013–B018 | Targhe, pesi, operatore e data mancanti; illeggibilità |
| B019–B024 | Zero esplicito, null, decimali, quantità senza portata documentata |
| B025–B030 | Conflitti su pesi, zero, targhe e territori; rettifica dichiarata |
| B031–B036 | Organizzazioni, frazione assente, CRLF, registrazioni incomplete, alias composti |

## Candidato congelato

Candidato: `v4-generalized`, letto dal client originale, senza modificarlo.
Versione Mac `v4` e versione storica `v3` sono esperimenti diversi. Il testo v3
non è stato ricostruito. `manifest.json` registra SHA-256 del corpus, di ogni
input/atteso, di prompt, client, valutatori e fixture di sviluppo. Un file
congelato modificato blocca verifica e confronto: non rigenerare silenziosamente
il manifest per far passare una verifica. Ogni cambiamento richiede nuova
versione del corpus/protocollo e documentazione del motivo prima delle chiamate.

## Valutatore e metriche

L'unica estensione a `../evaluate.js` espone `evaluateTarget`, conservando firma
e comportamento di `evaluate(report, fixture)`. Il benchmark riusa controllo
schema, confronto ordinato esatto, confronto multinsieme con molteplicità,
controllo generico di presenza di anomalie e flag di revisione/importazione.
Il nuovo `score.js` aggiunge il dettaglio atteso/ottenuto per ciascun campo.

- **Omissione**: campo noto atteso sostituito da null, o riga attesa mancante.
  `omitted_fields` conta anche slot null di una riga interamente omessa;
  `omitted_known_values` conta soltanto informazioni note perse.
- **Alterazione**: valore atteso non null sostituito da altro valore non null,
  inclusa la normalizzazione non autorizzata di un territorio.
- **Informazione inventata**: valore prodotto dove era atteso null, oppure
  valore non null in una riga aggiunta. Null→0 conta come invenzione; 0→null come
  omissione. Un valore non null sostituito è contato come alterazione, senza
  doppio conteggio come invenzione.
- **Esattezza dei campi**: campi esatti / (1 + 5 × righe attese). Include null
  corretti e data; non include testo libero delle anomalie. Le righe extra non
  aumentano il denominatore: esporre sempre invenzioni, righe extra e confronto
  esatto insieme alla percentuale. Anche un 100% di campi attesi può coesistere
  con righe aggiunte o ordine errato.
- **Esattezza per messaggio**: risultato del confronto deterministico più
  controllo di segnalazione non vuota dove richiesta. Non equivale a correttezza
  semantica delle anomalie né a validazione del modello.

Allineamento: prima si abbinano righe esattamente uguali, in ordine di comparsa,
preservando la molteplicità; sulle righe residue si minimizza il numero di campi
diversi con costo 1 per sostituzione e 5 per inserimento/eliminazione di riga.
Nei pareggi si preferiscono sostituzione, eliminazione, inserimento. Le coppie
indice atteso/ottenuto e tutte le differenze sono esposte. Questa convenzione
non dimostra l'identità degli eventi: righe residue completamente diverse
possono essere classificate come alterazioni. Revisionare l'allineamento quando
il caso è ambiguo. Il confronto esatto e i contatori originali
`missing_or_changed`/`unexpected_or_changed` rimangono disponibili.

`anomalies` è testo libero: il codice verifica solo presenza non vuota, mentre
`required_concepts` e `forbidden_claims` richiedono lettura umana. Una frase
irrilevante può superare la presenza: lo documenta un test negativo. Tutti i
report mantengono `semantic_review_status: PENDING` e
`model_accuracy_status: NOT_VALIDATED`; nessuna percentuale li sblocca.

## Controlli deterministici eseguiti

```bash
node --test experiments/muse/*.test.js
node experiments/muse/benchmark-v1/cli.js verify
node experiments/muse/benchmark-v1/cli.js self-check
```

28/28 test offline su Node 24.19.0: i 16 precedenti e 12 nuovi. La self-check
confronta 36 risposte **copiate dagli attesi**, poi 12 alterazioni deliberate
(omissione di riga/campo, peso alterato, targa inventata, null→0, 0→null,
deduplicazione, conflitto collassato, riga extra, riordino, data inventata e
normalizzazione territoriale). Tutti i controlli deterministici sono superati.
Questi non sono 48 interrogazioni del modello e non misurano la sua accuratezza.
`evidence/self-check.json` conserva gli esiti e i risultati alterati; il log TAP
conserva l'esecuzione dei test. Nessun costo o tempo d'inferenza è simulato come
misura reale. Zero chiamate di rete nella self-check.

## Protocollo per le chiamate effettive — non eseguite

1. Un revisore indipendente controlla **prima delle chiamate** ogni testo e
   atteso, in particolare B030–B033; registra identità, data, esito e motivazione
   nella scheda `review-template.json`. Non firmare per conto del revisore.
   Correzioni richiedono nuova versione congelata. La proposta di soglia storica
   (95% dei campi esatti, nessuna targa/peso inventato) non è un'autorizzazione
   all'uso operativo e non è stata applicata come gate automatico.
2. Conservare prompt e corpus congelati. Eseguire tre passate complete in ordine
   B001…B036: 108 tentativi previsti. Stesso modello, prompt e parametri del
   client (`temperature=0`, `max_tokens=4096`, nessun fallback). Non selezionare
   solo i casi riusciti e non correggere il prompt durante la campagna. I retry
   sono nuove prove da registrare separatamente, senza sovrascrivere la prima.
3. Preparare gli input in una cartella nuova (il comando non chiama il provider):

```bash
node experiments/muse/benchmark-v1/cli.js prepare experiments/muse/results/benchmark-campaign-01
```

Creare prima la directory padre `experiments/muse/results`, se assente.
Il piano contiene 108 coppie input/output e nessuna risposta attesa nei file
inviati al modello. `prepare` rifiuta una directory già esistente.

4. Per ogni job utilizzare la CLI già esistente, con chiave e attivazione locale
   come documentato nel laboratorio; per esempio il primo tentativo:

```bash
node --env-file=experiments/muse/.env experiments/muse/run.js experiments/muse/results/benchmark-campaign-01/inputs/B001.txt experiments/muse/results/benchmark-campaign-01/reports/B001.r1.json
```

Non è stata avviata la campagna in questo aggiornamento. Prima dell'esecuzione
verificare accesso al modello e limite di spesa dell'account: nessun costo futuro
è stimato o approvato dal benchmark. Il client originale non salva report in
caso di errore; per evitare survivorship bias registrare nello stesso percorso
previsto un file errore (senza chiave, header o corpo del provider):

```json
{
  "status": "CALL_FAILED",
  "mode": "LIVE",
  "case_id": "B001",
  "timestamp": "DATA_ORA_ISO_REALE_DEL_TENTATIVO",
  "input_sha256": "HASH_DAL_MANIFEST",
  "prompt_sha256": "HASH_DAL_MANIFEST",
  "error_code": "INVALID_JSON"
}
```

I placeholder non sono evidenze valide e devono essere sostituiti con i dati
del tentativo. `error_code` deve essere il codice effettivo della CLI. Un file
assente resta `NOT_RUN` (oppure evidenza non disponibile), **mai successo**.
Se un tentativo non documentato è avvenuto, ricostruire il registro prima di
pubblicare percentuali complete. I costi dei tentativi falliti restano ignoti
finché non riconciliati esternamente.

5. Confrontare la campagna; il parametro LIVE è obbligatorio e impedisce di
   usare report SIMULATED come prove effettive:

```bash
node experiments/muse/benchmark-v1/cli.js evaluate experiments/muse/results/benchmark-campaign-01/reports LIVE 3
```

Il comando produce JSON con copertura, stato di tutti i 108 tentativi,
confronti atteso/ottenuto, omissioni/alterazioni/invenzioni, costi dichiarati,
tempi, token e risultati distinti per caso. Report invalidi e tentativi falliti
restano nel denominatore dell'esattezza sui tentativi; i mancanti sono esposti
nella copertura. Senza tentativi percentuali e costi sono **null**, non zero.
Il costo totale resta un subtotale se vi sono costi ignoti. I valori di durata
sono disponibili per il calcolo di mediana e quantili; nessuna misura è
presentata come disponibile quando manca. Variabilità calcolabile soltanto con
almeno due run validi con ID distinti; tre run identici non provano stabilità
generale. Gli hash e il modo dichiarato non certificano autonomamente il provider.

6. Revisionare le anomalie e le differenze rispetto alla fonte; annotare i
   risultati per tentativo nella scheda di revisione. Pubblicare le evidenze
   sintetiche insieme al commit del codice, hash, denominatori e fallimenti.
   Conservare separatamente eventuali dati operativi riservati.

## Stato e limiti

Esecuzioni effettive su questo corpus: **0/108**. Riferimenti indipendentemente
revisionati: **0/36**. Accuratezza, variabilità, tempi e costi del modello:
**NON MISURATI**. L'esito positivo dei test riguarda solo codice e dati di
controllo. Nessuna dipendenza, migrazione, API, server o importazione DB è stata
aggiunta; `review_required=true` ed `eligible_for_import=false` restano obbligatori.

Fonti: [PR 15](https://github.com/vincenzocalce/argo-field-gateway-v2/pull/15) e
[relazione sperimentale storica](https://app.notion.com/p/3fb686efdb8e817db2eec490305c46bf).
