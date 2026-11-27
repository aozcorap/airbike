# Offene Punkte – Nonstop Boxing (öffentlich, nur Technik)

Stand: 28.11.2026 (Build 153). Diese Datei liegt in einem öffentlichen Repo und enthält deshalb nur technische Punkte.

**Die vollständige Liste** (Rechtliches, Konten, Verträge, Geschäft, Sicherheit, Store, Videos) liegt im privaten Repo `aozcorap/nonstop-boxing-planung`, lokal unter `/Users/Ahmet/nonstop-boxing-planung`:
- `offene-punkte.md`: alle offenen Punkte, kurz. **Zuerst lesen.**
- `archiv.md`: erledigte, gecancelte, überholte Punkte.
- `snapshot-2026-11-28.md`: eingefrorener Wortlaut der alten Liste. Verweise wie „Rechtlich 5“ oder „Technik 14“ in anderen Dateien beziehen sich auf diesen Wortlaut.

Älterer öffentlicher Verlauf (TestFlight, Einreichung 1.0, Klopfen, Nachbesserungen 1.1): `docs/ARCHIV-OFFENE-PUNKTE.md`.

Regel: Wird ein technischer Punkt erledigt, hier löschen und im Archiv des privaten Repos eintragen. Nichts Erledigtes bleibt hier stehen. Keine Konto-, Bank-, Steuer- oder Rechtsangaben in diese Datei.

## Technisch offen

- **Nicht auf dem iPhone geprüft** (die KI kann das nicht): Content-Security-Policy, Eingabe mit echter Tastatur, Offline-Betrieb, Sprint-Wert-Fenster in der Pause, große Wattzahl im Timer, altersangepasste Wattwerte, Fenster für Mitteilungen und Einstellungen, Klopfen-Klang, Werbung und Einwilligung, Trainer-Seiten, Plan-Reset zwischen zwei Geräten, Trigger für neuen Code beim Löschen eines Boxer-Kontos. Uhrzeit-Format „06:00 PM“ hängt von der Region des Geräts ab.
- **Web-Push (Build 152):** echter Empfang auf einem Handy (Android, iPhone über den Home-Bildschirm) nicht bestätigt. Konto löschen meldet das Browser-Abo nicht ab.
- **Timer im Querformat:** der Text unter der Zeit („Gleich: …“) überdeckt den Start-Knopf (844 × 390).
- **Version 1.1 der iPhone-App:** wird erst gebaut und eingereicht, wenn die Werbung einschaltbar ist. Technische Schritte: `AD_ENABLED = true`, `AD_TESTING = false` in `app.js`, `ATT_AKTIV = true` in `tools/prepare-ios.mjs`, Werbeabsatz in `img/datenschutz.html` von Hand (der Text in der App passt sich selbst an), Marketing-Version in Xcode, „Was ist neu“ aus `NEUES` in `app.js`, neuen Build mit `npm run ios:testflight`. Die Store-App enthält die Web-Dateien fest eingebaut, jede Änderung braucht einen neuen Build.
- **Knopf zum Widerruf der Werbe-Einwilligung** in den Einstellungen (`showPrivacyOptionsForm`) fehlt.
- **Echter In-App-Kauf** nicht gebaut: StoreKit, Play Billing, Prüfung auf dem Server, Käufe wiederherstellen, Ablaufdatum für Vereinspakete, Testfunktionen (`abo_test_kaufen`, `gym_test_paket`) vor dem Start entfernen, `PAYWALL_FUER_ALLE = true`.
- **Admin: Verein löschen** und Verein selbst auflösen oder umbenennen fehlt.
- **Konto sperren statt löschen** fehlt (relevant mit Bezahlung).
- **App-Logo** zeigt einen Tacho, soll ein Airbike zeigen (`icons/`, `ios-assets/`), vor der Einreichung 1.1.
- **Unbestätigte Registrierungen** aufräumen: `docs/DB-AUFRAEUMEN.sql`, optional per `pg_cron`.
- **Supabase-Gratis-Plan:** Projekte mit wenig Aktivität werden pausiert. E-Mail-Versand (Supabase 30 Mails pro Stunde) vor Werbung prüfen.
- **Fachliche Annahmen** (Jugendwerte, Regeln für Rundenzahl und Alter, Wattwerte nach Alter) sind nicht von einem Trainer geprüft.
- **Installation der Web-App** (Android-Installieren-Knopf, iPhone-Anleitung) nicht gebaut.
- **Intro-Video** in der App zeigt den alten Ablauf. Der Trailer braucht höher aufgelöste App-Bilder, Stand in `video/trailer/STAND.md`.
- **Ablage ordnen:** `docs/ORDNUNG.md`, Entscheidungen des Betreibers offen.
