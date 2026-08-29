import json
from datetime import date
from urllib.parse import quote
from urllib.request import urlopen

names = ['paraxanthine', 'hypoxanthine', 'xanthine', 'inosine', 'guanosine', 'adenine', 'guanine', 'uric acid']
rows = []
for name in names:
    molecule_url = f'https://www.ebi.ac.uk/chembl/api/data/molecule.json?pref_name__iexact={quote(name)}'
    with urlopen(molecule_url, timeout=12) as response:
        molecules = json.load(response).get('molecules', [])
    if not molecules:
        rows.append({'name': name, 'status': 'NO_MOLECULE', 'moleculeUrl': molecule_url})
        continue
    chembl_id = molecules[0]['molecule_chembl_id']
    activity_url = f'https://www.ebi.ac.uk/chembl/api/data/activity.json?molecule_chembl_id={quote(chembl_id)}&target_chembl_id=CHEMBL318&limit=5'
    with urlopen(activity_url, timeout=12) as response:
        activities = json.load(response).get('activities', [])
    usable = [a for a in activities if a.get('standard_type') in {'Ki', 'IC50', 'EC50', 'Kd'} and a.get('standard_value') and a.get('standard_units')]
    rows.append({'name': name, 'chemblId': chembl_id, 'status': 'A1_ACTIVITY' if usable else 'NO_USABLE_A1_ACTIVITY', 'moleculeUrl': molecule_url, 'activityUrl': activity_url, 'activities': usable[:3], 'retrievedAt': str(date.today())})
print(json.dumps(rows, indent=2))
