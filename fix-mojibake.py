# -*- coding: utf-8 -*-
"""
Repairs Windows-1255 (Hebrew ANSI) mojibake in a UTF-8 HTML/JS file.

Cause: UTF-8 Hebrew/Russian bytes were decoded as Windows-1255 and re-saved as
UTF-8, turning e.g.  Hebrew word for "management"  ->  a run of  geresh + junk.
This happens when an editor saves the file as ANSI/Windows-1255 instead of UTF-8.

This reverses ONLY corrupted runs: valid Hebrew/Russian, emoji, arrows and other
real symbols are left untouched. Safe to run repeatedly (idempotent) and safe to
run on already-clean files (it reports "no corruption found" and changes nothing).

Usage:  python fix-mojibake.py dashboard.html [more-files ...]
        # writes in place, keeping the BOM + CRLF line endings,
        # and saves a <file>.bak backup only when it actually repairs something.
"""
import sys, re, shutil

GERESH = chr(0x05F3)  # the tell-tale char each corrupted Hebrew letter starts with

# Inverse of the cp1255-decode corruption (handles C1 control slots the encoder rejects)
inv = {}
for b in range(256):
    try:
        inv.setdefault(bytes([b]).decode('cp1255'), b)
    except UnicodeDecodeError:
        pass
for b in range(0x80, 0xA0):           # C1 passthrough for cp1255-undefined slots
    inv.setdefault(chr(b), b)

run_re = re.compile(r'[^\x00-\x7f]+')  # maximal non-ASCII runs

def fix_run(m):
    s = m.group(0)
    if any(c not in inv for c in s):   # real emoji / symbol -> leave
        return s
    try:
        return bytes(inv[c] for c in s).decode('utf-8')  # strict; valid Hebrew fails -> leave
    except UnicodeDecodeError:
        return s

def suspect(t):
    return sum(1 for c in t if c == GERESH or 0x80 <= ord(c) <= 0x9f)

def main(path):
    raw = open(path, 'rb').read()
    had_bom = raw[:3] == b'\xef\xbb\xbf'
    text = raw.decode('utf-8-sig')
    before = suspect(text)
    fixed = run_re.sub(fix_run, text)
    after = suspect(fixed)
    if fixed == text:
        print(f'{path}: no corruption found (suspect={before}). Unchanged.')
        return
    shutil.copyfile(path, path + '.bak')
    out = (b'\xef\xbb\xbf' if had_bom else b'') + fixed.encode('utf-8')
    open(path, 'wb').write(out)
    print(f'{path}: repaired. corruption {before} -> {after}. Backup: {path}.bak')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('usage: python fix-mojibake.py <file> [<file> ...]'); sys.exit(1)
    for p in sys.argv[1:]:
        main(p)
