# Inlines engine.js into page.src.html -> sudoku-workshop.html (the published page)
# and wraps it in a full HTML document -> preview.html (for local testing).
from pathlib import Path
d = Path(__file__).resolve().parent
page = (d / 'page.src.html').read_text().replace('/*ENGINE*/', (d / 'engine.js').read_text())
(d / 'sudoku-workshop.html').write_text(page)
(d / 'preview.html').write_text('<!doctype html><html><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>\n' + page + '\n</body></html>\n')
print('built sudoku-workshop.html and preview.html')
