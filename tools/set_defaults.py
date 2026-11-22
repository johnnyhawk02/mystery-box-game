#!/usr/bin/env python3
"""Bake a setup "Copy" (JSON from the game's setup panel) into objects.js (objects) and main.js (camera, DEFAULTS_ID) as the defaults for every device.
   python3 tools/set_defaults.py copy.json NEW_DEFAULTS_ID
Objects missing from the Copy keep their current defaults."""
import json, re, sys, os
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
v = json.load(open(sys.argv[1])); new_id = sys.argv[2]
po = os.path.join(here, 'objects.js'); s = open(po).read()
block = re.search(r"const SETUP_DEFAULTS = \{\n(.*?)\n\};", s, flags=re.S).group(1)
cur = {}
for line in block.splitlines():
    m = re.match(r"\s*(\w+): (\{.*\}),?$", line)
    if m: cur[m.group(1)] = json.loads(re.sub(r"(\w+):", r'"\1":', m.group(2)))
cur.update(v.get('objects', {}))
fmt = lambda o: json.dumps(o, separators=(', ', ': ')).replace('"', '')
objs = ',\n'.join(f"  {k}: {fmt(o)}" for k, o in cur.items())
s = re.sub(r"const SETUP_DEFAULTS = \{\n.*?\n\};", lambda _: "const SETUP_DEFAULTS = {\n" + objs + ",\n};", s, flags=re.S)
open(po, 'w').write(s)
p = os.path.join(here, 'main.js'); s = open(p).read()
if 'camera' in v:
    cam = ', '.join(f"{k}: {json.dumps(x).replace(chr(34), chr(39))}" for k, x in v['camera'].items())
    s = re.sub(r"const CAMERA_DEFAULTS = \{[^}]*\};[^\n]*", lambda _: "const CAMERA_DEFAULTS = {" + cam + "};", s)
s = re.sub(r"const DEFAULTS_ID = '[^']*';", f"const DEFAULTS_ID = '{new_id}';", s)
open(p, 'w').write(s); print('ok', len(cur), 'objects')
