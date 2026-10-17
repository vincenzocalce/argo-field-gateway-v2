# Collegamento accesso Zenit nell'app A.R.G.O. — 17 ottobre 2026

## Perimetro verificato

Base sorgenti: PR #16, commit 7b8dfbdffc28af5fa648acc4f7f40cf3d2a82be9.
L'albero completo del repository non contiene .xcodeproj, .xcworkspace, App/Scene, implementazione Keychain o schermata credenziali installata. I soli sorgenti applicativi Swift sono client, modelli e vista telemetria. Non si può affermare che questo componente sia inserito nell'app reale.

Punti di collegamento individuati:
- `ARGOTelemetryClient.TokenProvider`: closure `@Sendable () async throws -> String`; `get(path:)` la richiama a ogni richiesta e costruisce Authorization in memoria. Deve leggere la credenziale A.R.G.O. dal Portachiavi, mai ZENIT_API_KEY (che resta sul gateway).
- `ZenitTelemetryViewModel.recoverAccess()`: attende `recoverAuthentication`; quando riceve true richiama `loadVehicles()`, che ricarica anche il dettaglio selezionato. Questo è già il retry: non aggiungerne un secondo nel chiamante.
- `ZenitTelemetryView`: il pulsante “Ripristina accesso A.R.G.O.” richiama recoverAccess dopo authenticationRequired. La sheet va presentata dal contenitore stabile della schermata.

## Componente aggiunto

`ios/ARGOTelemetry/ZenitAccessIntegration.swift` contiene:
- ARGOCredentialAccess: adapter asincrono della lettura/scrittura dell'app, senza cache.
- ZenitAccessCoordinator: presenta una sola richiesta, attende l'esito, verifica la rilettura dopo la scrittura; restituisce solo Bool. Annullamento/chiusura non causano retry; errori di scrittura o rilettura lasciano aperto il recupero con messaggio fisso.
- ZenitTelemetryAccessView: compone client, model, coordinator e sheet; il provider rilegge lo stesso adapter al tentativo successivo.
- SecureField senza precompilazione: il valore digitato viene rimosso dal campo prima di salvare e alla chiusura. Nessun log o errore arbitrario del Portachiavi viene esposto. Le stringhe Swift in memoria non offrono garanzia di azzeramento crittografico.

Un salvataggio verificato prova la persistenza, non la validità sul gateway: se la credenziale resta errata, il successivo HTTP 401 mantiene il recupero disponibile senza loop automatico. Non viene modificata la configurazione Render.

## Inserimento preciso nel target reale (Mac)

1. Fare un checkpoint del progetto effettivo. Integrare la base #16 prima o insieme a questa proposta. Copiare **tutti e quattro** i file di `ios/ARGOTelemetry/` in Xcode, con Copy items if needed e Target Membership del target A.R.G.O. Verificare Build Phases > Compile Sources: un solo esemplare di ogni file, nessuna vecchia definizione duplicata. iOS minimo 16. Questi tipi sono internal: il percorso supportato è la compilazione dei sorgenti nello stesso target; non `import ARGOTelemetry` dall'app.
2. Individuare il codice Keychain attualmente usato per il token delle API missioni. Conservare gli stessi service, account, access group, entitlement e criterio di accessibilità. Collegare read e write a quell'unico elemento. Write deve attendere SecItemUpdate/Add e lanciare un errore se OSStatus non è errSecSuccess; read deve fallire se il dato è mancante/inaccessibile. Nessun fallback in UserDefaults, file, bundle o token letterale. Non creare un secondo elemento Keychain con identificatori inventati.
3. Nel punto che oggi costruisce ZenitTelemetryView, sostituire la composizione con il contenitore seguente. I nomi `existingKeychain` e `configuredGatewayURL` sono segnaposto espliciti da sostituire con oggetti già presenti nel progetto:

```swift
let credentials = ARGOCredentialAccess(
    read: { try await existingKeychain.readARGOAPIToken() },
    write: { value in try await existingKeychain.saveARGOAPIToken(value) }
)
ZenitTelemetryAccessView(
    baseURL: configuredGatewayURL,
    credentials: credentials
)
```

Usare il gateway HTTPS configurato, senza credenziali nella URL. Le closure dell'adapter sono MainActor; un eventuale archivio actor può essere chiamato con await. La scrittura deve preservare la vecchia credenziale se fallisce; l'adapter deve implementare questa garanzia secondo l'archivio effettivo.
4. Tenere il contenitore nella TabView/Navigation stabile, evitando `.id(UUID())` o ricreazioni basate sui messaggi di errore. Non registrare header, body, draft o error.localizedDescription dell'archivio nei logger/interceptor dell'app.
5. Se l'app possiede già una schermata sicura, si può mantenere quella al posto della sheet fornita: implementare la closure recoverAuthentication con il suo coordinatore, restituire true **solo dopo** scrittura e rilettura sullo stesso elemento Keychain; false su chiusura/annullamento. Non passare il token nel risultato. In questo caso non usare due presenter concorrenti.
6. Compilare il target effettivo con il relativo scheme e signing, installare su iPhone, poi eseguire il protocollo sotto. La compilazione package su macOS non verifica membership, entitlements o navigazione dell'app.

### Semantica annullamento

Chiusura sheet o cancellazione del task risolvono l'attesa false e non lanciano retry. Durante la scrittura la chiusura interattiva è bloccata. Se l'app sparisce o il task viene cancellato quando la scrittura è già in corso, una operazione Keychain già iniziata può comunque terminare: nessuna promessa di rollback; il risultato tardivo non riattiva il retry. Le richieste di recupero concorrenti vengono rifiutate, senza aprire più sheet.

