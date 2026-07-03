#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Robust local static server for the KOLKLI webapp (replaces `python -m http.server`).

Why this exists: the plain http.server has no on-disk logging, so when it falls
we have no idea why. It also dumps a traceback (and can wedge) when a browser
aborts a big download such as vendor/ffmpeg-core.wasm or a media file. This server:

  * serves the webapp folder on http://localhost:7000
  * supports HTTP Range requests, so <audio>/<video> seeking / partial loads work
    and stop leaving half-open connections that spam errors
  * treats a client-aborted connection as normal traffic, not a crash
  * writes every access + warning line to server.log, so a fall leaves a trail
  * restarts its own accept loop (and logs the full traceback) if it ever throws
"""

import datetime
import http.server
import os
import socket
import socketserver
import sys
import time
import traceback

PORT = 7000
ROOT = os.path.dirname(os.path.abspath(__file__))
LOGFILE = os.path.join(ROOT, "server.log")

# errors that just mean "the browser hung up" — expected, never fatal
_HANGUP = (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)


def _log(msg):
    line = "[%s] %s" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg)
    try:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()
    except Exception:
        pass
    try:
        with open(LOGFILE, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # --- route http.server's own logging into our file --------------------
    def log_message(self, fmt, *args):
        _log("%s %s" % (self.address_string(), fmt % args))

    def log_error(self, fmt, *args):
        # almost always broken-pipe / reset from navigating away mid-download
        _log("warn %s %s" % (self.address_string(), fmt % args))

    # --- never let a client hang-up bubble up as a crash ------------------
    def handle_one_request(self):
        try:
            super().handle_one_request()
        except _HANGUP:
            self.close_connection = True

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except _HANGUP:
            pass

    # --- HTTP Range support (stdlib SimpleHTTPRequestHandler lacks it) -----
    def send_head(self):
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.isfile(path):
            # let the base class handle dirs / 404s the normal way
            return super().send_head()

        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        try:
            fs = os.fstat(f.fileno())
            size = fs[6]
            start, end = self._parse_range(rng, size)
            if start is None:
                # unsatisfiable range
                f.close()
                self.send_response(416)
                self.send_header("Content-Range", "bytes */%d" % size)
                self.end_headers()
                return None

            self.send_response(206)
            ctype = self.guess_type(path)
            self.send_header("Content-Type", ctype)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
            self.end_headers()
            f.seek(start)
            return _RangeReader(f, end - start + 1)
        except Exception:
            f.close()
            raise

    @staticmethod
    def _parse_range(header, size):
        # only the simple single-range "bytes=start-end" form
        if not header.startswith("bytes="):
            return None, None
        spec = header[6:].split(",")[0].strip()
        if "-" not in spec:
            return None, None
        a, b = spec.split("-", 1)
        try:
            if a == "":
                # suffix: last N bytes
                n = int(b)
                if n == 0:
                    return None, None
                start = max(0, size - n)
                end = size - 1
            else:
                start = int(a)
                end = int(b) if b else size - 1
        except ValueError:
            return None, None
        if start > end or start >= size:
            return None, None
        return start, min(end, size - 1)


class _RangeReader:
    """A limited file wrapper so copyfile() only sends the requested slice."""

    def __init__(self, fileobj, remaining):
        self._f = fileobj
        self._remaining = remaining

    def read(self, amt=-1):
        if self._remaining <= 0:
            return b""
        if amt is None or amt < 0 or amt > self._remaining:
            amt = self._remaining
        data = self._f.read(amt)
        self._remaining -= len(data)
        return data

    def close(self):
        self._f.close()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    # ThreadingMixIn calls this when a handler thread raises; keep it quiet
    # and off the console so one bad request never looks like a crash.
    def handle_error(self, request, client_address):
        etype, evalue = sys.exc_info()[:2]
        if isinstance(evalue, _HANGUP):
            return
        _log("error handling %s: %s" % (client_address, "".join(
            traceback.format_exception_only(etype, evalue)).strip()))


def main():
    _log("=== starting KOLKLI server on http://localhost:%d (root=%s) ===" % (PORT, ROOT))
    while True:
        try:
            httpd = Server(("127.0.0.1", PORT), Handler)
        except OSError as e:
            _log("could not bind port %d (%s) - retrying in 2s" % (PORT, e))
            time.sleep(2)
            continue
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            _log("stopped by user (Ctrl+C)")
            httpd.server_close()
            return
        except Exception:
            _log("accept loop crashed, restarting:\n" + traceback.format_exc())
        finally:
            try:
                httpd.server_close()
            except Exception:
                pass
        time.sleep(1)


if __name__ == "__main__":
    main()
