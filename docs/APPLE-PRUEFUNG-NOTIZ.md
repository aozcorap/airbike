# Text für „Anmerkungen“ der App-Prüfung bei Apple (Stand 21.11.2026, Version 1.0)

Dieser Text steht in App Store Connect bei der Version, Bereich „Informationen zur App-Prüfung“, Feld „Anmerkungen“. Das Demo-Konto (E-Mail und Passwort) steht dort in den Anmeldefeldern und nicht in dieser Datei. Bei Version 1.1 anpassen: Käufe, Werbung, Verein/Gym-Funktion, Datenschutz-Text, und das Video neu aufnehmen. Apple lässt in dieses Feld bis zu 4000 Zeichen zu. Lange Texte nicht tippen lassen, sondern einfügen (Cmd+V), sonst hängt sich der Browser auf.

```text
SUMMARY
Nonstop Boxing is a German-language training app for boxers and fitness athletes who train on an air bike (assault bike). The user enters a fight date (or a training period) and the app builds a week-by-week interval plan up to that date. It offers a guided interval timer with round and rest signals, a fitness test (three 10-second sprints give a personal watt value that sets the training targets), progress tracking and optional training reminders. Target audience: amateur boxers and fitness athletes in Germany, Austria and Switzerland. The interface is German only.

ACCESS / DEMO ACCOUNT
Regular users sign in with a one-time code sent by e-mail (no password). For review there is a demo account with a password; the credentials are in the Sign-in information fields above. On the login screen tap the small link at the bottom, "Anmeldung mit Passwort (App-Prüfung)", then enter the e-mail and password. The demo account is already set up (fight date, test watt). The next session is shown under "Heute"; open it and tap "Start". The timer works without an air bike. Main areas: Heute (today), Plan, Fortschritt (progress), Mehr (more: settings, feedback, privacy policy, imprint).

REGISTRATION, LOGIN, ACCOUNT DELETION (all shown in the attached screen recording)
Registration: tab "Registrieren" > e-mail, year of birth, consent checkbox > "Code senden" > enter the code from the e-mail > two setup steps. Login: e-mail code (see above). Account deletion: Mehr > Einstellungen > scroll to "Gefahrenzone" > "Konto löschen" > confirm with a code sent by e-mail > final confirmation. The account and all stored data are then deleted.

USER-GENERATED CONTENT
Users can send feedback or error reports (Mehr > Fehler melden oder Feedback). The text is published as a public GitHub issue on the developer's repository without name or e-mail address (the privacy policy states this). It is not shown to other users inside the app. There are no profiles, chats, comments or sharing between users, so no in-app reporting or blocking is needed.

PAID CONTENT / PURCHASES
None. Version 1.0 is free and has no in-app purchases, no subscriptions and no advertising.

EXTERNAL SERVICES
- Supabase (account, e-mail code sign-in, database; EU region Frankfurt): stores the account and training progress.
- GitHub: hosts the project web page and receives feedback as public issues through a bridge function in Supabase.
No payment processors, no advertising or analytics/tracking services, no AI services.

REGIONAL DIFFERENCES
The app is offered in Germany, Austria and Switzerland. Features and content are identical in all regions.

REGULATED INDUSTRY / THIRD-PARTY MATERIAL
The app is not part of a regulated industry. It contains no third-party content; all texts, plans and data were created by the developer. A health notice is shown in the app (see a doctor in case of pre-existing conditions; stop at dizziness, chest pain or shortness of breath).

NATIVE FEATURES
Local notifications for optional training reminders (opt-in) and calendar file export; the training plan and timer work offline.

SCREEN RECORDING
Attached: screen recording on a physical iPhone, from app launch through registration, setup, fitness test, timer, progress, plan, settings and account deletion.
```
