# E-Mail-Vorlagen für Nonstop Boxing (Supabase)

So übernimmst du sie (ca. 5 Minuten, kostenlos):

1. Supabase öffnen, Projekt **last-round** wählen.
2. Links **Authentication** → **Emails** → Reiter **Templates**.
3. Je Vorlage unten: Betreff in das Feld **Subject** einfügen, den HTML-Block in das Feld **Message body** (alten Inhalt vorher löschen), dann **Save**.
4. Nicht ändern: die Platzhalter in doppelten geschweiften Klammern (`{{ .ConfirmationURL }}`, `{{ .NewEmail }}`). Sie ersetzt Supabase selbst.

Hinweis: Absender ("Supabase Auth, noreply@mail.app.supabase.io") ändert sich dadurch nicht. Dafür braucht es einen eigenen E-Mail-Dienst (siehe `OFFENE-PUNKTE.md`).

**Wichtig (Code statt Link):** Die Vorlagen 1 und 2 enthalten jetzt `{{ .Token }}`, den Zahlen-Code, den man in der App eintippt. Ein Link in der E-Mail öffnet immer den Browser, nie die installierte App (auf dem iPhone technisch nicht möglich). Beide Vorlagen müssen in Supabase ersetzt werden, sonst steht in der E-Mail kein Code. Länge des Codes: Supabase → Authentication → Sign In / Providers → Email → „Email OTP Length“ (Standard 6, die App akzeptiert 6 bis 10 Ziffern).

**Neu: Anmeldung per Code.** Die App meldet standardmäßig mit einem Code an (kein Passwort nötig). Neue Konten bekommen dabei die Vorlage 1 (Confirm signup), bestehende Konten die Vorlage 4 (Magic link). Beide müssen `{{ .Token }}` enthalten. Vorlage 2 (Reset password) wird von der App nicht mehr ausgelöst, nur alte Links funktionieren noch.

## 1. Confirm signup (Konto bestätigen)

**Subject:**

```
Bestätige dein Konto bei Nonstop Boxing
```

**Message body:**

```html
<div style="background:#f3f4f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;">
    <tr><td style="background:#07080c;padding:22px 24px;text-align:center;">
      <span style="font-size:22px;font-weight:800;letter-spacing:3px;color:#ffffff;">NONSTOP <span style="color:#ff2d46;">BOXING</span></span><br>
      <span style="font-size:11px;letter-spacing:2px;color:#b8bcc8;">MEHR KONDITION BIS ZUR LETZTEN RUNDE</span>
    </td></tr>
    <tr><td style="padding:28px 24px 8px;color:#111827;">
      <h1 style="margin:0 0 12px;font-size:22px;">Willkommen bei Nonstop Boxing</h1>
      <p style="margin:0 0 22px;font-size:16px;line-height:1.5;">Noch ein Schritt: Gib diesen Code in der App ein, dann ist deine E-Mail-Adresse bestätigt.</p>
      <p style="margin:0 0 6px;font-size:14px;color:#374151;">Dein Code für die App:</p>
      <p style="margin:0 0 22px;text-align:center;font-size:34px;font-weight:800;letter-spacing:8px;color:#111827;">{{ .Token }}</p>
      <p style="margin:0 0 22px;text-align:center;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#ff2d46;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:10px;">Alternativ im Browser bestätigen</a></p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280;">Der Code und der Link gelten nur kurze Zeit. Der Link öffnet den Browser, nicht die App. Funktioniert der Knopf nicht, kopiere diesen Link in deinen Browser:<br><span style="word-break:break-all;">{{ .ConfirmationURL }}</span></p>
<p style="margin:22px 0 4px;font-size:16px;line-height:1.5;color:#111827;">Sportliche Grüße<br><b>Dein Nonstop-Boxing-Team</b></p>
    </td></tr>
    <tr><td style="padding:12px 24px 24px;font-size:12px;line-height:1.5;color:#9ca3af;">Du erhältst diese E-Mail, weil sich jemand mit dieser Adresse bei Nonstop Boxing angemeldet hat. Wenn du das nicht warst, ignoriere diese Nachricht.</td></tr>
  </table>
</div>
```

## 2. Reset password (Passwort zurücksetzen)

**Subject:**

```
Passwort zurücksetzen – Nonstop Boxing
```

**Message body:**

