# VIN-9 — Mapping sperimentale del pacchetto documentale M1

## Scopo e fonti

Questo adattatore confronta gli input documentali VIN-9 v0.1.0 del 10 ottobre
2026 con la forma SQL e API introdotta dalla PR #8. Produce un rapporto locale;
non importa dati, non apre connessioni PostgreSQL e non dichiara completata M1.

Riferimenti:

- [VIN-9 — Prova riproducibile M1](https://linear.app/vincenzocalce/issue/VIN-9/eseguire-prova-riproducibile-m1-con-parse-run-id-e-hash).
- [Pacchetto documentale VIN-9 in Notion](https://app.notion.com/p/3f5686efdb8e814ebd0eed924b6f4d6f).
- [PR #8 — Missioni iOS e PostgreSQL](https://github.com/vincenzocalce/argo-field-gateway-v2/pull/8).
- [Schema SQL al commit esaminato](https://github.com/vincenzocalce/argo-field-gateway-v2/blob/42fb696dfc15c539a0c5c5cca4aef974f0592cc5/src/database.js).
- [Validatore API allo stesso commit](https://github.com/vincenzocalce/argo-field-gateway-v2/blob/42fb696dfc15c539a0c5c5cca4aef974f0592cc5/src/validation.js).

Il confronto è riferito al commit
`42fb696dfc15c539a0c5c5cca4aef974f0592cc5`, non a un generico stato futuro
del ramo. Il pacchetto originale resta esterno al codice dell'adattatore ed è
letto senza modificarlo. `README.txt`, `manifest.json`, `manifest.sha256`,
`evidence.sha256`, `provenance.json` e i record del pacchetto sono le evidenze
locali considerate.

## Perimetri e granularità

Una riga storica è una **registrazione documentale**, non una missione tecnica
iOS. I seguenti segmenti restano separati nell'output.

| Segmento | File originale | Entrate / kg | Uscite / kg | Regola |
|---|---|---:|---:|---|
| `baseline` | `baseline_v0.1.json` | 50 / 52.640 | — | Candidate freeze, senza approvazione |
| `addendum_delta` | `addendum_delta_v0.2.json` | 4 / 5.418 | — | Sole entrate tardive, `REVIEW_REQUIRED` |
| `additive` | `additive_v0.2.json` | 54 / 58.058 | — | Scenario alternativo: baseline più delta |
| `baseline_outflows` | `baseline_outflows.json` | — | 1 / 1.680 | Uscita documentata, separata dalle entrate |
| `excluded_24_A` | `excluded_24_A.json` | 18 / 15.858 | 2 / 8.260 | Vista A esclusa dal totale unico |
| `excluded_24_B` | `excluded_24_B.json` | 10 / 7.220 | — | Vista B concorrente, esclusa dal totale unico |

La baseline riguarda il 21, 22, 23, 25 e 26 settembre 2026; il delta riguarda
il 27 settembre. Il 24 settembre resta nelle viste concorrenti escluse.
Non sommare baseline e additive, né le viste A e B. La ricomparsa delle stesse
evidenze nella baseline e nello scenario additive è lineage atteso: non è
una seconda raccolta fisica e non autorizza una deduplicazione globale.

`non_movement_observations.json` contiene una osservazione del 23 settembre
priva di peso. Va preservata separatamente e non trasformata in movimento
con peso zero. `source_rows_pseudonymized.json` contiene 85 estratti di righe
sorgente: è una derivazione documentale, non un payload nativo ARGO.

## Corrispondenza dei campi

La proiezione verso SQL/API è sparsa: un campo non documentato o incompatibile
non viene riempito con un valore plausibile. La riga integrale sopravvive in
`documentary_record`, comprese le informazioni che non hanno una colonna SQL.

| Campo documentale | Destinazione SQL / API | Corrispondenza e limite |
|---|---|---|
| `record_id`, `source_record_id`, `id_origin` | Provenienza nell'output; nessun mapping automatico a `id` | ID documentali o assegnati dal pacchetto. Non sono UUID missione, nemmeno quando sono stabili. |
| `mission_id` | `argo_missions.id` / `id` | Solo UUID valido accompagnato dalla dichiarazione di fonte nativa descritta sotto. Nel pacchetto originario è assente. Vietata generazione casuale o deterministica. |
| `source_event_id` | Provenienza nell'output | Un identificativo evento non equivale automaticamente a `mission_id`. È assente dagli input originari. |
| `event_date` | Solo data documentale conservata | Non basta per `mission_date TIMESTAMPTZ` / `data`: mancano ora e fuso. Vietato aggiungere mezzanotte o un offset assunto. |
| `event_timestamp` | `mission_date` / `data` | Richiede timestamp operativo documentato con offset esplicito e dichiarazione di fonte nativa. Non usare date modifica/acquisizione o data del rapporto. |
| `subject_alias` | Solo documentazione; nessun mapping automatico ad `operator_alias` / `alias` | `M1-Sxxx` è un pseudonimo locale, non un alias operativo ufficiale. Non promuoverlo ad anagrafica ARGO. |
| `operator_alias` come estensione documentata | `operator_alias` / `alias` | Richiede valore esplicito e dichiarazione di fonte nativa. Non ricavarlo dalla tabella riservata dei pseudonimi. |
| `vehicle_alias` | Solo documentazione; nessun mapping automatico a `vehicle_code` / `mezzo` | `M1-Vxxx` è un pseudonimo locale, non targa o codice mezzo canonico. |
| `vehicle_code` come estensione documentata | `vehicle_code` / `mezzo` | Richiede codice mezzo esplicito e dichiarazione di fonte nativa. Nessun fallback al pseudonimo. |
| `area` | `area` / `area` | Conservare il testo documentato quando disponibile; nessuna inferenza da operatore o mezzo. La sua presenza non valida la missione. |
| `dry_kg`, `wet_kg`, `unclassified_kg`, `total_kg` | Contenuto documentale nel rapporto/payload | Lo schema PR #8 non offre colonne quantitative e il validatore API non verifica kg. Preservare `null`: componente non disponibile non equivale a zero. |
| `eer_code` | Informazione documentale; eventualmente CER dei lotti solo con evidenza specifica | Nel pacchetto è assente. Un eventuale codice a livello riga non costruisce automaticamente tutti i lotti richiesti dall'API. Vietato inferire CER da "secco", "umido" o dal tipo di carico. |
| `produttori` come estensione documentata | Payload API `produttori`; conteggio degli `attivo` per `producer_count` | Solo elenco documentato con dichiarazione di fonte nativa; entrate documentali, produttori e schede iOS sono granularità diverse. Vietato riempire schede per arrivare a 15. |
| `produttori[].id`, `produttori[].lotti[].id` | UUID contenuti nel payload | Devono essere UUID documentati e dichiarati di fonte nativa; nessuna generazione o sostituzione di ID. |
| `produttori[].attivo`, `produttori[].lotti` | Payload API; conteggio produttori attivi | Preservare valori espliciti, senza inventare stato attivo o lotti. Un elenco incompleto resta incompatibile. |
| `produttori[].lotti[].cer` | CER dei lotti API | Solo codice esplicito con dichiarazione di fonte nativa. Non aggiungere CER mancanti per soddisfare il validatore. |
| `data_status`, `source_quality_status`, `quality_basis`, `missing_fields` | Qualità documentale nell'output | Conservare distintamente stato della fonte, stato di governo e problemi rilevati dall'adattatore. Nessuno stato viene promosso a validato. |
| `excluded_from_unique_total`, `inclusion_rule`, `conflict_group` | Esclusioni e conflitti nell'output | Nessuna deduzione di inclusione dai soli kg; conservare regole ed esclusioni del pacchetto. |
| `dataset_version`, `origin_dataset_version`, `package_version` | Perimetro/versione nell'output | Non fondere versioni concorrenti; nello scenario additive conservare l'origine baseline delle righe già presenti. |
| `source_id`, `evidence_ref`, posizione riga/tabella, `source_version` | Provenienza nell'output | Conservare collegamento e localizzazione documentale, anche per record esclusi. |
| `source_last_edited_at`, `retrieved_on` nelle fonti | Metadati documentali nell'output | Non sono timestamp operativi. Non usarli per completare `event_timestamp`. |
| `native_hash`, `parse_run_id`, `weighing_document` | Evidenze mancanti / provenienza | Nel pacchetto originario assenti. Hash del rapporto e ID di esecuzioni offline non li sostituiscono. |
| Nessun campo storico equivalente | `created_at`, `updated_at` | PR #8 usa `DEFAULT NOW()` all'inserimento. L'adattatore non crea questi timestamp e non li interpreta come tempi della missione. |

## Contratto di evidenza per fixture ed estensioni future

Per sperimentare dati completi senza modificare il pacchetto originario si
possono utilizzare fixture sintetiche separate. Gli eventuali campi nativi
aggiunti a una riga richiedono una dichiarazione esplicita:

```json
{
  "mission_id": "11111111-1111-4111-8111-111111111111",
  "field_evidence": {
    "mission_id": {
      "origin": "NATIVE_SOURCE",
      "ref": "synthetic-fixture:mission-id"
    }
  }
}
```

Questa forma si applica a `mission_id`, `event_timestamp`, `operator_alias`,
`vehicle_code` e `produttori`. I produttori e i lotti dichiarano allo stesso
modo l'evidenza dei rispettivi `id`; i produttori la dichiarano anche per
`attivo` e i lotti per `cer`.
Il solo valore valido, senza dichiarazione, non viene promosso a campo nativo.
Il solo indicatore `NATIVE_SOURCE`, senza riferimento non vuoto, non basta.

La dichiarazione è una **asserzione tracciabile dell'input**. L'adattatore non
autentica la fonte, non legge il contenuto del riferimento, non verifica una
firma e non concede approvazioni. Nelle fixture il riferimento sintetico
descrive il test, senza attestare una reale missione. Anche un input completo
di queste dichiarazioni resta sperimentale e non importabile.

## Output e significato degli indicatori

`adaptSegments` conserva i sei segmenti autonomi; la CLI conserva le
osservazioni separatamente.
Per ogni riga mantiene `documentary_record`, provenienza, qualità, esclusioni,
problemi e proiezione sparsa. Gli input non vengono modificati in-place.

- `sql_shape_compatible` verifica la presenza e la forma dei campi necessari
  alla proiezione `argo_missions`, secondo i controlli prudenziali
  dell'adattatore. Non dimostra persistenza o correttezza operativa.
- `api_shape_compatible` verifica anche la forma della missione iOS contro
  `validateMission` della PR #8 e i controlli dell'adattatore. Non dimostra
  riconciliazione dei kg, autenticità delle dichiarazioni o validazione M1.
- `eligible_for_import` è **sempre `false`**. Il rapporto non è un batch di
  inserimento né una autorizzazione all'importazione.

Il modello API richiede almeno 15 schede produttore. Ogni scheda, anche
inattiva, richiede UUID, `attivo` booleano e i tre CER `150106`, `200108`,
`200301`; ciascun lotto richiede UUID. Il pacchetto storico non documenta
questo modello. L'adattatore non colma la distanza costruendo schede, lotti
o identificativi.

La PR #8 conserva l'intero JSON come `payload`. Questa possibilità tecnica
non rende una riga storica equivalente a una missione API. Inoltre non
esistono colonne dedicate a `parse_run_id`, hash nativo, qualità o segmento:
il rapporto conserva queste informazioni senza dichiarare un supporto SQL
che non è implementato.

## Duplicati, conflitti e incompletezza

I conflitti dichiarati dal pacchetto e quelli rilevati dall'adattatore sono
conservati senza risoluzione automatica. R22-M04 (760 kg) e R22-M09 (7.040 kg)
restano entrambi documentati; il conflitto 24-A riga 13 (1.300 kg) / 24-B
B2-006 (2.800 kg) resta irrisolto. Le viste del 24 mantengono le esclusioni
originarie e gli stati sorgente, anche quando lo stato di governo è
`REVIEW_REQUIRED`.

Un UUID dichiarato identico associato a contenuti divergenti deve essere
segnalato come conflitto, non accettato come semplice idempotenza. La PR #8
usa `ON CONFLICT (id) DO NOTHING`: questa istruzione impedisce una seconda
riga SQL, ma non confronta il payload già salvato. L'adattatore opera prima
di qualsiasi persistenza e non usa il mancato inserimento come prova.

I duplicati identici e i record incompleti restano nel rapporto con le loro
motivazioni. Nessun valore `null` viene sostituito implicitamente con zero.
In particolare, l'uscita baseline da 1.680 kg ha solo il totale documentato,
senza componenti dry/wet/unclassified: la somma delle componenti non è
disponibile, non è zero. Non imputare né inventare una ripartizione.

## Integrità e limiti delle evidenze

La CLI legge un pacchetto locale e verifica i checksum dichiarati prima di
adattarlo. Gli hash identificano i byte degli artefatti derivati del pacchetto.
Il manifest dichiara `native_hash: null` e l'assenza dei raw originari. La
verifica dei checksum non autentica i messaggi originari o le pagine Notion.

Gli hash calcolati sull'output dell'adattatore identificano soltanto questo
rapporto derivato. Non diventano hash nativi e non sostituiscono hash degli
input originali, `parse_run_id`, log DB o prove di immutabilità storica.

Il pacchetto contiene due log di verifiche offline, con 34 controlli per
esecuzione, dichiarati superati nelle evidenze originali. Sono verifiche
documentali offline: non testano il parser ARGO, l'importazione sul commit
candidato o l'idempotenza PostgreSQL. Questo documento non anticipa gli
esiti dei nuovi test dell'adattatore; le esecuzioni e i relativi limiti vanno
registrati nel rapporto di evidenze separato.

## Esecuzione locale riproducibile

Dal repository, con Node.js e le dipendenze di test disponibili:

```bash
npm test
node scripts/vin9-adapt.js --input-dir ../inputs/vin9_original --output ../outputs/vin9-adapter-report.json
```

Usare una destinazione esterna alla directory degli input. La CLI
`scripts/vin9-adapt.js` non importa il database o il server e non utilizza
`DATABASE_URL`; non avvia API o connessioni remote. L'output è il rapporto
locale della trasformazione sperimentale.

I test con fixture sintetiche devono coprire identificativi nativi mancanti
o invalidi, dichiarazioni di evidenza assenti, timestamp incompleti, CER
assenti, alias locali non promossi, conflitti, duplicati e record incompleti.
Devono inoltre verificare conservazione degli input, segmenti separati,
assenza di schede/lotti generati e `eligible_for_import: false` anche quando
la forma SQL o API è compatibile.

Restano necessarie le evidenze previste da VIN-9 e dalle dipendenze VIN-6 e
VIN-8: un master approvato, input canonici versionati, identificativi nativi
documentati, registrazione di hash e `parse_run_id`, esecuzione riproducibile
in PostgreSQL TEST, controlli di idempotenza e riconciliazione, oltre alla
decisione del gate. L'adattatore e i test offline non completano questi
requisiti.
