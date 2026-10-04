# argo-field-gateway-v2
Gateway ARGO per ricezione messaggi WhatsApp/Meta, parsing operativo e gestione immagini per test Render.


## Configurazione VERIFY_TOKEN

Prima di distribuire questa patch, impostare `VERIFY_TOKEN` nelle variabili ambiente
persistenti del servizio Render (Environment). Usare lo stesso valore nel campo
Verify token della configurazione webhook Meta. Non usare il vecchio token di test;
non inserire token in Git, nei log o nelle istruzioni condivise.

`VERIFY_TOKEN` è obbligatorio: se manca, è vuoto o contiene solo spazi, il processo
scrive un errore su stderr ed esce con codice 1 prima di aprire la porta HTTP.
Un valore non vuoto viene confrontato esattamente, senza rimuovere spazi.

Per lo sviluppo locale, copiare `.env.example` in `.env` e compilare il valore
privatamente. Il file `.env` è ignorato da Git e non viene caricato automaticamente
da `npm start`. Con Node.js 20.6+ si può avviare esplicitamente con:

```sh
npm install
node --env-file=.env server.js
```

In alternativa, fornire la variabile attraverso l'ambiente del processo e usare
`npm start`. `PORT` resta opzionale, con default 3000. Nessuna nuova dipendenza.

## Test

Con Node.js 18+ e dipendenze installate:

```sh
npm test
```

I test usano token temporanei generati in memoria e processi isolati: configurazione
assente/vuota/spazi, avvio valido, handshake accettato/rifiutato e risposte esistenti
di health check, webhook POST e callback wearable. Non richiedono credenziali reali.
La patch riguarda solo la configurazione del token; l'osservabilità 5V resta separata.