```html
<div style="background:#f3f4f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;">
    <tr><td style="background:#07080c;padding:22px 24px;text-align:center;">
      <span style="font-size:22px;font-weight:800;letter-spacing:3px;color:#ffffff;">NONSTOP <span style="color:#ff2d46;">BOXING</span></span><br>
      <span style="font-size:11px;letter-spacing:2px;color:#b8bcc8;">MEHR KONDITION BIS ZUR LETZTEN RUNDE</span>
    </td></tr>
    <tr><td style="padding:28px 24px 8px;color:#111827;">
      <h1 style="margin:0 0 12px;font-size:22px;">Neues Passwort festlegen</h1>
      <p style="margin:0 0 22px;font-size:16px;line-height:1.5;">Du hast ein neues Passwort für dein Konto angefordert. Gib diesen Code in der App ein und wähle ein neues Passwort.</p>
      <p style="margin:0 0 6px;font-size:14px;color:#374151;">Dein Code für die App:</p>
      <p style="margin:0 0 22px;text-align:center;font-size:34px;font-weight:800;letter-spacing:8px;color:#111827;">{{ .Token }}</p>
      <p style="margin:0 0 22px;text-align:center;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#ff2d46;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:10px;">Alternativ im Browser festlegen</a></p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280;">Wenn du das nicht angefordert hast, ignoriere diese E-Mail. Dein Passwort bleibt dann unverändert.<br>Funktioniert der Knopf nicht, kopiere diesen Link in deinen Browser:<br><span style="word-break:break-all;">{{ .ConfirmationURL }}</span></p>
<p style="margin:22px 0 4px;font-size:16px;line-height:1.5;color:#111827;">Sportliche Grüße<br><b>Dein Nonstop-Boxing-Team</b></p>
    </td></tr>
    <tr><td style="padding:12px 24px 24px;font-size:12px;line-height:1.5;color:#9ca3af;">Du erhältst diese E-Mail, weil sich jemand mit dieser Adresse bei Nonstop Boxing angemeldet hat. Wenn du das nicht warst, ignoriere diese Nachricht.</td></tr>
  </table>
</div>
```

## 3. Change email address (E-Mail-Adresse ändern)

**Subject:**

```
Neue E-Mail-Adresse bestätigen – Nonstop Boxing
```

**Message body:**

```html
<div style="background:#f3f4f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;">
    <tr><td style="background:#07080c;padding:22px 24px;text-align:center;">
      <span style="font-size:22px;font-weight:800;letter-spacing:3px;color:#ffffff;">NONSTOP <span style="color:#ff2d46;">BOXING</span></span><br>
      <span style="font-size:11px;letter-spacing:2px;color:#b8bcc8;">MEHR KONDITION BIS ZUR LETZTEN RUNDE</span>
    </td></tr>
    <tr><td style="padding:28px 24px 8px;color:#111827;">
      <h1 style="margin:0 0 12px;font-size:22px;">Neue E-Mail-Adresse bestätigen</h1>
      <p style="margin:0 0 22px;font-size:16px;line-height:1.5;">Bitte bestätige, dass dein Konto künftig diese E-Mail-Adresse nutzen soll: <b>{{ .NewEmail }}</b>.</p>
      <p style="margin:0 0 22px;text-align:center;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#ff2d46;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:10px;">Neue Adresse bestätigen</a></p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280;">Funktioniert der Knopf nicht, kopiere diesen Link in deinen Browser:<br><span style="word-break:break-all;">{{ .ConfirmationURL }}</span></p>
<p style="margin:22px 0 4px;font-size:16px;line-height:1.5;color:#111827;">Sportliche Grüße<br><b>Dein Nonstop-Boxing-Team</b></p>
    </td></tr>
    <tr><td style="padding:12px 24px 24px;font-size:12px;line-height:1.5;color:#9ca3af;">Du erhältst diese E-Mail, weil sich jemand mit dieser Adresse bei Nonstop Boxing angemeldet hat. Wenn du das nicht warst, ignoriere diese Nachricht.</td></tr>
  </table>
</div>
```


## 4. Magic link (Anmeldung per Code, bestehende Konten)

Supabase: Authentication → Emails → Templates → **Magic link**.

**Subject:**

```
Dein Anmelde-Code für Nonstop Boxing
```

**Message body:**

```html
<div style="background:#f3f4f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;">
    <tr><td style="background:#07080c;padding:22px 24px;text-align:center;">
      <span style="font-size:22px;font-weight:800;letter-spacing:3px;color:#ffffff;">NONSTOP <span style="color:#ff2d46;">BOXING</span></span><br>
      <span style="font-size:11px;letter-spacing:2px;color:#b8bcc8;">MEHR KONDITION BIS ZUR LETZTEN RUNDE</span>
    </td></tr>
    <tr><td style="padding:28px 24px 8px;color:#111827;">
      <h1 style="margin:0 0 12px;font-size:22px;">Dein Anmelde-Code</h1>
      <p style="margin:0 0 22px;font-size:16px;line-height:1.5;">Gib diesen Code in der App ein, dann bist du angemeldet.</p>
      <p style="margin:0 0 22px;text-align:center;font-size:34px;font-weight:800;letter-spacing:8px;color:#111827;">{{ .Token }}</p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280;">Der Code gilt nur kurze Zeit. Wenn du dich nicht anmelden wolltest, ignoriere diese E-Mail.</p>
<p style="margin:22px 0 4px;font-size:16px;line-height:1.5;color:#111827;">Sportliche Grüße<br><b>Dein Nonstop-Boxing-Team</b></p>
    </td></tr>
  </table>
</div>
```
