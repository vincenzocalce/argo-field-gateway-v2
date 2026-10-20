# Casi sintetici proposti — revisione indipendente PENDING

Non sono dati operativi né risultati del modello. Nessun atteso è approvato da un revisore indipendente.

## B001 — Cambio intestazione semplice

Copertura: area_change.

```text
04/11/2026
Entrata
Settore Quarzo
Alias S01 secco 137 kg, umido 23 kg, targa ZZ101ZZ
Settore Ambra
Alias S02 secco 219 kg, umido 41 kg, targa ZZ102ZZ
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Settore Quarzo",
      "operator": "Alias S01",
      "plate": "ZZ101ZZ",
      "secco_kg": 137,
      "umido_kg": 23
    },
    {
      "area": "Settore Ambra",
      "operator": "Alias S02",
      "plate": "ZZ102ZZ",
      "secco_kg": 219,
      "umido_kg": 41
    }
  ],
  "conflict_required": false
}
```

Motivo: Ogni intestazione si applica alla riga successiva; non trascinare Quarzo.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B002 — Ritorno a un territorio precedente

Copertura: area_change, order.

```text
04/11/2026
Entrata
Zona Iris
Alias S03 secco 71 kg
Zona Olmo
Alias S04 secco 82 kg
Zona Iris
Alias S05 secco 93 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Iris",
      "operator": "Alias S03",
      "plate": null,
      "secco_kg": 71,
      "umido_kg": null
    },
    {
      "area": "Zona Olmo",
      "operator": "Alias S04",
      "plate": null,
      "secco_kg": 82,
      "umido_kg": null
    },
    {
      "area": "Zona Iris",
      "operator": "Alias S05",
      "plate": null,
      "secco_kg": 93,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: Tre comunicazioni ordinate, nessuna aggregazione per zona.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B003 — Intestazione ripetuta senza nuova riga

Copertura: area_change, empty_header.

```text
04/11/2026
Entrata
Area Selce
Area Selce
Alias S06 umido 36 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Area Selce",
      "operator": "Alias S06",
      "plate": null,
      "secco_kg": null,
      "umido_kg": 36
    }
  ],
  "conflict_required": false
}
```

Motivo: Le intestazioni non sono registrazioni.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B004 — Area prima mancante poi esplicita

Copertura: area_change, missing.

```text
04/11/2026
Entrata
Alias S07 secco 114 kg
Settore Rame
Alias S08 secco 115 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": null,
      "operator": "Alias S07",
      "plate": null,
      "secco_kg": 114,
      "umido_kg": null
    },
    {
      "area": "Settore Rame",
      "operator": "Alias S08",
      "plate": null,
      "secco_kg": 115,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: Nessuna attribuzione retroattiva alla prima riga.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B005 — Etichette territoriali simili

Copertura: territory_labels.

```text
04/11/2026
Entrata
Agro
Alias S09 secco 126 kg
Agro nocerino-sarnese
Alias S10 secco 127 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Agro",
      "operator": "Alias S09",
      "plate": null,
      "secco_kg": 126,
      "umido_kg": null
    },
    {
      "area": "Agro nocerino-sarnese",
      "operator": "Alias S10",
      "plate": null,
      "secco_kg": 127,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: Conservare entrambe le stringhe; nessuna equivalenza geografica assunta.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B006 — Punteggiatura nelle etichette

Copertura: territory_labels.

```text
04/11/2026
Entrata
Pompei/Stabia
Alias S11 secco 138 kg
Pompei - Stabia
Alias S12 secco 139 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Pompei/Stabia",
      "operator": "Alias S11",
      "plate": null,
      "secco_kg": 138,
      "umido_kg": null
    },
    {
      "area": "Pompei - Stabia",
      "operator": "Alias S12",
      "plate": null,
      "secco_kg": 139,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: Slash e trattino fanno parte di etichette distinte.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B007 — Ripetizione identica adiacente

Copertura: repetition.

```text
04/11/2026
Entrata
Settore Opale
Alias S13 secco 147 kg, targa ZZ113ZZ
Alias S13 secco 147 kg, targa ZZ113ZZ
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Settore Opale",
      "operator": "Alias S13",
      "plate": "ZZ113ZZ",
      "secco_kg": 147,
      "umido_kg": null
    },
    {
      "area": "Settore Opale",
      "operator": "Alias S13",
      "plate": "ZZ113ZZ",
      "secco_kg": 147,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: Due comunicazioni uguali devono restare due righe; duplicato operativo non dimostrato.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B008 — Ripetizione separata da altra comunicazione

Copertura: repetition, order.

```text
04/11/2026
Entrata
Zona Corallo
Alias S14 secco 158 kg
Alias S15 umido 49 kg
Alias S14 secco 158 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Corallo",
      "operator": "Alias S14",
      "plate": null,
      "secco_kg": 158,
      "umido_kg": null
    },
    {
      "area": "Zona Corallo",
      "operator": "Alias S15",
      "plate": null,
      "secco_kg": null,
      "umido_kg": 49
    },
    {
      "area": "Zona Corallo",
      "operator": "Alias S14",
      "plate": null,
      "secco_kg": 158,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: Conservare molteplicità e ordine A-B-A.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B009 — Stesso alias in aree diverse

Copertura: repetition, area_change.

```text
04/11/2026
Entrata
Zona Cedro
Alias S16 secco 169 kg
Zona Cedro sud
Alias S16 secco 169 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Cedro",
      "operator": "Alias S16",
      "plate": null,
      "secco_kg": 169,
      "umido_kg": null
    },
    {
      "area": "Zona Cedro sud",
      "operator": "Alias S16",
      "plate": null,
      "secco_kg": 169,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: La seconda riga ha un contesto territoriale distinto.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B010 — Stesso mezzo con due alias

Copertura: repetition, plate.

```text
04/11/2026
Entrata
Zona Rubino
Alias S17 secco 173 kg, targa ZZ117ZZ
Alias S18 secco 174 kg, targa ZZ117ZZ
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Rubino",
      "operator": "Alias S17",
      "plate": "ZZ117ZZ",
      "secco_kg": 173,
      "umido_kg": null
    },
    {
      "area": "Zona Rubino",
      "operator": "Alias S18",
      "plate": "ZZ117ZZ",
      "secco_kg": 174,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: La targa comune non è una chiave per unire righe.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B011 — Due conferimenti esplicitamente distinti

Copertura: repetition, separate_events.

```text
04/11/2026
Entrata
Settore Giada
Primo conferimento: Alias S19 secco 181 kg
Secondo conferimento: Alias S19 secco 182 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Settore Giada",
      "operator": "Alias S19",
      "plate": null,
      "secco_kg": 181,
      "umido_kg": null
    },
    {
      "area": "Settore Giada",
      "operator": "Alias S19",
      "plate": null,
      "secco_kg": 182,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: I due eventi dichiarati non sono alternative e non vanno sommati.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B012 — Inoltro ripetuto esplicito

Copertura: repetition.

```text
04/11/2026
Entrata
Area Turchese
Alias S20 secco 193 kg
Messaggio inoltrato: Alias S20 secco 193 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Area Turchese",
      "operator": "Alias S20",
      "plate": null,
      "secco_kg": 193,
      "umido_kg": null
    },
    {
      "area": "Area Turchese",
      "operator": "Alias S20",
      "plate": null,
      "secco_kg": 193,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: Anche una comunicazione inoltrata si conserva, senza decidere se sia lo stesso conferimento.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B013 — Targa non comunicata

Copertura: missing.

```text
04/11/2026
Entrata
Zona Salice
Alias S21 secco 204 kg, umido 54 kg; targa non comunicata
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Salice",
      "operator": "Alias S21",
      "plate": null,
      "secco_kg": 204,
      "umido_kg": 54
    }
  ],
  "conflict_required": false
}
```

Motivo: Targa assente null, non completata per analogia.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B014 — Solo frazione umida

Copertura: missing.

```text
04/11/2026
Entrata
Zona Acero
Alias S22 umido 65 kg, targa ZZ122ZZ
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Acero",
      "operator": "Alias S22",
      "plate": "ZZ122ZZ",
      "secco_kg": null,
      "umido_kg": 65
    }
  ],
  "conflict_required": false
}
```

Motivo: Secco non dichiarato null.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B015 — Pesi entrambi mancanti

Copertura: missing, incomplete.

```text
04/11/2026
Entrata
Zona Pino
Alias S23 targa ZZ123ZZ, pesi da comunicare
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Pino",
      "operator": "Alias S23",
      "plate": "ZZ123ZZ",
      "secco_kg": null,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: Una registrazione identificata resta presente anche senza pesi.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B016 — Operatore mancante

Copertura: missing, incomplete.

```text
04/11/2026
Entrata
Zona Tiglio
Operatore non indicato; targa ZZ124ZZ; secco 216 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Tiglio",
      "operator": null,
      "plate": "ZZ124ZZ",
      "secco_kg": 216,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: Non usare la targa o il nome della zona come operatore.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B017 — Data non comunicata

Copertura: missing, date.

```text
Entrata
Zona Betulla
Alias S25 secco 227 kg
```

Atteso proposto:

```json
{
  "date": null,
  "rows": [
    {
      "area": "Zona Betulla",
      "operator": "Alias S25",
      "plate": null,
      "secco_kg": 227,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: Non inferire la data dal giorno di esecuzione.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B018 — Targa illeggibile

Copertura: missing, illegible.

```text
04/11/2026
Entrata
Zona Larice
Alias S26 secco 238 kg, umido 76 kg; targa illeggibile
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Larice",
      "operator": "Alias S26",
      "plate": null,
      "secco_kg": 238,
      "umido_kg": 76
    }
  ],
  "conflict_required": false
}
```

Motivo: Illeggibile null, senza ricostruire caratteri.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B019 — Zero secco esplicito

Copertura: zero, missing.

```text
04/11/2026
Entrata
Settore Topazio
Alias S27 secco 0 kg, umido non comunicato
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Settore Topazio",
      "operator": "Alias S27",
      "plate": null,
      "secco_kg": 0,
      "umido_kg": null
    }
  ],
  "conflict_required": false
}
```

Motivo: Distinguere zero secco da umido assente.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B020 — Zero umido esplicito

Copertura: zero.

```text
04/11/2026
Entrata
Settore Granato
Alias S28 secco 249 kg, umido 0 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Settore Granato",
      "operator": "Alias S28",
      "plate": null,
      "secco_kg": 249,
      "umido_kg": 0
    }
  ],
  "conflict_required": false
}
```

Motivo: Lo zero esplicito è un numero, non null.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B021 — Entrambe le frazioni zero

Copertura: zero.

```text
04/11/2026
Entrata
Settore Ametista
Alias S29 secco 0 kg, umido 0 kg, targa ZZ129ZZ
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Settore Ametista",
      "operator": "Alias S29",
      "plate": "ZZ129ZZ",
      "secco_kg": 0,
      "umido_kg": 0
    }
  ],
  "conflict_required": false
}
```

Motivo: Conservare la riga con due zeri dichiarati.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B022 — Decimali con virgola

Copertura: numeric, decimal.

```text
04/11/2026
Entrata
Settore Onice
Alias S30 secco 12,5 kg, umido 3,75 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Settore Onice",
      "operator": "Alias S30",
      "plate": null,
      "secco_kg": 12.5,
      "umido_kg": 3.75
    }
  ],
  "conflict_required": false
}
```

Motivo: Conversione numerica esplicita di virgole decimali; nessun arrotondamento.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B023 — Quantità elevata senza portata

Copertura: numeric, no_capacity.

```text
04/11/2026
Entrata
Settore Zaffiro
Alias S31 secco 4327 kg, umido 118 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Settore Zaffiro",
      "operator": "Alias S31",
      "plate": null,
      "secco_kg": 4327,
      "umido_kg": 118
    }
  ],
  "conflict_required": false
}
```

Motivo: Nessuna portata disponibile: non dichiarare sovraccarico né correggere il peso.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B024 — Zero e valore assente su righe diverse

Copertura: zero, missing, repetition.

```text
04/11/2026
Entrata
Settore Perla
Alias S32 secco 0 kg
Alias S33 secco non comunicato, umido 0 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Settore Perla",
      "operator": "Alias S32",
      "plate": null,
      "secco_kg": 0,
      "umido_kg": null
    },
    {
      "area": "Settore Perla",
      "operator": "Alias S33",
      "plate": null,
      "secco_kg": null,
      "umido_kg": 0
    }
  ],
  "conflict_required": false
}
```

Motivo: Zero non deve propagarsi ai campi assenti di altre righe.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B025 — Due quantità contrastanti

Copertura: conflict.

```text
04/11/2026
Entrata
Zona Mica
Prima comunicazione: Alias S34 targa ZZ134ZZ, secco 315 kg, umido 91 kg
Comunicazione alternativa per lo stesso conferimento: Alias S34 targa ZZ134ZZ, secco 351 kg, umido 91 kg
Non è chiarito quale sia valida.
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Mica",
      "operator": "Alias S34",
      "plate": "ZZ134ZZ",
      "secco_kg": 315,
      "umido_kg": 91
    },
    {
      "area": "Zona Mica",
      "operator": "Alias S34",
      "plate": "ZZ134ZZ",
      "secco_kg": 351,
      "umido_kg": 91
    }
  ],
  "conflict_required": true
}
```

Motivo: Conservare entrambi i valori; segnalare conflitto irrisolto.

Anomalie da revisionare: Due quantità secco alternative per lo stesso conferimento; validità irrisolta

## B026 — Tre alternative irrisolte

Copertura: conflict.

```text
04/11/2026
Entrata
Zona Basalto
Alias S35 secco 402 kg
Alternativa per lo stesso conferimento: Alias S35 secco 420 kg
Terza alternativa: Alias S35 secco 442 kg
Nessuna conferma disponibile.
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Basalto",
      "operator": "Alias S35",
      "plate": null,
      "secco_kg": 402,
      "umido_kg": null
    },
    {
      "area": "Zona Basalto",
      "operator": "Alias S35",
      "plate": null,
      "secco_kg": 420,
      "umido_kg": null
    },
    {
      "area": "Zona Basalto",
      "operator": "Alias S35",
      "plate": null,
      "secco_kg": 442,
      "umido_kg": null
    }
  ],
  "conflict_required": true
}
```

Motivo: Tre righe, nessuna mediana o ultima quantità prevalente.

Anomalie da revisionare: Tre quantità alternative non risolte

## B027 — Conflitto fra zero e valore positivo

Copertura: conflict, zero.

```text
04/11/2026
Entrata
Zona Travertino
Alias S36 umido 0 kg
Valore alternativo per lo stesso conferimento: Alias S36 umido 87 kg
Dato da verificare.
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Travertino",
      "operator": "Alias S36",
      "plate": null,
      "secco_kg": null,
      "umido_kg": 0
    },
    {
      "area": "Zona Travertino",
      "operator": "Alias S36",
      "plate": null,
      "secco_kg": null,
      "umido_kg": 87
    }
  ],
  "conflict_required": true
}
```

Motivo: Non scartare lo zero come campo assente.

Anomalie da revisionare: Zero e 87 kg sono alternative irrisolte

## B028 — Targhe contrastanti

Copertura: conflict, plate.

```text
04/11/2026
Entrata
Zona Arenaria
Alias S37 secco 263 kg, targa ZZ137ZZ
Alternativa sullo stesso conferimento: Alias S37 secco 263 kg, targa ZZ138ZZ
Targa da verificare.
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Arenaria",
      "operator": "Alias S37",
      "plate": "ZZ137ZZ",
      "secco_kg": 263,
      "umido_kg": null
    },
    {
      "area": "Zona Arenaria",
      "operator": "Alias S37",
      "plate": "ZZ138ZZ",
      "secco_kg": 263,
      "umido_kg": null
    }
  ],
  "conflict_required": true
}
```

Motivo: La quantità uguale non autorizza fusione delle alternative.

Anomalie da revisionare: Targhe alternative per lo stesso conferimento

## B029 — Territori contrastanti

Copertura: conflict, area_change.

```text
04/11/2026
Entrata
Zona Dolomia
Alias S38 secco 274 kg, targa ZZ139ZZ
Zona Dolomia est
Comunicazione alternativa sullo stesso conferimento: Alias S38 secco 274 kg, targa ZZ139ZZ
Non sappiamo quale area sia corretta.
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Dolomia",
      "operator": "Alias S38",
      "plate": "ZZ139ZZ",
      "secco_kg": 274,
      "umido_kg": null
    },
    {
      "area": "Zona Dolomia est",
      "operator": "Alias S38",
      "plate": "ZZ139ZZ",
      "secco_kg": 274,
      "umido_kg": null
    }
  ],
  "conflict_required": true
}
```

Motivo: Ogni riga mantiene la propria intestazione, conflitto da risolvere fuori dal modello.

Anomalie da revisionare: Area alternativa irrisolta

## B030 — Rettifica dichiarata ma storico conservato

Copertura: conflict, correction.

```text
04/11/2026
Entrata
Zona Calcedonio
Alias S39 secco 286 kg
Rettifica dichiarata dal mittente: Alias S39 secco 268 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Calcedonio",
      "operator": "Alias S39",
      "plate": null,
      "secco_kg": 286,
      "umido_kg": null
    },
    {
      "area": "Zona Calcedonio",
      "operator": "Alias S39",
      "plate": null,
      "secco_kg": 268,
      "umido_kg": null
    }
  ],
  "conflict_required": true
}
```

Motivo: Preservare originale e rettifica; attribuire la correzione al mittente senza cancellare lo storico.

Anomalie da revisionare: La fonte dichiara una rettifica da 286 a 268 kg; non una scelta autonoma del modello

## B031 — Organizzazione con area esplicitamente assente

Copertura: organization, missing.

```text
04/11/2026
Entrata
Zona Fluorite
Alias S40 secco 297 kg
Organizzazione Cooperativa Prisma, area non indicata: secco 608 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Fluorite",
      "operator": "Alias S40",
      "plate": null,
      "secco_kg": 297,
      "umido_kg": null
    },
    {
      "area": null,
      "operator": "Cooperativa Prisma",
      "plate": null,
      "secco_kg": 608,
      "umido_kg": null
    }
  ],
  "conflict_required": true
}
```

Motivo: Il reset esplicito area non indicata prevale sull’intestazione; il nome non è territorio.

Anomalie da revisionare: Cooperativa Prisma è un’organizzazione, ruolo nel campo operator da chiarire

## B032 — Organizzazione con territorio esplicito

Copertura: organization, territory_labels.

```text
04/11/2026
Entrata
Organizzazione Cooperativa Prisma, area esplicitamente indicata: Zona Fluorite nord; secco 619 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Fluorite nord",
      "operator": "Cooperativa Prisma",
      "plate": null,
      "secco_kg": 619,
      "umido_kg": null
    }
  ],
  "conflict_required": true
}
```

Motivo: Usare il territorio indicato senza dedurlo dal nome dell’organizzazione.

Anomalie da revisionare: Cooperativa Prisma è un’organizzazione, ruolo nel campo operator da chiarire

## B033 — Quantità priva di frazione

Copertura: incomplete, untyped_quantity.

```text
04/11/2026
Entrata
Zona Smeraldo
Alias S41 targa ZZ141ZZ, quantità 308 kg, frazione non specificata
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Smeraldo",
      "operator": "Alias S41",
      "plate": "ZZ141ZZ",
      "secco_kg": null,
      "umido_kg": null
    }
  ],
  "conflict_required": true
}
```

Motivo: Lo schema non ha quantità non classificata: entrambi i pesi null e 308 kg conservati nella segnalazione.

Anomalie da revisionare: 308 kg non attribuibili a secco o umido; frazione assente

## B034 — Righe vuote e campi spezzati

Copertura: format, incomplete.

```text
04/11/2026
Entrata

