"""Test-Server für die Web-Version: liefert die App aus dem Repo und ersetzt cloud.js durch die Attrappe (kein Netz, kein Konto).
Aufruf (im Repo-Ordner):  python3 tools/testumgebung/server.py [Port]      Standard-Port: 8140
Dann im Browser: http://localhost:8140/   (siehe README.md)
Service Worker (sw.js) wird gesperrt, damit nichts zwischengespeichert wird. Die App-Dateien werden nicht verändert."""
import http.server, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))  # Repo-Ordner
STUB = os.path.join(HERE, 'cloud-attrappe.js')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8140


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_GET(self):
        p = self.path.split('?')[0]
        if p == '/cloud.js':
            b = open(STUB, 'rb').read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript')
            self.send_header('Content-Length', str(len(b)))
            self.end_headers()
            self.wfile.write(b)
            return
        if p == '/sw.js':
            self.send_response(404)
            self.end_headers()
            return
        return super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


print(f'Test-Server auf http://127.0.0.1:{PORT}/  (Strg+C beendet)')
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
