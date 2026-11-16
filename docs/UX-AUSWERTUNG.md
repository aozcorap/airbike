# Auswertung: Aufbau, Reihenfolge und Bedienung (Nonstop Boxing)

Stand: 16.11.2026. Reine Auswertung, es wurde nichts geändert.

**Hinweis, später ergänzt:** Teile sind überholt. Die Anmeldung läuft ohne Passwort per Code aus der E-Mail. Die Einführung hat vier statt sieben Bildschirme (Willkommen, Kampf, Fitness-Test, Fertig), die Altersklasse folgt dem Geburtsjahr. Elternfreigabe, Sperre und Trainer-Freigabe hat der Betreiber entfernt. Den aktuellen Stand der offenen Punkte zeigt `OFFENE-PUNKTE.md`.

## Was geprüft wurde

Ich habe die App mit einem neuen Konto bei 390 × 844 px durchgespielt und angesehen: Anmeldung, alle Einführungsschritte, Startseite, Plan, Woche, Einheit, Fitness-Test, Einführungsseite, Einstellungen.
Nicht angesehen in dieser Runde: Timer im Lauf, die Wochenseite, Abläufe mit echter Tastatur auf dem iPhone, Barrierefreiheit (Vorlesefunktion), sehr kleine Geräte unter 360 px.
Das ist eine fachliche Einschätzung, keine Nutzerstudie. Mit 3 bis 5 echten Boxern auf dem Handy würden Sie noch mehr Befunde liefern.

## Kurzfazit

1. Die App ist inhaltlich gut und sieht stimmig aus. Der Weg für neue Nutzer ist aber länger und doppelter als nötig.
2. Das Wichtigste (der Fitness-Test) kommt zu spät und ist leicht zu überspringen. Ohne ihn zeigt die App nur Prozentwerte.
3. Die Altersklasse wird zweimal abgefragt (Registrierung und Einführung). Die Angaben hängen nicht zusammen. Das ist auch ein Jugendschutz-Thema.
4. Der Menüpunkt „Einführung" belegt dauerhaft einen von vier Plätzen, obwohl er nur in den ersten Tagen gebraucht wird.
5. Die Einstellungen sind eine lange Liste. Zusammengehörige Dinge liegen weit auseinander.

## 1. Weg eines neuen Nutzers: Ist und Soll

### Ist (so gemessen)