## Test riproducibili

Sul Mac, dalla radice: `swift test --package-path ios`.
La suite esistente usa URLProtocol e credenziali sintetiche. I sette test aggiunti in AccessIntegrationTests verificano salvataggio+rilettura, annullamento senza scrittura, doppia presentazione, errore persistenza, mismatch, input vuoto/completamento obsoleto, cancellazione task e percorso integrato 401 → sheet richiesta → persistenza → retry con token riletto. Il test integrato verifica due richieste HTTP totali e tre letture dell'archivio. Non sono test UI né Keychain reale.

Il workflow Swift già presente esegue automaticamente la suite su PR. Non usare `--parallel` con l'attuale StubProtocol statico condiviso. Non usare i risultati storici della #16 come attestazione della nuova revisione.

## Protocollo iPhone — tutte le prove ancora da eseguire

Usare un ambiente di prova autorizzato con endpoint HTTPS controllabile o sessione URLProtocol in build DEBUG, mai alterare il gateway produttivo per simulare guasti. Prima caricare un riepilogo riconoscibile e annotarne capturedAt/mezzo/giorno. Per timeout e offline partire di nuovo da dati caricati. Non introdurre token nel sorgente: inserirli solo dalla UI protetta. Nessuna registrazione di credenziali o header.

| Caso | Azione | Esito atteso |
| --- | --- | --- |
| HTTP 401 | Inserire una credenziale di prova non valida, aggiornare | Messaggio accesso distinto; riepilogo precedente visibile con avviso non aggiornato; nessun loop |
| Recupero | Premere Ripristina accesso; inserire credenziale valida dell'ambiente prova, Salva e riprova | Una sheet; salvataggio nello stesso elemento Keychain; chiusura dopo rilettura; retry già avviato dal model; dati nuovi e avviso rimosso |
| Credenziale ancora errata | Salvare un valore persistibile ma non autorizzato | Nuovo 401, recupero disponibile; nessun retry infinito |
| Annullamento | Aprire recupero e Annulla/chiudere | Zero scritture e zero retry; riepilogo precedente e messaggio restano |
| Persistenza fallita | Usare adapter DEBUG che lancia errore senza scrivere | Messaggio fisso; sheet aperta; nessun retry; vecchia credenziale preservata |
| Retry manuale | Dopo guasto transitorio ripristinare il servizio e premere Riprova | Nuovo tentativo con token letto dall'archivio; aggiornamento riuscito |
| Timeout | Endpoint prova oltre 30 s, oppure URLProtocol .timedOut; provare anche 504/503 zenit_timeout | Messaggio timeout; nessuna cancellazione dei dati precedenti; retry solo su azione utente |
| Offline | Caricare dati, poi modalità aereo con Wi-Fi spento e aggiornare | Messaggio rete; dati conservati; riabilitare rete e Riprova riuscito |
| Navigazione/cancellazione | Chiudere recupero/uscire dalla schermata; riaprire | Nessuna attesa bloccata o sheet duplicata; verificare conservazione dati nello stesso StateObject. La persistenza dopo riavvio dell'app non è implementata |
| Rate limit | 429 o 503 zenit_rate_limited con Retry-After | Attesa rispettata; nessuna richiesta nel cooldown; dati precedenti visibili |
| Riavvio | Terminare/riaprire app dopo salvataggio | Token riletto dal Keychain effettivo; accesso riuscito; nessun valore nel bundle/log |

Per ogni prova registrare commit componente, commit/build app, scheme/configurazione, Xcode, modello iPhone, iOS, data/ora Europe/Rome, ambiente, risultato PASS/FAIL, numero richieste, capturedAt prima/dopo ed evidenza senza segreti. Conservare screenshot con SecureField vuoto e log già redatti. In caso di failure correggere e ripetere i casi interessati. Il collaudo del 15 ottobre su revisione precedente non valida questi casi.

## Registro controlli di questa consegna

- ESEGUITO: lettura API GitHub PR #16, albero completo e sorgenti Swift della base; assenza progetto Xcode verificata nell'albero.
- ESEGUITO: revisione statica del componente, nessun logger o token reale introdotto; controllo whitespace locale.
- NON ESEGUITO localmente: Swift, Xcode, test Swift (runtime Linux senza Swift), test Node/PostgreSQL (nessuna modifica gateway).
- CI nuova revisione ESEGUITA: 22/22 test Swift PASS (7 nuovi + 15 esistenti), zero failure; macOS 14 / Swift 5.10. Run https://github.com/vincenzocalce/argo-field-gateway-v2/actions/runs/39013299133 . Log del job 117340169278 letti e verificati.
- Regression CI ESEGUITA: 57/57 Node.js e 9/9 PostgreSQL PASS, zero failure e skip; PostgreSQL 16.15 effimero, non TEST operativo. Run https://github.com/vincenzocalce/argo-field-gateway-v2/actions/runs/39013299093 . Log del job 117340168973 letti e verificati.
- Entrambi i run verificano il codice b626df0e10d4dbf8d95caec459d5fc68abbec169 nel merge ref temporaneo 0e26efc39db6f1a4af34de94964f46a7381ff0a5 con base 7b8dfbd. La successiva registrazione delle evidenze modifica soltanto questo documento. Proposta pubblicata nella PR #17, dipendente dalla #16; nessun merge eseguito. Non sono risultati storici riattribuiti.
- NON ESEGUITO: collegamento Keychain reale, compilazione target A.R.G.O., installazione e protocollo iPhone, accesso a PostgreSQL TEST operativo.
- Nessun merge o deploy Render eseguito. La consegna è un componente integrabile con test e istruzioni, non un'integrazione reale completata.
