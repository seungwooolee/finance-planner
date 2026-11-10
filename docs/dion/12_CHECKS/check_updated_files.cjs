// v1.1 studio/CSV regression; current v1.2 question design is checked separately.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const dir=path.join(__dirname,'..','09_UPDATED_FILES');const html=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.endsWith('.html'))),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
for(let i=0;i<scripts.length;i++)new vm.Script(scripts[i],{filename:'script-'+i+'.js'});
let src=scripts[0].replace(/\binit\(\);\s*\}\)\(\);\s*$/,'window.TEST={seed,load,validateImport,parseCSVQuestions,validateQuestionLinks,conditionMatches,visible,modeEnabled,normalizeQuestion,previewInput,setMode:v=>diagnosisMode=v,setAnswers:v=>answers=v,getState:()=>state};})();');
assert(src.includes('window.TEST='),'test scope exposes actual code, skipping init only');
const store=new Map([['lifepath_question_studio_v4_diagnosis_modes','{"questions":[{"key":"old","title":"old"}]}']]);
const context={window:{},console,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},setTimeout,clearTimeout,structuredClone,document:{querySelector:()=>({})}};
vm.runInNewContext(src,context);const t=context.window.TEST;
t.load();assert.equal(t.getState().length,40,'old114 storage never overrides new40');
const seed=t.seed;assert.equal(new Set(seed.map(q=>q.designId)).size,40);assert.equal(seed.filter(q=>q.mode==='simple').length,11);
const csv=fs.readFileSync(path.join(dir,'LifePath_Question_Table_Starter.csv'),'utf8');const qs=t.parseCSVQuestions(csv);assert.equal(qs.length,40);t.validateQuestionLinks(qs);
for(let i=0;i<40;i++){assert.equal(qs[i].title,seed[i].title);assert.equal(qs[i].designId,seed[i].designId);assert.equal(JSON.stringify(qs[i].sourceRow),JSON.stringify(seed[i].sourceRow));assert.equal(JSON.stringify(qs[i].optionGroups),JSON.stringify(seed[i].optionGroups));}
const bundle=JSON.parse(fs.readFileSync(path.join(dir,'reference','DION_Question_Source_v1_1.json'),'utf8'));assert.equal(bundle.sheets['질문 수정안'].length-1,40);assert.equal(bundle.sheets['선택지 목록'].length-1,304);
const parent=qs.find(q=>q.designId==='N01'),child=qs.find(q=>q.designId==='F08');const opts=Object.values(parent.optionGroups)[0],field=Object.keys(parent.optionGroups)[0];
t.setMode('simple');for(const opt of opts){t.setAnswers({[parent.key]:{[field]:opt.value}});assert.equal(t.visible(child),/^(예|모름|잘 모르)/.test(opt.label),'property branch '+opt.label);}
t.setAnswers({});assert.equal(t.visible(child),false,'unanswered is not no/yes');assert.equal(t.visible(qs.find(q=>q.designId==='D19')),false,'product gate never bypassed');
t.setMode('detailed');assert.equal(t.modeEnabled(qs.find(q=>q.designId==='NEW-01')),true,'deep direct entry allowed');
const income=qs.find(q=>q.designId==='F03');t.setAnswers({[income.key]:{amounts:{netIncome:{state:'KNOWN',raw:'0'}}}});assert(t.previewInput(income).includes('value="0"'),'actual zero shown rather than blank');
const norm=t.normalizeQuestion({...income,title:'local edit'});assert.equal(norm.designId,'F03');assert(norm.sourceRow.length===18,'editing retains original source row');
for(const n of ['.gitignore','.gitattributes','py'])assert(fs.readFileSync(path.join(dir,n)).equals(fs.readFileSync(path.join(__dirname,'..','08_ORIGINAL_INPUTS',n))),n+' unchanged');
console.log('PASS: script syntax ('+scripts.length+'),40 IDs,11 quick basics,CSV lossless roundtrip304 options,legacy storage isolation,property branches,unknown/zero,deep entry,product gate,edit metadata,3 unchanged files.');
