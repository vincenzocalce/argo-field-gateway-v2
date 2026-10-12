# VIN-9 — Esiti sperimentali del 12/10/2026

Confronto con PR #8 al commit `42fb696dfc15c539a0c5c5cca4aef974f0592cc5`.
Pacchetto originario: VIN-9 v0.1.0 del 10/10/2026.

## Verifiche locali eseguite

- `npm test`: 119 controlli/test Node superati, zero failure, skip o todo.
  Il totale include i subtest e le suite già presenti della PR #8; 79 test
  riguardano il mapping e 29 la CLI. Le prove del database preesistenti usano
  un simulatore, senza connessioni PostgreSQL.
- `node --check src/vin9-adapter.js` e `node --check scripts/vin9-adapt.js`:
  superati; `git diff --cached --check` superato.
- Due esecuzioni reali della CLI sul pacchetto recuperato: rapporti identici
  byte per byte, hash SHA-256
  `c337ed5f34397e00eb4a606748d1b2ce5cd2d3ceb1d98c0becb617bbbbe3d143`.
- Checksum del manifest, dei payload e delle evidenze verificati. Tutti i
  membri estratti sono stati confrontati con lo ZIP originale: invariati.
  SHA-256 ZIP originale:
  `96fc9dd70f66a850ca98b67bb9d4b1f7451287d1259d7e12c916b11a20cf641b`.

Ambiente locale: Node 24.19.0, npm 11.9.0; dipendenze presenti
Express 4.22.3, pg 8.23.1, Supertest 7.3.1. Installazione offline dal cache
con script dei pacchetti disattivati. Nessuna nuova dipendenza introdotta.
La PR #8 non contiene un lockfile: le versioni sono evidenza di questa
esecuzione locale, non una garanzia di risoluzione identica in altri ambienti.

## Risultato sul pacchetto storico

| Segmento | Righe documentali | Entrate / kg | Uscite / kg | Forma SQL / API compatibile | Importabili |
|---|---:|---:|---:|---:|---:|
| baseline | 50 | 50 / 52.640 | — | 0 / 0 | 0 |
| addendum_delta | 4 | 4 / 5.418 | — | 0 / 0 | 0 |
| additive | 54 | 54 / 58.058 | — | 0 / 0 | 0 |
| baseline_outflows | 1 | — | 1 / 1.680 | 0 / 0 | 0 |
| excluded_24_A | 20 | 18 / 15.858 | 2 / 8.260 | 0 / 0 | 0 |
| excluded_24_B | 10 | 10 / 7.220 | — | 0 / 0 | 0 |

Le 139 righe nei file sono copie documentali per scenario, non 139 missioni
distinte. Sono conservati 54 riusi di evidenza tra i perimetri. Nessun totale
globale è calcolato. Tutte le righe hanno allegato il corrispondente estratto
sorgente e i metadati documentali; una osservazione senza peso resta separata.

Tutti i campi mission_id, timestamp operativo, CER/EER e struttura produttori
restano mancanti negli input storici. I pseudonimi locali non sono promossi a
codici ufficiali. I conflitti e gli stati originari sono preservati.
Gli input con `source_record_id` nullo conservano l'ID documentale assegnato:
non ricevono un identificativo nativo sostitutivo.

I test sintetici comprendono anche una struttura completa compatibile con
la forma SQL/API. Persino tale fixture mantiene `eligible_for_import=false`.
Sono provati UUID mancanti/invalidi/duplicati, evidenze assenti, timestamp
senza ora/fuso o impossibili, CER e lotti incompleti, pesi incoerenti,
produttori duplicati, deriva tra scenari, esclusioni, `null` quantitativi,
non mutazione, determinismo, checksum errati e rifiuto di sovrascritture.

## Limiti e passaggio successivo

Il rapporto completo e il log dei test accompagnano le evidenze collegate a
[VIN-9](https://linear.app/vincenzocalce/issue/VIN-9/eseguire-prova-riproducibile-m1-con-parse-run-id-e-hash).
Il mapping dettagliato è in [VIN9_MAPPING.md](VIN9_MAPPING.md).

Nessun import DB, deploy, migrazione, test PostgreSQL TEST o prova di
idempotenza DB eseguito. Nessun hash nativo o parse_run_id inventato. Nessuna
approvazione del master attribuita. CI GitHub non eseguita per questa patch.
La riproducibilità M1 resta **NON DIMOSTRATA** e VIN-9 conserva i propri criteri
di accettazione e le dipendenze VIN-6/VIN-8.

La proposta è separata dalla PR #8 e ne usa il ramo come base. Non modifica
schema, API, gateway o dataset: aggiunge adattatore, CLI, test e documentazione.
Il confronto deve essere rivalutato se lo schema della PR #8 cambia.
