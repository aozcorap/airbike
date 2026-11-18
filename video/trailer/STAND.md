# Trailer „Nonstop Boxing" – Arbeitsstand (18.11.2026)

Zweck dieser Datei: Alles, was für die Weiterarbeit gebraucht wird, an einem Ort. Die Prompts selbst stehen in `higgsfield-prompts.md` (Abschnitt „Ein-Prompt-Fassung"), der Ablauf in `storyboard.md`.

## Wo wir stehen

- **Story-Video (25 s) ist in Higgsfield erzeugt** (Entwurf, 480p). Ablauf, Held, Gegner, App-Bilder und Airbike gefallen dem Betreiber.
- **Offen am fertigen Video:** der Herzschlag am Anfang ist zu leise. Lösung: in **CapCut** eine eigene Herzschlag-Tonspur lauter darüberlegen (Betreiber hat CapCut eingerichtet).
- **Noch nicht gemacht:** deutsche Stimme, Abspann (5 s), Untertitel, Musik-Prüfung, Export.

## Festgelegter Ablauf (nicht ohne Rückfrage ändern)

1. Held in der Umkleide, **lauter Herzschlag**, Gegner als Schatten (0–3,5 s)
2. Brutaler, glatzköpfiger Gegner am Sandsack (3,5–6,5 s)
3. Held auf dem Airbike am Limit, **Airbike komplett im Bild** (seitliche Totale, dann Nahaufnahme Lüfterrad) (6,5–10 s)
4. App mit 3 Bildern: Fitness-Test, Plan, Timer mit Watt-Zahl (10–20 s)
5. Held gewinnt, **beide mit Boxhandschuhen** (Held schwarz, Gegner rot) (20–25 s)
6. Abspann mit Logo und Adresse (25–30 s, **separat bauen**, nicht in Higgsfield)

**Gestrichen (nicht wieder einbauen):** Ahmet im Bild (weder als Trainer noch als Boxer), die Szene „Runde 3, Held erschöpft an den Seilen".

## Einstellungen in Higgsfield

- Modell **Seedance 2.5**, Modus „Omni Reference", Format **9:16**, Dauer **25 s** (nicht 30), **Ton „An"**, Qualität 480p als Entwurf (Bitrate hoch). Unbegrenzt-Modus aus.
- Kosten: ein 25–30-s-Entwurf kostet ca. **75–90 Credits**, **Dubbing (Übersetzen) kostet ca. 75 Credits**. Startguthaben am 18.11.: 3010 Credits.
- Der Higgsfield-Anschluss in Claude kann **nur lesen** (Guthaben, Modelle, fertige Clips). Er erzeugt nichts. Die Clip-Adressen sind in der Claude-Sitzung vom Netzwerk gesperrt, deshalb kann Claude die fertigen Videos nicht ansehen. Zum Prüfen Bildschirmfotos schicken.

## Referenzbilder (Reihenfolge ist wichtig, die Nummern im Prompt hängen daran)

1. **Airbike** (eigenes Foto, keine Herstellerfotos wegen Rechten)
2. **Held** (Gesicht aus dem Umkleide-Clip)
3. **Gegner** (Standbild vom Sandsack, Glatze, im Gegenlicht, Gesicht im Schatten)
4. **Fitness-Test** → `app-bilder/b2_fitnesstest.png`
5. **Timer** → `app-bilder/b5_timer.png`
6. **Plan** → `app-bilder/b3_plan.png`

Stimmt die Reihenfolge in Higgsfield nicht, müssen die Nummern im Prompt angepasst werden (so ist es heute passiert).

## App-Bilder (echte Aufnahmen, Hochformat 1080×1920)

Liegen in `app-bilder/` (`b1_kampftermin`, `b2_fitnesstest`, `b3_plan`, `b4_alter`, `b5_timer`, `b6a_fortschritt`, `b6b_kalender`). Verwendet werden im Trailer nur b2, b3, b5. Neu aufnehmen mit `app-bilder/aufnehmen.js` (Playwright, simuliertes Konto, Alter 40–49, Test-Watt 1000). Die Aufnahmen stammen aus Chromium im Handyformat, nicht vom iPhone.
**Nicht verwenden:** die Startseite der App. Das Heldenfoto dort hat ein iStock-Wasserzeichen.

## Entscheidungen und Erfahrungen (damit sie nicht verloren gehen)

- **Airbike:** Das Wort „bike" lässt Videomodelle ein normales Fahrrad zeichnen. Deshalb im Prompt das Gerät genau beschreiben (Lüfterrad im Käfig, Push-Pull-Griffe, kein Vorderrad) und das echte Foto als Referenz mitgeben. Wenn das nicht reicht: erst ein Standbild mit Nano Banana erzeugen (1,5 Credits pro Bild) und dieses als Startbild für das Video nehmen.
- **Held über mehrere Szenen gleich halten:** immer das Gesichts-Standbild aus der Umkleide als Referenz, im Prompt „keep his face identical".
- **Kein „ein Prompt für 58 s":** Die Modelle schaffen höchstens 30 s. Deshalb 25 s Higgsfield plus 5 s Abspann separat.
- **Texte und Zahlen** der App im Video nur als Referenzbild „exakt und unverändert". Text im Bild erzeugt die KI schlecht. Untertitel entstehen im Schnitt.
- **Sprache:** zuerst Englisch erzeugen. Deutsche Zeilen stehen in `higgsfield-prompts.md`.
- **Alte Prompts (Einzelszenen)** liegen am Ende von `higgsfield-prompts.md` nur als Reserve.

## Für morgen offen

1. **Herzschlag** in CapCut lauter machen (eigene Spur über die ersten 6 s, Originalton in den ersten 4 s leiser). Auf Lizenz der Herzschlag-Datei achten (kommerzielle Nutzung).
2. **Deutsche Stimme.** Drei Wege: (a) „Dubbing" in Higgsfield (ca. 75 Credits, erst auf das fertige Video, Frage ob Herzschlag und Musik erhalten bleiben), (b) eigene Stimme mit dem Handy aufnehmen und in CapCut legen, (c) neu erzeugen mit deutschen Zeilen im Prompt. Entscheidung offen.
3. **Abspann (5 s):** Logo, „Mehr Kondition bis zur letzten Runde", Adresse. **Die Webadresse ist noch nicht festgelegt** (aktuell läuft die App unter `aozcorap.github.io/airbike`). Claude kann die Endkarte bauen, sobald Adresse und Gestaltung klar sind.
4. **Wie kommt der Nutzer an die App?** Der Betreiber will **nicht über den App Store**. Die App ist eine Web-App und wird über die Adresse im Browser geöffnet und zum Home-Bildschirm hinzugefügt. Das muss im Abspann und in der Beschreibung klar und einfach erklärt werden (z. B. Adresse oder QR-Code). Betreiber macht sich dazu noch Gedanken.
5. **Untertitel** im Schnitt (Deutsch, evtl. zusätzlich Englisch).
6. **Musik:** Wenn die KI-Musik im Video bleibt, Nutzungsrechte klären. Bei eigener Musik Lizenz prüfen.
7. **Rechtliches vor Veröffentlichung:** Rechte am Plan aus dem gekauften PDF, Marke „Nonstop Boxing", Airbike-Foto und Herstellermarke (nur eigene Fotos, nichts aus Händlershops), KI-Kennzeichnung des Videos prüfen.

## Prompt in Kurzform (Quelle: `higgsfield-prompts.md`)

Der vollständige, gültige Prompt steht dort im Abschnitt „EIN-PROMPT-FASSUNG". Er enthält Sound-Design mit lautem Herzschlag, die drei Figuren-Beschreibungen (Airbike, Held, Gegner), die Szenen mit Zeiten und Sprechertext (Englisch), die App-Beats und die Liste „Avoid".
