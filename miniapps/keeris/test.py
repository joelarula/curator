import urllib.request
import re
import json

url = 'https://vikerraadio.err.ee/1609710224/kauamangiv'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode('utf-8')
    print("Fetched HTML successfully")
    # write to a file or print some parts
    with open('test_html.html', 'w', encoding='utf-8') as f:
        f.write(html)
except Exception as e:
    print("Error:", e)
