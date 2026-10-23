# VIN-7 — correzione AASA condizionata all'identità firmata

Ricognizione del **23 ottobre 2026**. Gate **OPEN — REVIEW_REQUIRED**.
Questa proposta prepara la correzione; non pubblica file, non modifica il
contratto, non sceglie un nuovo destinatario e non dimostra il collaudo iPhone.

## Risultato verificato e difformità

Verificatore riutilizzato dalla PR #18, head
`075e3d0745eb8fe3b948ba919aac1d00301e2603`; contratto della PR #13, head
`314760aed0fca3fbc7b3e26aad46ae4558f5f320`. Entrambe ancora aperte e non unite
alla ricognizione; main `3e53f6f3f1ec7e3ed22014f412bb828c7e31edef`.

| Richiesta GET del 23/10 | Ora UTC (Europe/Rome +02:00) | Osservazione |
| --- | --- | --- |
| AASA su `www.seagroup.info` | 21:36:07 (23:36:07) | 200, `application/json`, nessun Location, 167 byte, `paths:["*"]` |
| AASA su `seagroup.info` | 21:36:12 (23:36:12) | 301, `text/html`, Location HTTPS verso AASA www |
| Callback esatto su www | 21:36:56 (23:36:56) | 301 verso `http://www.seagroup.info/argo/wearable/callback/` |

HTTPS con trust di sistema; redirect non seguiti. Sono osservazioni da questa
rete, non prove Apple/CDN/iPhone. L'AASA www ha SHA-256
`de3f317296bc040a58bc4b42710ce6a466d0f2acbe66dc0a89973d9db8e0f45b`, identico
al corpo originale conservato il 18/10. Il verificatore restituisce
**INCOMPATIBLE** per la wildcard. Il JSON repository restituisce **INCOMPLETE**:
è coerente con il contratto ma non prova pubblicazione o identità firmata.

Il redirect HTTP del callback è un secondo problema, distinto dal JSON AASA:
aggiunge uno slash non autorizzato e abbassa lo schema a HTTP. Il suo trattamento
va corretto sul server che gestisce www, mantenendo l'URL esatto HTTPS e un
fallback web appropriato. Non attribuire il problema al gateway senza verificare
la configurazione effettiva dell'hosting. Il GET informativo e l'ACK POST del
gateway non implementano l'handler iOS né provano acquisizione wearable.

## Configurazione da mantenere distinta

| Campo | Contratto documentato | Prova ancora necessaria |
| --- | --- | --- |
| URL callback | `https://www.seagroup.info/argo/wearable/callback` | URL effettivamente salvato in Meta e riconosciuto dall'handler |
| Host | `www.seagroup.info` | Entitlement firmato dello stesso host; www è il riferimento del piano esistente |
| Percorso | `/argo/wearable/callback` | Matcher Apple e prove positive/negative sul dispositivo |
| Entitlement | `applinks:www.seagroup.info` | `com.apple.developer.associated-domains` nella firma, senza modalità developer |
| Bundle documentato | `it.vincenzocalce.argo.wearable` | `CFBundleIdentifier` della .app effettivamente esportata/installata |
| AppID AASA documentato | `N6JGN24QMU.it.vincenzocalce.argo.wearable` | `application-identifier` estratto dalla firma |
| Team documentato | `N6JGN24QMU` | `com.apple.developer.team-identifier`, campo distinto dal prefix |

L'AppID AASA deve coincidere con l'`application-identifier` firmato: Application
Identifier Prefix + bundle. Non ricostruirlo automaticamente dal Team ID.
Il documento AASA non contiene il dominio; il dominio è determinato da hosting,
URL del link e Associated Domains. Apex, www e Render non sono intercambiabili.
Non aggiungere apex, `*.seagroup.info` o wildcard nei percorsi per risolvere una
mancata apertura. Query e frammenti non richiedono `callback*`.

Sono stati ispezionati tre archivi sorgente iOS già disponibili. Tutti riportano
nei build settings `DEVELOPMENT_TEAM=N6JGN24QML` (L finale) e
`PRODUCT_BUNDLE_IDENTIFIER=com.vincenzocalce.ARGO`. Due contengono il file
entitlements, che dichiara solo HealthKit e non Associated Domains; negli Swift
di questi due pacchetti non sono stati trovati `onOpenURL`,
`onContinueUserActivity` o `webpageURL`. Il terzo è il solo progetto Xcode.
Nessuno contiene .app, .ipa, archivio firmato, provisioning o manifest codesign.
Sono pacchetti storici del 13–14/10: questi riscontri **non descrivono
necessariamente il progetto attuale sul Mac o la build oggi installata**.
La differenza L/U non è trattata come refuso. Nessun archivio privato è incluso
in questa PR.

## Procedura applicabile dopo l'accertamento

### 1. Identificare il ricevitore e acquisire la build sul Mac

Confermare se riceve il target wearable documentato oppure l'app ARGO corrente.
Usare la .app esportata dalla stessa build da installare; per una .ipa estrarre
localmente `Payload/`. Non usare il solo xcodeproj o un archivio antecedente a
una successiva rifirma. Eseguire dalla radice del repository:

```sh
python3 tools/universal_links/collect_signed_build.py '/percorso/ARGO.app' \
  --source-commit '<SHA sorgente completo della build>' \
  --out universal-links-results/signed-build.json
python3 tools/universal_links/verify.py \
  --signed-build universal-links-results/signed-build.json \
  --out universal-links-results/build-comparison
```

Il collector esegue codesign/security e conserva solo campi selezionati:
bundle, application-identifier, Team, Associated Domains, versione/build,
CDHash, hash eseguibile e confronto con il provisioning. Il commit è dichiarato
dall'operatore, non dedotto dal binario. Verificare la corrispondenza con la build
installata. Non pubblicare profili integrali, UDID, certificati o credenziali.

