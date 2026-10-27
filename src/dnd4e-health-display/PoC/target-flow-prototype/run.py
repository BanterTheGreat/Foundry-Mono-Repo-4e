"""Serve the throwaway target-flow prototype; no Foundry connection."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path

if __name__ == '__main__':
    directory = str(Path(__file__).resolve().parent)
    print('Target flow prototype: http://localhost:8765/?variant=A', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8765), partial(SimpleHTTPRequestHandler, directory=directory)).serve_forever()
