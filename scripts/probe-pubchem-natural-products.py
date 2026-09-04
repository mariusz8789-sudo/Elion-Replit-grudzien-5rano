import json
from datetime import date
from urllib.parse import quote
from urllib.request import urlopen

names = ['theobromine', 'paraxanthine', 'hypoxanthine', 'xanthine', 'inosine', 'guanosine', 'adenine', 'guanine', 'uric acid']
rows = []
for name in names:
    url = f'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{quote(name)}/property/Title,CanonicalSMILES,InChIKey,MolecularFormula,MolecularWeight/JSON'
    with urlopen(url, timeout=12) as response:
        data = json.load(response)
    row = data['PropertyTable']['Properties'][0]
    rows.append({'query': name, **row, 'sourceUrl': url, 'retrievedAt': str(date.today())})
print(json.dumps(rows, indent=2))
