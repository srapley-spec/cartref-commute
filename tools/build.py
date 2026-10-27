"""Build index.html (hosted page) from src/app.html (page content, also used for the claude.ai preview)."""
import re,pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
src=(ROOT/"src"/"app.html").read_text()
head='''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#17201B">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Commute">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}</style>
'''
# move title/meta/link/style into head, rest in body
m=re.search(r'</style>\n',src); split=m.end()
(ROOT/"index.html").write_text(head+src[:split]+"</head>\n<body>\n"+src[split:]+"\n</body>\n</html>\n")
