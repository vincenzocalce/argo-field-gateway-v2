# Client Zenit: recupero errori — 15 ottobre 2026

Base: PR #14, merge 314760aed0fca3fbc7b3e26aad46ae4558f5f320 sul ramo integration/gateway-ios-security-5v-aasa.

## Comportamento

- HTTP 401 o lettura credenziale fallita: istruzioni di ripristino accesso A.R.G.O.; nessun tentativo automatico ripetuto.
- Timeout URLSession, HTTP 408/504, oppure 503 con codice allowlisted zenit_timeout: messaggio timeout.
- Connessione assente/interrotta: istruzioni Wi-Fi/rete mobile.
- HTTP 5xx: indisponibilità temporanea.
- HTTP 429 e 503/zenit_rate_limited: Retry-After in secondi o data HTTP; fallback 30 secondi. Il client blocca nuove richieste fino alla scadenza.
- Risposte non valide e altri errori: messaggi fissi, senza corpo server, URL, token o localizedDescription arbitrari.
- Cancellazione: nessun allarme. Nessun retry automatico; Riprova è manuale. I dati precedenti restano visibili con avviso quando l'aggiornamento fallisce.

## Collegamento al progetto reale

Il repository non contiene il progetto Xcode installato. Il costruttore del view model accetta recoverAuthentication, closure MainActor asincrona che apre la schermata di accesso sicura dell'app e restituisce true solo dopo il salvataggio nel Portachiavi. Il client rilegge TokenProvider ad ogni nuova richiesta. La closure non deve restituire il token e non deve registrarlo nei log.

```swift
let model = ZenitTelemetryViewModel(client: client, recoverAuthentication: {
    await appAccessCoordinator.presentSecureCredentialSettings()
})
```

appAccessCoordinator è un punto di integrazione dell'app, non un componente già presente nel repository. Senza closure il pulsante fornisce le istruzioni per aprire le impostazioni e riprovare; non modifica né cancella il Portachiavi. Non può correggere autonomamente un token errato sul servizio Render.

## Verifiche riproducibili e stato

- npm ci --ignore-scripts --no-audit --no-fund: eseguito con successo.
- npm test: eseguito, 57/57 PASS, zero failure e skip; suite preesistenti conservate.
- git diff --check: eseguito con successo.
- swift test --package-path ios: suite aggiunta con URLProtocol, nessun servizio reale o credenziale reale. Esecuzione demandata al workflow macOS Swift telemetry simulated responses: il runtime locale non dispone di Swift. Esito da verificare nel run CI.
- Compilazione effettivo progetto Xcode: NON ESEGUITA.
- Collaudo nuova revisione su iPhone: NON ESEGUITO.
- Nessun deploy Render o merge richiesto/eseguito.

La suite Swift verifica 401, rilettura provider dopo 401, token vuoto, timeout, offline, indisponibilità, codici gateway 503, rate limit in entrambe le forme con cooldown, risposta non valida, cancellazione e fallback sicuro.

## Collaudo ancora necessario

Nel progetto reale collegare il recupero al Portachiavi, compilare e provare: token disallineato → messaggio 401 → apertura impostazioni → salvataggio → Riprova riuscito; rete assente e timeout; servizio indisponibile; rate limit con attesa; ritorno alla navigazione senza perdere i dati precedenti. Annotare build/commit, modello iPhone, iOS, orario e risultato senza credenziali. Il collaudo del 15 ottobre antecedente a questa patch non valida la nuova gestione degli errori.
