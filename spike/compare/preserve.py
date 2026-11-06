"""Preserve private raw evidence outside the checkout; commit only sanitized copies."""
from pathlib import Path
import json,re,hashlib,zipfile,datetime,struct,socket
base=Path(__file__).resolve().parent
repo=base.parent.parent
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
destination=Path.home()/'Documents'/'Litzio-spike-evidence'/('1315-'+stamp)
destination.mkdir(parents=True,exist_ok=False)
raw_names=['attempt2.json','attempt3.json','boundaries.log','browser.log','build.log','cleanup.json','evidence.json','host.log','live.json','location.json','measurements.json','process-measurements.json','targeted-tests.log']
files=[(base/n,'compare/'+n) for n in raw_names if (base/n).is_file()]
files += [(p,'compare/'+p.name) for p in base.glob('*.png')]
trace=repo/'tmp'/'browser-results'
if trace.exists():files += [(p,'browser-results/'+p.relative_to(trace).as_posix()) for p in trace.rglob('*') if p.is_file()]
records=[]
archive=destination/'raw-evidence.zip'
with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED) as out:
 for p,rel in files:
  data=p.read_bytes();out.writestr(rel,data);records.append(dict(file=rel,bytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
with zipfile.ZipFile(archive) as check:
 assert check.testzip() is None
 for record in records:assert hashlib.sha256(check.read(record['file'])).hexdigest()==record['sha256']
private=dict(archive=str(archive),sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),files=records)
(base/'preservation.json').write_text(json.dumps(private,indent=2),encoding='utf-8')
output=base/'evidence';output.mkdir(exist_ok=True)
# Replace actual roots before normalizing any remaining private local file references.
repo_windows=str(repo);repo_url=repo.as_uri()
def clean(s):
 s=s.replace(repo_url,'file:///<WORKTREE>').replace(repo_windows,'<WORKTREE>').replace(repo_windows.replace('\\','/'),'<WORKTREE>')
 s=re.sub(r'[A-Za-z]:[\\/]Users[\\/][^\\/\s"<>]+[\\/]AppData[\\/]Local[\\/]Temp[\\/]litzio-nist-1315-[^\\/\s"<>]+', '<FIXTURE_ROOT>', s, flags=re.I)
 # Other absolute paths (e.g. Windows executable paths) are not needed as evidence.
 s=re.sub(r'[A-Za-z]:[\\/][^\r\n"<>]*', '<LOCAL_PATH>',s)
 for private_name in [Path.home().name,socket.gethostname()]:
  s=re.sub(re.escape(private_name),'<REDACTED>',s,flags=re.I)
 return s

def transform(x):
 if isinstance(x,str):return clean(x)
 if isinstance(x,list):return [transform(v) for v in x]
 if isinstance(x,dict):return {clean(k):transform(v) for k,v in x.items()}
 return x
for n in raw_names:
 p=base/n
 if not p.exists() or n in ['live.json','host.log']:continue
 if p.suffix=='.json':(output/n).write_text(json.dumps(transform(json.loads(p.read_text(encoding='utf-8-sig'))),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 else:(output/(p.stem+'.txt')).write_text('\n'.join(line.rstrip() for line in clean(p.read_text(encoding='utf-8-sig')).splitlines()).rstrip()+'\n',encoding='utf-8')
# Preserve evidence bytes, not private paths; the archive location stays in ignored preservation.json.
(output/'raw-preservation.json').write_text(json.dumps(dict(archive='Private external raw-evidence.zip; local location is in ignored preservation.json',sha256=private['sha256'],verified=True,files=records),indent=2)+'\n',encoding='utf-8')
# Playwright PNGs should contain only raster/format chunks, no private text metadata.
chunks={}
for p in base.glob('*.png'):
 data=p.read_bytes();offset=8;types=[]
 while offset<len(data):
  length=struct.unpack('>I',data[offset:offset+4])[0];kind=data[offset+4:offset+8].decode('ascii');types.append(kind);offset+=length+12
 assert not set(types)&{'tEXt','zTXt','iTXt','eXIf'}, (p.name,types)
 chunks[p.name]=sorted(set(types))
(output/'png-metadata.json').write_text(json.dumps(chunks,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(archive=str(archive),sha256=private['sha256'],files=len(records),bytes=archive.stat().st_size)))
