import subprocess,json,pathlib,tempfile,hashlib
sha='ce90560aacaee2482d37c4b25e36e93060ed156c'
root=pathlib.Path(tempfile.mkdtemp(prefix='litzio-nist-1315-'))
files=subprocess.check_output(['git','ls-tree','-r','--name-only',sha,'plugins/docling/test/fixtures/nist-sp1108r4']).decode().splitlines()
records=[]
for file in files:
 rel=file.split('nist-sp1108r4/')[1]
 if rel!='document.json' and not rel.endswith('.png'): continue
 data=subprocess.check_output(['git','show',sha+':'+file]); dest=root/rel; dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes(data)
 records.append(dict(file=rel,bytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
pathlib.Path('spike/compare/location.json').write_text(json.dumps(dict(root=str(root),files=records),indent=2))
print(str(root))
