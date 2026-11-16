# Fehler und Feedback der Tester

**Für Tester:** In der App unter *Mehr → Fehler melden oder Feedback* (Art wählen: Fehler, Idee, Frage; Text; Absenden).
Mitgeschickt werden automatisch: zuletzt besuchte Seite, App-Version, Gerätetyp, Einstellungen (Altersklasse, Häufigkeit, Runden), letzter Fehler der App. Nicht mitgeschickt: E-Mail-Adresse, Passwort, Test-Watt.

**Wo die Meldungen liegen:** Tabelle `public.feedback` im Supabase-Projekt `last-round` (Status `neu`, `issue`, `erledigt`, `verworfen`).
Jeder Nutzer kann nur eigene Meldungen anlegen und lesen, nicht ändern oder löschen. Höchstens 10 Meldungen pro Stunde und Konto. Beim Löschen des Kontos werden die Meldungen mit gelöscht.

**Wie daraus GitHub-Issues werden:** Auf Zuruf („hol die neuen Meldungen“) liest Claude die Zeilen mit Status `neu`, legt je Meldung ein Issue an (ohne E-Mail-Adresse, nur mit Meldungs-ID) und setzt Status `issue` und die Issue-Nummer.
Das Repo ist öffentlich, die Issues sind es auch. Deshalb Tester bitten, keine privaten Daten zu schreiben.

**Noch nicht automatisch:** Issues entstehen nicht von selbst beim Absenden. Das ginge mit einer Supabase-Funktion und einem GitHub-Zugangsschlüssel von dir. Aufwand klein, aber der Schlüssel muss sicher hinterlegt werden.
