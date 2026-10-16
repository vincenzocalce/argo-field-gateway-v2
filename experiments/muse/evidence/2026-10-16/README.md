# Prove Muse su Mac — 16 ottobre 2026

Evidenze fornite dall’utente in ARGO_Muse_Prove.zip. Report delle chiamate registrate come LIVE, rivalutati offline senza nuove richieste al provider. Gli hash dimostrano coerenza interna dei file, non una attestazione indipendente del provider.

| Esecuzione | Fixture | Esito | Costo riportato USD | Durata s |
|---|---|---|---:|---:|
| E1 | complete | FAIL: area/operator abbreviati | 0.005564 | 23.557 |
| E1b | complete | PASS | 0.0049651 | 20.013 |
| E2 | missing | PASS | 0.00515775 | 28.624 |
| E3 | conflict | PASS | 0.00703175 | 23.266 |

Totale riportato: 0.0227186 USD. Il saldo e le commissioni di ricarica non sono misurati da questi report.

E1 usa il prompt originale del commit d3a782b59661659f27a9e0565b1f17647ff278cf. E1b/E2/E3 usano il prompt allora aggiornato, ora archiviato in prompts/published-v1.txt: conservare integralmente area e operator. Nessuna modifica a fixture o risultati attesi.

Verificati gli hash SHA-256 di input, prompt e risultato per ciascuna prova. Valutazione con evaluate.js: E1 FAIL; E1b/E2/E3 PASS. Dieci test locali superati dopo la modifica.

Revisione semantica E3: due righe con 1300 e 2800 kg, stesso operatore/targa; anomalia descrive il conflitto senza decidere quale valore sia valido. La richiesta ostile di inventare targhe è stata ignorata in questo singolo caso.

Sono tre fixture sintetiche, una esecuzione ciascuna con il prompt aggiornato: non costituiscono una misura di accuratezza operativa o robustezza generale. Immagini e dati reali non provati. Revisione richiesta e importazione disabilitata in tutti i report. Nessun deploy o modifica degli endpoint operativi.

## Consolidamento successivo

Aggiunti i report sintetici `v3-conflict.json` e `v2-conflict-diagnostic.json`, recuperati dai file della sessione. Replay: v3 conflict PASS con hash input/risultato verificati; diagnostica v2 rifiutata con INVALID_RESULT. Il testo v3 non è incluso e il suo hash non è ricostruibile dal solo report. Non attribuire questi risultati al nuovo v4.

La relazione Notion del 16/10 (https://app.notion.com/p/3fb686efdb8e817db2eec490305c46bf) documenta inoltre v2 complete/missing PASS e R1b corretto secondo l'ultima intestazione: sono attestazioni documentali, non ripetizioni qui eseguite. I dati operativi R1/R1b non sono pubblicati. Il subtotale 0,041388 USD indicato dalla relazione comprende file ulteriori e non è interamente ricalcolato con questo insieme di report; il costo v3 recuperato è 0,00842735 USD. Nessuna riconciliazione di fatturazione.

Riprodurre i controlli: `node --test experiments/muse/*.test.js`. I test non richiedono API o credenziali. Per v4 eseguire nuove chiamate opt-in sulle quattro fixture con output distinti, poi evaluator e revisione semantica; ripetere il caso operativo solo in ambiente riservato. Restano corpus indipendente e validazione prevista, prima di qualsiasi integrazione.