### 2. Preparare il candidato senza scegliere arbitrariamente un AppID

**Caso A: destinatario e firma corrispondono al contratto documentato.** Il file
corretto è già `.well-known/apple-app-site-association` nel repository:

```json
{
  "applinks": {
    "details": [{
      "appIDs": ["N6JGN24QMU.it.vincenzocalce.argo.wearable"],
      "components": [{"/": "/argo/wearable/callback"}]
    }]
  }
}
```

Lo strumento seguente riusa `verify.py`, richiede conferma esplicita del
ricevitore e blocca la preparazione se firma dichiarata, identità, entitlement,
tracciabilità o provisioning mancano o non corrispondono:

```sh
python3 tools/universal_links/prepare_correction.py \
  --signed-build universal-links-results/signed-build.json \
  --confirmed-application-identifier N6JGN24QMU.it.vincenzocalce.argo.wearable \
  --out universal-links-results/candidate
```

Produce una copia byte-per-byte dell'AASA repository, `report.json` e
`report.md` in una directory nuova. Non accede alla rete, non sovrascrive output,
non cambia il contratto e non distribuisce nulla. La conferma e il manifest
importato sono evidenze da revisionare: lo script non autentica autonomamente
la firma e non dimostra installazione o successo del gate. Anche exit 0 lascia
`INCOMPLETE / OPEN — REVIEW_REQUIRED`.

Il provisioning assente blocca questa preparazione automatica conservativa:
se la distribuzione legittimamente non lo include, documentare e revisionare
quel caso; non fabbricare un profilo o un manifest per aggirare il controllo.

**Caso B: il destinatario verificato è un'altra app, incluso ARGO corrente.**
Non usare il file del caso A. Preparare una successiva modifica coordinata di
`contract.json`, AASA, `test/aasa.test.js`, `test/gateway-integration.test.js` e
documentazione, usando l'application-identifier esatto estratto dalla firma.
Conservare il callback esatto e www, salvo una decisione esplicita sui requisiti.
Nel progetto iOS corretto configurare la capability Associated Domains e
l'handler; rifirmare e riestrarre gli entitlements prima di ricontrollare.
`N6JGN24QML.com.vincenzocalce.ARGO` non è qui assunto come AppID firmato.

### 3. Pubblicazione successiva, con autorizzazione distinta

Dopo revisione dell'identità e del candidato, l'amministratore dell'hosting
potrà pubblicare il file senza estensione nel percorso
`/.well-known/apple-app-site-association` del virtual host www. Prima della
sostituzione rileggere il documento pubblico e confrontare tutte le sezioni:
se nel frattempo sono state aggiunte altre app, webcredentials o servizi,
fermare la sostituzione dell'intero file e preservare quei requisiti con una
modifica mirata. Salvare versione precedente, hash e riferimento di deploy.

Requisiti hosting: HTTPS pubblico, 200 diretto, `Content-Type: application/json`,
nessun Location, login o riscrittura a slash/.json; accesso consentito alla
CDN Apple. Correggere separatamente il redirect del callback preservando HTTPS
e percorso esatto. Nessuna configurazione specifica Apache/Nginx è inventata:
il prodotto e le regole attive dell'hosting devono essere ispezionati dal gestore.
L'apex non diventa un host associato per effetto del redirect.

### 4. Rileggere origine, matcher Apple e dispositivo

```sh
python3 tools/universal_links/verify.py --fetch \
  --signed-build universal-links-results/signed-build.json \
  --out universal-links-results/after-authorized-publication
sudo swcutil dl -d www.seagroup.info
sudo swcutil verify -d www.seagroup.info \
  -j universal-links-results/candidate/apple-app-site-association \
  -u 'https://www.seagroup.info/argo/wearable/callback?source=VIN-7'
```

Ripetere `swcutil verify` sul corpo pubblico appena acquisito. Verificare il
percorso ordinario CDN Apple, le date di controllo/cache e l'app installata;
`?mode=developer` resta solo diagnostica separata. Sull'iPhone fisico usare
Note, pressione prolungata e apertura nell'app, sia terminata sia già avviata.
Registrare consegna dell'URL all'handler e risultato funzionale con parametri
sintetici. Digitare l'URL nella barra Safari non costituisce questa prova.

| Caso da provare su matcher e iPhone | Atteso contrattuale, non risultato già ottenuto |
| --- | --- |
| Callback esatto; stesso path con query e frammento | Associazione e gestione corretta nell'app ricevente |
| Slash finale, `/extra`, suffisso `Extra`, maiuscole, percorso estraneo | Nessuna associazione wearable |
| App non installata | Fallback web HTTPS definito, senza downgrade o loop |

Conservare data UTC, host, hash AASA pubblico, riferimento di pubblicazione,
build/versione, CDHash, commit, versione iOS/macOS, prove a freddo/caldo e
negativi. La chiusura VIN-7 richiede revisione esplicita di queste evidenze.

## Fonti e riproduzione

- [Evidenze pubbliche e test del 23/10](evidence/vin-7/2026-10-23/README.md).
- [Verificatore PR #18 e protocollo originale](UNIVERSAL-LINKS-VERIFIER.md).
- [VIN-7](https://linear.app/vincenzocalce/issue/VIN-7/verificare-aasa-e-universal-links-wearable), [PR #18](https://github.com/vincenzocalce/argo-field-gateway-v2/pull/18), [PR #13](https://github.com/vincenzocalce/argo-field-gateway-v2/pull/13).
- [Apple TN3155](https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links), [Associated Domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains), [App ID Prefix](https://developer.apple.com/library/archive/qa/qa1879/_index.html), consultati il 23/10/2026.
