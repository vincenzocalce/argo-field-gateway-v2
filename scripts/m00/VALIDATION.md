# Validazione preparatoria — 09/10/2026

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
