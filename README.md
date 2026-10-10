# argo-field-gateway-v2

Gateway ARGO per Meta/WhatsApp, wearable e missioni dell'app iOS.

## API missioni iOS

- `POST /argo/missions`: valida e salva una missione completa.
- `GET /argo/missions/:id`: legge una missione salvata.
- L'UUID della missione è la chiave primaria: un secondo invio dello stesso UUID
  risponde `already_exists` senza creare duplicati.
- Ogni missione deve contenere almeno 15 produttori e, per ciascun produttore,
  i CER `150106`, `200301` e `200108`.

Le API richiedono `Authorization: Bearer <ARGO_API_TOKEN>` oppure
`X-ARGO-API-Key: <ARGO_API_TOKEN>`.

## Variabili Render

- `DATABASE_URL`: URL interno del PostgreSQL Render nella stessa regione.
- `ARGO_API_TOKEN`: credenziale lunga e casuale usata dall'app iOS.
- `VERIFY_TOKEN`: token di verifica del webhook Meta.

Se `DATABASE_URL` non è configurata, il gateway continua a ricevere gli altri
eventi ma le API missioni rispondono `503`; questo evita di interrompere il
servizio esistente durante la migrazione.

## Test

```bash
npm install
npm test
```

I test coprono autenticazione, 15 produttori, tre CER, salvataggio, lettura e
idempotenza del secondo invio.
