#!/usr/bin/env python3
"""Simple local server for pranav-exe. Run: python3 serve.py"""
import http.server, socketserver, os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, fmt, *args):
        pass  # Silent

print(f"  PRANAV.EXE running at http://localhost:{PORT}")
print(f"  Press Ctrl+C to stop\n")
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
