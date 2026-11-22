#!/usr/bin/env python3
"""Record every spoken line of the games with Azure's "Sonia" voice (en-GB-SoniaNeural) as small mp3s.

    python3 tools/make_voice.py            # records only the lines that are missing
    python3 tools/make_voice.py --all      # records everything again

The Azure key never goes in the repo. It is read from ~/.config/azure-speech/robyn-aac.env, which holds:
    AZURE_SPEECH_KEY=...
    AZURE_SPEECH_REGION=uksouth        (the "Location/Region" on the Azure Keys and Endpoint page)
Clips go to assets/voice/sonia/<slug>.mp3 with an index.json the games read (slug as in voice.js)."""
import json, os, re, sys, time, urllib.request
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, 'assets', 'voice', 'sonia')
KEYFILE = os.path.expanduser('~/.config/azure-speech/robyn-aac.env')
VOICE = 'en-GB-SoniaNeural'

def slug(t): return re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', t.lower()))

def lines():
    src = open(os.path.join(HERE, 'objects.js')).read()
    objs = re.findall(r"letter: '([A-Z])', word: '([^']+)'", src)
    out = []
    for letter, word in objs:
        out += [word, f'Find the {word}', f'{letter} is for {word}']
    return out

def ssml(text):
    # a touch slower than normal, for a young listener
    return (f"<speak version='1.0' xml:lang='en-GB'><voice name='{VOICE}'>"
            f"<prosody rate='-12%'>{escape(text)}</prosody></voice></speak>")

def main():
    cfg = {}
    try:
        for ln in open(KEYFILE):
            if '=' in ln: k, v = ln.strip().split('=', 1); cfg[k.strip()] = v.strip().strip('"\'')
    except FileNotFoundError:
        sys.exit(f'No key file. Put AZURE_SPEECH_KEY=... and AZURE_SPEECH_REGION=... in {KEYFILE}')
    key, region = cfg.get('AZURE_SPEECH_KEY'), cfg.get('AZURE_SPEECH_REGION')
    if not key or not region: sys.exit(f'{KEYFILE} needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION')
    os.makedirs(OUT, exist_ok=True)
    redo = '--all' in sys.argv
    url = f'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1'
    made = 0
    for text in lines():
        path = os.path.join(OUT, slug(text) + '.mp3')
        if os.path.exists(path) and not redo: continue
        req = urllib.request.Request(url, data=ssml(text).encode('utf-8'), method='POST', headers={
            'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'mystery-box-voice'})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=30) as r: data = r.read()
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 503) and attempt < 3: time.sleep(2 ** attempt); continue
                sys.exit(f'Azure said {e.code} for "{text}": {e.read()[:200]!r}')
        open(path, 'wb').write(data); made += 1
        print('recorded', text)
    have = sorted(f[:-4] for f in os.listdir(OUT) if f.endswith('.mp3'))
    json.dump(have, open(os.path.join(OUT, 'index.json'), 'w'))
    print(f'{made} new, {len(have)} clips in all')

if __name__ == '__main__':
    main()
