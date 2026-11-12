"""Validate report OOXML and replay its captured result snapshots without rewriting."""
from pathlib import Path
import argparse,json,sys,zipfile,hashlib
import xml.etree.ElementTree as ET
HERE=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--base-root',type=Path,required=True);args=p.parse_args()
sys.path.insert(0,str(args.base_root.resolve()/'backend'))
from app.planning import run_engine
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W='{'+ns['w']+'}'
checks=[]
def check(name,ok):
 if not ok:raise AssertionError(name)
 checks.append(name)
source=json.loads((HERE/'evidence/document-source.json').read_text())
for name in ['initial','revised','partial']:
 s=json.loads((HERE/f'evidence/{name}-snapshot.json').read_text())
 check(name+' engine replay equals saved output',run_engine(s['engine_input'])==s['engine_output'])
 check(name+' input snapshot identity',s['engine_input']['context']['snapshot_id']==s['raw_snapshot_id'])
 check(name+' question source revision retained',all('@'in r for o in s['engine_output']['results'].values() for r in o['source_refs']))
with zipfile.ZipFile(HERE/'B안_DION_참가작.docx') as z:
 check('no duplicate OOXML parts',len(z.namelist())==len(set(z.namelist())))
 root=ET.fromstring(z.read('word/document.xml'));styles=ET.fromstring(z.read('word/styles.xml'))
 for s in root.findall('.//w:sectPr',ns):
  margins=s.find('w:pgMar',ns)
  check('all margins 20mm',all(abs(int(margins.get(W+k))-1134)<=1 for k in ['left','right','top','bottom']))
  size=s.find('w:pgSz',ns);check('A4',size.get(W+'w')=='11906'and size.get(W+'h')=='16838')
 # Word serializes built-in heading names in lower case in this template.
 named={s.find('w:name',ns).get(W+'val').casefold():s for s in styles.findall('w:style',ns) if s.find('w:name',ns)is not None}
 for name,size in [('Normal',20),('Title',26),('Heading 1',22),('Heading 2',22)]:
  style=named[name.casefold()]
  r=style.find('w:rPr',ns);check(name+' font size',r.find('w:sz',ns).get(W+'val')==str(size))
  check(name+' Malgun Gothic',r.find('w:rFonts',ns).get(W+'eastAsia')=='맑은 고딕')
  sp=style.find('w:pPr/w:spacing',ns);check(name+' Word 1.5',sp.get(W+'line')=='360'and sp.get(W+'lineRule')=='auto')
  if name!='Normal':check(name+' bold',r.find('w:b',ns)is not None)
 text=''.join(root.itertext());check('document uses captured snapshot',source['snapshot_id']in text)
 check('native footnotes', 'word/footnotes.xml'in z.namelist())
 check('official AI usage table five columns',any(len(t.find('w:tr',ns).findall('w:tc',ns))==5 for t in root.findall('.//w:tbl',ns)))
 core=z.read('docProps/core.xml').decode();check('no participant name in author metadata','<dc:creator/>'in core or '<dc:creator></dc:creator>'in core)
 print(json.dumps({'status':'PASS','check_count':len(checks),'checks':checks,'document_sha256':hashlib.sha256((HERE/'B안_DION_참가작.docx').read_bytes()).hexdigest()},ensure_ascii=False,indent=2))
