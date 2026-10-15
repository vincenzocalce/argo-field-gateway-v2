# Telemetria Zenit nell'app A.R.G.O.

Questa revisione aggiunge un proxy server-side in sola lettura. La chiave `ZENIT_API_KEY` resta su Render e non viene mai distribuita nell'app iOS.

## Endpoint A.R.G.O.

- `GET /argo/telemetry/vehicles`
- `GET /argo/telemetry/vehicles/:vehicleId/daily?from=<RFC3339>&to=<RFC3339>`

Entrambi richiedono lo stesso header `Authorization: Bearer <ARGO_API_TOKEN>` già usato dalle API missioni. La finestra massima è 31 giorni. Il riepilogo giornaliero restituisce missioni, chilometri, soste, minuti di sosta e ultima posizione. Le liste Zenit vengono paginate fino a 20 pagine; il superamento del limite produce un errore esplicito invece di dati parziali silenziosi.

## Configurazione Render

Impostare come secret:

- `ZENIT_API_KEY`: chiave Zenit read-only;
- `ARGO_API_TOKEN`: credenziale A.R.G.O. già prevista;
- `ZENIT_API_BASE_URL`: opzionale, normalmente omessa.

Non scrivere valori reali in GitHub, Notion, documenti o codice Swift. Un token statico incorporato nel bundle iOS è estraibile: nel prototipo il `TokenProvider` deve leggere dal Keychain; per produzione serve autenticazione utente con token a breve durata.

## Inserimento nel progetto Xcode

1. Aggiungere al target i tre file in `ios/ARGOTelemetry`.
2. Creare `ARGOTelemetryClient` con URL pubblico HTTPS del gateway e un `TokenProvider` che legga il token dal Keychain.
3. Inserire `ZenitTelemetryView` nella `TabView` o nella navigazione dell'app.
4. Verificare sul dispositivo che il gateway risponda senza esporre la chiave Zenit.

Esempio di composizione, con un provider Keychain da implementare nell'app:

```swift
let client = ARGOTelemetryClient(
    baseURL: URL(string: "https://<gateway-render>/")!,
    tokenProvider: { try await AppKeychain.argoAPIToken() }
)
let screen = ZenitTelemetryView(model: ZenitTelemetryViewModel(client: client))
```

## Limiti

La schermata visualizza dati telemetrici; non attribuisce automaticamente i kg alle soste. Per questa correlazione servono geofence e timestamp operativi A.R.G.O. Il repository non contiene il progetto `.xcodeproj`, quindi i file Swift sono pronti ma non ancora aggiunti al target reale dell'app.
