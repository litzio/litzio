from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
os.chdir(Path(__file__).resolve().parents[4])
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path == '/':
   self.send_response(200)
   self.send_header('Content-Type','text/html')
   self.end_headers()
   self.wfile.write(b'<html><span data-testid="status" data-operation="ready"></span></html>')
  elif self.path == '/favicon.ico':
   self.send_response(204)
   self.end_headers()
  else: super().do_GET()
if __name__ == '__main__':
 ThreadingHTTPServer(('127.0.0.1',5391),Handler).serve_forever()
