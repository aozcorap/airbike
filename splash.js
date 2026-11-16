// Startbild nur beim ersten Öffnen einer Sitzung zeigen (als eigene Datei, damit die Content-Security-Policy keine Inline-Skripte erlauben muss)
try {
  if (sessionStorage.getItem('rl-splash')) document.getElementById('splash').remove();
  else sessionStorage.setItem('rl-splash', '1');
} catch (e) {
  /* ohne Speicher: Startbild bleibt */
}