Registrieren (damals: E-Mail, Passwort, Geburtsjahr, Einwilligung; heute ohne Passwort, mit Code aus der E-Mail) → E-Mail bestätigen → Anmelden → Einführung mit 7 Bildschirmen (heute 4):
Willkommen → Gesundheit → Altersklasse → Kampftermin → Kampfformat → Fitness-Test (Eingabe oder starten oder „später") → Fertig → Startseite.

Die Einführung erscheint nach der ersten Anmeldung sofort. Bestätigt: im Test kam sie direkt nach dem Login.
Der Eindruck „zu spät" kommt wahrscheinlich von dem, was davor liegt: Registrierung mit mehreren Feldern und Kästchen, dann E-Mail öffnen, dann erneut anmelden, dann erst Einführung. Das sind etwa fünf Hürden, bevor die App etwas zeigt.

### Befunde dazu

- **A1. Geburtsjahr und Altersklasse sind getrennt.** Das Geburtsjahr aus der Registrierung liegt nur im Konto. In der Einführung wird die Altersklasse neu gewählt, jede Klasse ist frei wählbar. Ein 16-Jähriger kann „Elite / Erwachsene" wählen. Ob das gewollt ist, ist eine Jugendschutz-Frage. Besser: Altersklasse aus dem Geburtsjahr vorbelegen und nur bei Bedarf änderbar machen, bei Jugendlichen ohne Wahl nach oben.
- **A2. Fitness-Test ist der letzte und überspringbare Schritt.** Auf dem Ende-Schritt steht „Test-Watt: noch offen". Die Startseite zeigt danach „Nächste Einheit" größer als den Test. Wer die Einheit startet, sieht nur Prozentwerte statt Watt-Ziele.
- **A3. Zwei gleichwertige rote Knöpfe im Test-Schritt** („Speichern" und „Fitness-Test starten") konkurrieren. Die meisten Nutzer kennen ihre Werte nicht. „Test starten" sollte der Hauptknopf sein, „Werte eintragen" klein darunter.
- **B1. Zu viele Bildschirme.** Willkommen und Gesundheit lassen sich zusammenlegen. Kampftermin und Kampfformat (Runden, Länge) gehören auf einen Bildschirm („dein Kampf").
- **B2. Der Link „Später machen (dann siehst du nur Prozentwerte)"** ist grau, klein und läuft über zwei Zeilen. Er liegt am unteren Rand und ist am Handy nur nach Scrollen sichtbar.

### Soll (Vorschlag)

Registrieren → E-Mail bestätigen → Anmelden → **4 Bildschirme:**
1. Willkommen mit Gesundheitshinweis (ein Bildschirm, mit „Verstanden").
2. Dein Kampf: Datum, Rundenzahl, Rundenlänge. Altersklasse steht vorbelegt in einer Zeile mit „ändern".
3. Fitness-Test: großer Knopf „Test jetzt starten (ca. 10 min)", klein „Werte schon bekannt? Eintragen", ganz klein „Später".
4. Fertig: der nächste Schritt ist je nach Wahl entweder der Test oder die erste Einheit.

## 2. Menü (untere Leiste)

### Ist

Heute · Plan · Einführung · Einstellungen

### Befunde

- **A4. „Einführung" ist nach den ersten Tagen überflüssig,** blockiert aber einen der vier Plätze. Die Startseite hat zusätzlich eine Checkliste „So kommst du in Gang" mit denselben drei Punkten. Das ist doppelt.
- **A5. Der Fitness-Test hat keinen festen Platz.** Er liegt im Pfad der Startseite, wird aber mit „Heute" hervorgehoben und ist sonst nur über einen Link in den Einstellungen erreichbar. Wer ihn nach 4 Wochen wiederholen soll, sucht ihn.
- **B3. „Einstellungen" enthält zu viel:** Konto, Profil, Training, Erinnerungen, Daten, Löschen, Recht. Das ist normal, aber lang (siehe Abschnitt 4).

### Vorschlag

| Platz | Name | Inhalt |
|---|---|---|
| 1 | **Heute** | Nächste Einheit, Tage bis zum Kampf, bis zum Setup abgeschlossen: eine große Aufgabenkarte |
| 2 | **Plan** | Wochenübersicht, Einheiten |
| 3 | **Fortschritt** | Erledigte Einheiten, Test-Watt und Verlauf, „Test wiederholen" |
| 4 | **Mehr** | Einstellungen, Konto, Hilfe und Einführung (die jetzige Seite „So startest du" mit Wissen), Datenschutz, Impressum |

Während das Setup unvollständig ist, steht auf „Heute" eine einzige große Karte oben: „Nächster Schritt: Fitness-Test". Nach dem Test verschwindet sie. Die Einführung bleibt als Hilfe unter „Mehr".
Falls du vier Tabs ohne „Fortschritt" willst: dann Heute · Plan · Test · Einstellungen, der Test bekommt einen Platz, die Einführung wandert in die Einstellungen.

## 3. Startseite „Heute"

- **A6. Der Test-Watt ist kein Aufruf zum Handeln.** In der Checkliste steht er als schwache Zeile „Offen". Er sollte die Hauptkarte sein, solange er fehlt.
- **A7. Das Foto hat ein sichtbares iStock-Wasserzeichen** (Banner und Einführung, im Bild rechts unten). Für den Start nicht zumutbar, siehe `OFFENE-PUNKTE.md` Punkt 4.
- **B4. Die Startseite ist lang:** Banner, Zähler, Checkliste, nächste Einheit, ganze Woche. Eine ruhigere Hierarchie: oben Kampf-Zähler, dann *eine* Hauptkarte (Setup oder nächste Einheit), danach die Woche.
- **C1. „Einführung noch einmal ansehen"** steht im Setup-Kasten, in den Einstellungen und auf der Einführungsseite. Ein Ort reicht.

## 4. Einstellungen

Aktuell von oben nach unten: Konto · Profil-Info · Training (Test-Watt) · Kampfformat · Aktive Erholung (Alter) · Kampf und Termine (Kampftermin, Häufigkeit, Tage, Uhrzeit, Kalender, Hinweise) · Daten (Sichern, Wiederherstellen, Zurücksetzen, Konto löschen).

- **A8. Kampftermin und Kampfformat liegen weit auseinander,** obwohl beides „dein Kampf" ist.
- **B5. Das Alter (für die Herzfrequenz) wird getrennt vom Geburtsjahr und von der Altersklasse abgefragt.** Das sind drei Angaben zum selben Thema.
- **B6. Die gefährlichen Knöpfe** („Fortschritt zurücksetzen", „Konto löschen") liegen direkt unter „Sichern/Wiederherstellen". Besser ein eigener Abschnitt „Gefahrenzone" ganz unten mit Rückfrage.
- **C2. Uhrzeit** erscheint in Testläufen als „06:00 PM". Auf einem deutschen Gerät sollte „18:00" stehen. Das habe ich nicht auf einem iPhone geprüft.

Vorschlag für die Gruppen: **Dein Kampf** (Termin, Runden, Länge) · **Dein Training** (Altersklasse, Test-Watt, Häufigkeit, Tage, Uhrzeit, Erinnerungen) · **Konto** (E-Mail, Abmelden, Daten sichern) · **Hilfe und Rechtliches** · **Gefahrenzone**.

## 5. Plan, Woche, Einheit

- **B7. Woche 10 zeigt „0/0 erledigt"** (nach dem Kürzen bleiben dort keine Einheiten). Besser „Kampfwoche, keine Einheit" oder ausblenden.
- **B8. Auf der Einheit steht oben ein gelber Kasten „Test-Watt fehlt"** mit drei Eingabefeldern. Dieselben drei Felder gibt es im Fitness-Test, in der Einführung und im Timer-Ende. Vier Eingabewege für dieselbe Sache sind zu viele. Ein Link „Test machen" reicht dort.
- **C3. Die Einheit ist lang (11 Karten).** Gut lesbar, aber die Gesamtübersicht (Dauer, Anzahl Intervalle, Wattbereich) könnte oben stehen und die Details einklappbar sein.

## 6. Dinge, die fürs Launchen fehlen oder noch nicht entschieden sind

- Leere Zustände und Fehlertexte (kein Netz, Server nicht erreichbar, falscher oder abgelaufener Code) sind teilweise vorhanden, aber nicht einheitlich geprüft.
- Eine Hilfe-/Kontaktmöglichkeit fehlt (Mail-Adresse, FAQ).
- Wiederholung des Fitness-Tests (alle 4 bis 6 Wochen) braucht einen Hinweis und einen festen Ort.
- Es gibt keine Rückmeldung zum Fortschritt (z. B. „12 von 36 Einheiten", Verlauf des Test-Watt). Für Motivation und Bindung wichtig.
- Die Altersklasse folgt jetzt dem Geburtsjahr aus der Registrierung (A1 ist damit erledigt). Elternfreigabe und Sperre hat der Betreiber entfernt.
- Die Rechtstexte sind Entwürfe (siehe `OFFENE-PUNKTE.md`).

## 7. Reihenfolge der Umsetzung (Vorschlag)

1. **Einführung neu ordnen** (A1 bis A3, B1, B2): 4 Bildschirme, Altersklasse aus dem Geburtsjahr, Fitness-Test als Hauptweg.
2. **Startseite: eine Hauptkarte** (A6, B4, C1).
3. **Menü umbauen** (A4, A5): Einführung wird zu „Mehr/Hilfe", neuer Platz für Test oder Fortschritt.
4. **Einstellungen gruppieren** (A8, B5, B6, C2).
5. **Feinschliff** (B7, B8, C3, Fortschrittsanzeige).

Punkt 1 bis 3 bringen den größten Nutzen. Aufwand grob: 1 und 2 sind klein bis mittel, 3 ist mittel (Menü, Wegweiser, Tests), 4 und 5 klein.
