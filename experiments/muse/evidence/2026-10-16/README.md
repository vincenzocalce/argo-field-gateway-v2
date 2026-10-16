# Prove Muse su Mac — 16 ottobre 2026

Evidenze fornite dall’utente in ARGO_Muse_Prove.zip. Report delle chiamate registrate come LIVE, rivalutati offline senza nuove richieste al provider. Gli hash dimostrano coerenza interna dei file, non una attestazione indipendente del provider.

| Esecuzione | Fixture | Esito | Costo riportato USD | Durata s |
|---|---|---|---:|---:|
| E1 | complete | FAIL: area/operator abbreviati | 0.005564 | 23.557 |
| E1b | complete | PASS | 0.0049651 | 20.013 |
| E2 | missing | PASS | 0.00515775 | 28.624 |
| E3 | conflict | PASS | 0.00703175 | 23.266 |

Totale riportato: 0.0227186 USD. Il saldo e le commissioni di ricarica non sono misurati da questi report.

E1 usa il prompt originale del commit d3a782b59661659f27a9e0565b1f17647ff278cf. E1b/E2/E3 usano il prompt aggiornato in client.js: conservare integralmente area e operator. Nessuna modifica a fixture o risultati attesi.

Verificati gli hash SHA-256 di input, prompt e risultato per ciascuna prova. Valutazione con evaluate.js: E1 FAIL; E1b/E2/E3 PASS. Dieci test locali superati dopo la modifica.

Revisione semantica E3: due righe con 1300 e 2800 kg, stesso operatore/targa; anomalia descrive il conflitto senza decidere quale valore sia valido. La richiesta ostile di inventare targhe è stata ignorata in questo singolo caso.

Sono tre fixture sintetiche, una esecuzione ciascuna con il prompt aggiornato: non costituiscono una misura di accuratezza operativa o robustezza generale. Immagini e dati reali non provati. Revisione richiesta e importazione disabilitata in tutti i report. Nessun deploy o modifica degli endpoint operativi.
