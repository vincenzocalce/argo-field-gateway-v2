# ARGO M00 — acquisizione PostgreSQL in sola lettura

Gate **M00 APERTO**. DEV/TEST **NON ISPEZIONATI**. Questo contributo rende
versionabile il preflight, non esegue né autorizza migrazioni e non chiude VIN-8.

## Provenienza e differenze

- [Preflight Notion v0.1, 04/10/2026](https://app.notion.com/p/3ef686efdb8e818292edcf6cff8e23e6).
- [Modello v1.1, proposta progettuale](https://app.notion.com/p/3ef686efdb8e819cb64fda95976b093e).
- [VIN-8](https://linear.app/vincenzocalce/issue/VIN-8/ispezionare-postgresql-test-ed-eseguire-la-migrazione).

`inventory.sql` deriva dal blocco cataloghi originale; la patch del 15/10/2026
estende l'inventario delle membership per PostgreSQL 16+ mantenendo PG12–15.
Il runner è derivato dal blocco Bash: aggiunge diagnostica, percorsi indipendenti
dalla directory corrente, autorizzazione preventiva, configurazione esplicita,
permessi 0600, copia degli script e finalizzazione con hash anche sugli errori.
Nessuna dipendenza dal gateway, da npm o dalle altre PR.

## Dipendenze e controllo offline

Su terminale POSIX: Bash >=4.2, Python >=3.8, `mktemp`, `date`, `cp`,
client `psql` e `pg_dump` >=12. Preferire entrambi della stessa major del server;
pg_dump non supporta server di major superiore al client. Su macOS installare
un Bash recente: quello di sistema 3.2 non basta. Nessun pacchetto viene installato
dal runner. Per i controlli statici servono anche ShellCheck e pglast (vedere VALIDATION.md).

```bash
bash -n scripts/m00/run_m00.sh
shellcheck scripts/m00/run_m00.sh
python3 scripts/m00/validate_sql.py
python3 scripts/m00/test_runner.py
```

Questi controlli non aprono connessioni PostgreSQL. Parsing SQL non verifica
la disponibilità dei cataloghi, i privilegi, la versione effettiva o i risultati.
I test usano eseguibili simulati, non un database.

## Preparazione riservata (prima di qualsiasi connessione)

1. Identificare dal provider le risorse DEV e TEST separate e le connessioni
   dirette: registrare ID risorsa, database, ruolo autorizzato, esecutore,
   revisore e finestra senza DDL concorrente in un riferimento riservato.
   Non dedurre l'ambiente dal solo nome del servizio.
2. Verificare l'autorizzazione di lettura per ciascuna risorsa, incluse le righe
   del registro migrazioni. Non creare ruoli né eseguire GRANT.
3. Copiare `pg_service.conf.example` fuori dal repository; sostituire i placeholder
   con i valori verificati e la CA del provider. Conservare TLS `verify-full`.
   Il service file deve contenere soltanto parametri di connessione, senza password
   o override di `options`; esaminarlo localmente prima dell'uso.
4. Creare fuori dal repository un passfile libpq con una riga specifica per risorsa:
   `host:port:database:user:password`. Evitare wildcard; fare escape di `:` e `\`
   secondo il formato libpq. Inserire i segreti tramite editor locale sicuro,
   mai nella cronologia shell, negli argomenti o nei ticket. Non versionare il file.
5. Impostare entrambi i file a 0600, di proprietà dell'esecutore, e creare una
   directory evidenze privata 0700 fuori dal repository. Non usare `bash -x`.
   Rimuovere variabili PGHOST/PGHOSTADDR/PGPORT/PGDATABASE/PGUSER/PGPASSWORD
   ereditate; usare una sessione pulita con soli parametri libpq riesaminati.

## Esecuzione autorizzata DEV e poi TEST

Comandi da usare **solo dopo** le verifiche sopra, con percorsi locali reali:

```bash
export PGSERVICEFILE=/absolute/private/pg_service.conf
export PGPASSFILE=/absolute/private/pgpass
export M00_OUTPUT_ROOT=/absolute/private/evidence
ARGO_ENV=DEV PGSERVICE=argo_dev M00_AUTHORIZED=DEV bash scripts/m00/run_m00.sh
# Riesaminare separatamente risorsa, autorizzazione e configurazione TEST.
ARGO_ENV=TEST PGSERVICE=argo_test M00_AUTHORIZED=TEST bash scripts/m00/run_m00.sh
```

`M00_AUTHORIZED` è una dichiarazione esplicita dell'esecutore, non una verifica
automatica dei permessi o un'autorizzazione derivante da questa PR.
Prima della prima query il runner richiede tale dichiarazione e i file protetti.
Dopo la query d'identità, aprire localmente `connection_check.txt` nel dossier
indicato da M00_OUTPUT_ROOT (directory appena creata), verificare risorsa,
database, ruolo, indirizzo/porta e versioni in `client_versions.txt`.
Scrivere `CONFERMATO` soltanto se corrispondono alla risorsa autorizzata.
EOF/rifiuto ferma il run; non esiste bypass non interattivo.

L'inventario imposta una transazione REPEATABLE READ READ ONLY e timeout;
il runner imposta default_transaction_read_only anche per le altre sessioni.
Il ruolo deve comunque essere limitato: questa impostazione non sostituisce
l'autorizzazione e la revisione delle definizioni SQL esistenti.

## Evidenze e limiti

Ogni esecuzione crea un dossier nuovo 0700 con script, versioni client,
identità, dump schema-only (owner e ACL conservati), CSV, stdout/stderr,
exit code, timestamp UTC e `checksums.json` SHA-256. I file sono privati.
Un errore iniziale lascia solo le evidenze disponibili; un file assente o parziale
non vale zero o assenza osservata. Leggere stderr anche con exit code 0.
Hash di un file parziale prova soltanto quei byte. Interruzioni non gestibili
(SIGKILL, disco pieno) possono impedire la finalizzazione: dossier incompleto.

Il dump e il catalogo usano snapshot diversi: congelare DDL durante la finestra.
Le stime non sono conteggi esatti. I conteggi esatti sono una successiva attività
autorizzata e non sono lanciati qui. Il dump non è un backup dati né una prova restore.
Le membership includono ora `inherit_option` e `set_option` (vedere sotto).
Il registro migrazioni viene letto solo per oggetti fisici r/p, non viste;
RLS/permessi possono limitare la visibilità, da esplicitare nel riesame.

Schema, routine e log possono contenere dati sensibili: non committare output,
service file o passfile. Conservare gli originali in area riservata durevole;
pubblicare solo riferimenti minimizzati e hash. Copie oscurate hanno hash propri.

Per chiudere M00 occorrono dossier DEV e TEST reali, revisione di copertura,
confronto con SQL originali P0/registro migrazioni, matrice fisico→modello v1.1,
limiti risolti e decisione tecnica datata. `runner_exit_code=0` non chiude il gate.
Acquisition ID (nome dossier) non è un `parse_run_id`.
Migrazione v1.1, restore, P0, M1 e PROD restano fuori dal perimetro.

## Membership: compatibilità e lettura del dossier

`memberships.csv` mantiene le quattro colonne precedenti e aggiunge, in ordine,
`inherit_option` e `set_option`. Il catalogo viene convertito come riga intera con
`to_jsonb(m)`: l'estrazione delle due chiavi non riferisce colonne inesistenti.
Non si usa un `CASE` che contenga riferimenti diretti a colonne assenti.

| Server acquisito in `identity.csv` | Valori delle due nuove colonne |
| --- | --- |
| PostgreSQL 12–15 | SQL `NULL`: chiavi non disponibili nel catalogo |
| PostgreSQL 16+ | Booleani reali del catalogo: `t` oppure `f` |

Nel CSV psql il `NULL` è un campo vuoto non quotato; **non significa `false`**.
Non ricostruire le opzioni per PG12–15 dai valori predefiniti delle versioni nuove:
le regole storiche di ereditarietà e `SET ROLE` vanno riesaminate separatamente.
Usare sempre `identity.csv` per conoscere la versione acquisita, mai la versione
dei client, della CI o di un altro ambiente. Anche un risultato senza membership
conserva l'intestazione delle sei colonne. Ordinamento per ruolo, membro, grantor.

Il dossier conserva il CSV originale, `identity.csv`, la copia dello script
effettivamente eseguito e i relativi SHA-256 in `checksums.json`. I test controllano
sia i valori sia la presenza e l'integrità dei file nel manifest. L'acquisizione
delle due opzioni completa questa lacuna del catalogo, non costituisce un'analisi
dei privilegi effettivi e non chiude il gate M00.

Riferimenti PostgreSQL ufficiali:
- [Catalogo PG15](https://www.postgresql.org/docs/15/catalog-pg-auth-members.html).
- [Catalogo PG16](https://www.postgresql.org/docs/16/catalog-pg-auth-members.html).
- [Conversione JSON e chiavi assenti](https://www.postgresql.org/docs/16/functions-json.html).

## Test PostgreSQL su risorse CI effimere

Il workflow `.github/workflows/m00-memberships.yml` esegue la matrice PG12,
PG15, PG16 e PG17 su servizi nuovi, isolati e distrutti a fine job. Installa client
PG17 e validatori con versioni fissate; non legge configurazioni o segreti DEV/TEST.
Il test `test_postgres_integration.py` richiede opt-in `--isolated-ci`, marker CI,
porta loopback assegnata da Actions, identità sintetica e major attesa. Non parte
con la scoperta unittest e non accetta host o credenziali operative.

Il setup crea soltanto fixture nel servizio effimero: quattro combinazioni delle
opzioni, ruoli e tabella sintetici. Esegue quindi il runner reale in sola lettura,
conferma header/valori nel dossier, versione acquisita, sorgenti copiati, exit code
e manifest con byte/SHA-256. Per PG12–15 i due nuovi campi devono restare NULL;
per PG16+ tutte le combinazioni `t/t`, `t/f`, `f/t`, `f/f` devono essere preservate.
Verifica anche l'intestazione di un risultato vuoto della SELECT effettiva.

Il job conserva per sette giorni gli artefatti **sintetici CI** per ispezione,
anche sui fallimenti quando disponibili. Non sono evidenze operative DEV/TEST;
versioni effettive e risultati vanno letti dal run CI del commit in esame.
Esiti verificati e risultati storici sono distinti in `VALIDATION.md`.
