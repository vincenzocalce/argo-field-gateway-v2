# Validazione preparatoria M00

## Baseline verificata il 09/10/2026

Base indipendente: main `3e53f6f3f1ec7e3ed22014f412bb828c7e31edef`.
Nessuna modifica a server.js, package.json o alle patch gateway.

| Controllo locale | Esito |
| --- | --- |
| Bash 5.2.21, `bash -n` | PASS |
| ShellCheck 0.11.0 | PASS, nessuna segnalazione |
| Python 3.12.14 / pglast 8.5 | PASS: 27 statement SQL e template SELECT dinamico |
| Test con client simulati | PASS: 6 test; zero connessioni reali |

Riproduzione in ambiente Python dedicato:

```bash
python3 -m venv /tmp/argo-m00-validation
/tmp/argo-m00-validation/bin/pip install pglast==8.5 shellcheck-py==0.11.0.1
bash -n scripts/m00/run_m00.sh
/tmp/argo-m00-validation/bin/shellcheck scripts/m00/run_m00.sh
/tmp/argo-m00-validation/bin/python scripts/m00/validate_sql.py
/tmp/argo-m00-validation/bin/python scripts/m00/test_runner.py
```

I test coprono: autorizzazione assente prima di ogni connessione; errore identità;
rifiuto della conferma; percorso nominale simulato; errore dump; errore inventario.
Verificano directory 0700, checksum ricalcolati, gate aperto e ordine dei client.
Non convalidano libpq, connessioni TLS, privilegi, cataloghi o dati di PostgreSQL.
Il parsing pglast elimina solo i metacomandi psql noti, sostituisce `\gexec` con
terminatore e analizza separatamente il template SQL generato. Non esegue SQL.

`psql` e `pg_dump` reali non sono installati nell'ambiente di questa verifica.
Dipendenze runtime identificate e controllate dal runner; compatibilità con le
istanze DEV/TEST **NON VERIFICATA**. Nessun database reale né locale interrogato.
Nessuna migrazione, restore, deploy, merge o autorizzazione PROD.

**M00 APERTO; acquisizione reale NON ESEGUITA; evidenze DEV/TEST NON ACQUISITE.**
I PASS sopra riguardano esclusivamente validazione statica e simulazione del runner.

## Estensione membership — 15/10/2026

Base della patch: PR #6, commit `c6f0b843ca4049ea020d75adb395ba98130c390e`.
L'identità SQL con la fonte Notion è un risultato storico della baseline: dopo
questa estensione `inventory.sql` differisce intenzionalmente nella query membership.
Il runner operativo, i suoi requisiti di autorizzazione e il gate restano invariati.

La query acquisisce sei colonne su entrambe le famiglie di server, estraendo
le due nuove opzioni dal JSON della riga del catalogo. PG12–15 non deve risolvere
nomi di colonne inesistenti e produce SQL NULL; PG16+ deve conservare booleani
veri e falsi, comprese combinazioni miste. Il CSV conserva anche l'header vuoto.

Le prove sintetiche del runner verificano il trasporto dei valori nel dossier e
la copertura completa di `checksums.json` (nomi unici, byte e SHA-256 ricalcolati).
Non valutano l'esecuzione della query PostgreSQL: per questo è separata la prova
d'integrazione CI con server effimeri, da distinguere dalle acquisizioni operative.

| Verifica locale della patch (15/10/2026) | Esito |
| --- | --- |
| Bash 5.2.21, `bash -n`; ShellCheck 0.11.0 | PASS |
| Python 3.12.14 / pglast 8.5 | PASS: 27 statement e template dinamico |
| Runner con client simulati | PASS: 9/9 (6 casi originali + 3 casi membership) |
| Sintassi Python, diff senza errori whitespace | PASS |
| Integrazione server PG12,15,16,17 in CI | Predisposta; consultare il run del commit, non il risultato della baseline |

Comandi locali invariati: vedere la sezione baseline sopra. Il test di integrazione
è invece richiamato esclusivamente dal workflow `m00-memberships.yml` con servizio
effimero esplicito. Controlla la query reale, le quattro combinazioni, NULL legacy,
header vuoto, dossier completo e versione; la matrice non identifica la major TEST.

Nessuna prova locale o CI autorizza accessi alle risorse DEV/TEST. Gli eventuali
dossier CI sono fixture riproducibili e non inventari delle risorse operative.
La versione TEST effettiva resta da acquisire con configurazione e autorizzazione
adeguate. Nessuna migrazione viene avviata dai test o da questa patch.

**M00 APERTO; DEV/TEST operativi NON ISPEZIONATI; migrazione NON ESEGUITA.**
