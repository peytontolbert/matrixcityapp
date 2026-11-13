"""Read-only export of public Matrix Games asset proofs from a City R2 index.

Run against an already published index; writes no R2 objects or production files.
The output contains only public asset URLs, lengths and content hashes.
"""
import gzip,json,re,sys
source=sys.argv[1]
with (gzip.open(source,'rt') if source.endswith('.gz') else open(source)) as f:
    rows=json.load(f)['files']
allowed=re.compile(r'^(vehicle_audio/|city_audio/|matrix-universe/world-packages/(nohesi-110|nohesi-415-island-v[12])/|physics/assetto-corsa/06_ygt_53_nissan_350z\.json$|custom_vehicles/06_ygt_53_nissan_350z\.json$|models/custom_vehicles/06_ygt_53_nissan_350z/|models/traffic-110-v2/prius-|models/fleet-lods-v4/|models/car-lights-v3/[a-f0-9]{24}\.png$|models_textures/[0-9]+\.webp$)')
index={}
for key,row in rows.items():
    path=re.sub(r'^(?:demo2/)?assets/','',key)
    if key=='nexus_extensions/traffic-life-v1/fleet.json': path='matrixgames/prius.json'
    elif not allowed.match(path):continue
    sha=row.get('sourceSha256','');url=row.get('url','');size=row.get('size')
    if not re.fullmatch('[a-f0-9]{64}',sha) or not url.startswith('https://assets.peytontolbert.com/') or not isinstance(size,int):continue
    index[path]={'bytes':size,'parts':[{'sha256':sha,'bytes':size,'offset':0,'length':size,'url':url}]}
json.dump(index,sys.stdout,separators=(',',':'))