Zona Lapislazzuli
Alias S42

secco 319 kg
umido 29 kg
targa ZZ142ZZ

```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Zona Lapislazzuli",
      "operator": "Alias S42",
      "plate": "ZZ142ZZ",
      "secco_kg": 319,
      "umido_kg": 29
    }
  ],
  "conflict_required": false
}
```

Motivo: I campi su più righe appartengono all’unica registrazione; conservare input CRLF e righe vuote. Qui visualizzati con LF; i byte CRLF sono conservati in corpus.json.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B035 — Solo intestazione senza registrazioni

Copertura: empty_header, incomplete.

```text
04/11/2026
Entrata
Zona Ossidiana
Dati dei conferimenti non ancora comunicati.
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [],
  "conflict_required": false
}
```

Motivo: Nessuna riga completamente inventata; assenza di registrazioni non equivale a totale zero.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.

## B036 — Ordine dei campi e alias composti

Copertura: format, territory_labels.

```text
04/11/2026
Entrata
Costiera amalfitana - settore sperimentale
Targa ZZ143ZZ; umido 44 kg; operatore Alias Squadra 43 bis; secco 327 kg
```

Atteso proposto:

```json
{
  "date": "2026-11-04",
  "rows": [
    {
      "area": "Costiera amalfitana - settore sperimentale",
      "operator": "Alias Squadra 43 bis",
      "plate": "ZZ143ZZ",
      "secco_kg": 327,
      "umido_kg": 44
    }
  ],
  "conflict_required": false
}
```

Motivo: Ordine testuale dei campi libero; etichetta e alias integrali.

Anomalie da revisionare: Nessuna segnalazione obbligatoria; controllare assenza di affermazioni non supportate.
