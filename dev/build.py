#!/usr/bin/env python3
"""Build the self-contained index.html from dev/game.html.

    cd dev
    npm i tailwindcss@3.4.17 @fontsource/inter@5 @fontsource/jetbrains-mono@5
    python3 build.py game.html ../index.html

Inlines the two fonts (latin subset) as data URLs and Tailwind CSS compiled for exactly the
classes the page uses. Neither the source nor the result loads anything from third-party
servers; the page only talks to the chain RPC.
"""
import base64, os, subprocess, sys

src, out = sys.argv[1], sys.argv[2]
UNICODE = ('U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,'
           'U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD')
faces = []
for fam, folder, weights in [('Inter', 'inter', [400, 600, 700, 900]), ('JetBrains Mono', 'jetbrains-mono', [400, 600, 700, 800])]:
    for w in weights:
        data = open(f'node_modules/@fontsource/{folder}/files/{folder}-latin-{w}-normal.woff2', 'rb').read()
        faces.append("@font-face{font-family:'%s';font-style:normal;font-weight:%d;font-display:swap;"
                     "src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s;}" % (fam, w, base64.b64encode(data).decode(), UNICODE))

s = open(src).read()
for bad in ('cdn.tailwindcss', 'fonts.googleapis', 'fonts.gstatic', '<script src='):
    assert bad not in s, f'{src} must not load {bad}'
a = s.index('  <!-- dev/build.py puts the bundled fonts here')
b = s.index('-->', a) + len('-->')
s = s[:a] + '  <!-- Inter and JetBrains Mono (SIL Open Font License 1.1), latin subset, bundled -->\n  <style>' + ''.join(faces) + '</style>' + s[b:]

open('page.html', 'w').write(s)
open('in.css', 'w').write('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n')
open('tailwind.config.js', 'w').write("module.exports = { content: ['./page.html'], theme: { extend: {} }, plugins: [] };\n")
subprocess.run(['npx', 'tailwindcss', '-i', 'in.css', '-o', 'tw.css', '--minify'], check=True, capture_output=True)
s = s.replace('</head>', '  <!-- Tailwind CSS v3.4.17 (MIT), compiled for exactly the classes this page uses -->\n  <style>' + open('tw.css').read() + '</style>\n</head>', 1)
for bad in ('cdn.tailwindcss', 'fonts.googleapis', 'fonts.gstatic', '<script src='):
    assert bad not in s, bad
for f in ('page.html', 'in.css', 'tw.css', 'tailwind.config.js'):
    os.remove(f)
open(out, 'w').write(s)
print(f'{out}: {len(s) // 1024} KB')
