#!/usr/bin/env python3
"""Simple local server for pranav-exe. Run: python3 serve.py"""
import http.server, socketserver, os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()
    def log_message(self, fmt, *args):
        pass  # Silent

print(f"  PRANAV.EXE running at http://localhost:{PORT}")
print(f"  Press Ctrl+C to stop\n")
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
