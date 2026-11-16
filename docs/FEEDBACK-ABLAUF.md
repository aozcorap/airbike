# Fehler und Feedback der Tester

**Für Tester:** In der App unter *Mehr → Fehler melden oder Feedback* (Art wählen: Fehler, Idee, Frage; Text; Absenden).

**Weg einer Meldung:** App → Supabase-Funktion `feedback-to-github` → **GitHub-Issue** im Repo `aozcorap/airbike` (Labels `tester-feedback` und die Art). Es wird nichts in einer Datenbank gespeichert, es gibt keine Tabelle und keinen Abgleich. Nur angemeldete Nutzer können senden, höchstens 10 Meldungen pro Stunde und Nutzer.

**Was im Issue steht:** Text, Art, Seite, App-Version, Gerätetyp, Altersklasse und Einstellungen, letzter App-Fehler. Keine E-Mail-Adresse, kein Name. Das Repo ist öffentlich, die Issues also auch. Meldungen werden nicht automatisch gelöscht.

**Einmalig nötig:** Die Funktion braucht ein GitHub-Zugangs-Token als Secret `GITHUB_TOKEN` (fine-grained, nur Repo `airbike`, nur *Issues: Read and write*). Ohne dieses Token meldet die App beim Senden einen Fehler. Eintragen: Supabase → Projekt `last-round` → Edge Functions → Secrets. Läuft das Token ab, muss ein neues eingetragen werden.
