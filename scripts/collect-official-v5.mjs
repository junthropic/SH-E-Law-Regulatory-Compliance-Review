import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='docs/implementation-v5/official';mkdirSync(root,{recursive:true});
const sources=[
 ['waste-forms.html','https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&lsId=008567'],
 ['notice.html','https://www.moel.go.kr/info/lawinfo/instruction/view.do?bbs_seq=20241201150'],
 ['a07.html','https://www.data.go.kr/data/15141649/openapi.do'],
 ['a08.html','https://www.data.go.kr/data/15156661/openapi.do'],
 ['form5.pdf','https://www.law.go.kr/LSW/flDownload.do?flSeq=169879609&bylClsCd=110202'],
 ['notice.hwpx','https://www.moel.go.kr/common/downloadFile.do?file_seq=20241202005&bbs_seq=20241201150&bbs_id=19&file_ext=hwpx'],
 ['draft.html','https://www.moel.go.kr/info/lawinfo/lawmaking/view.do?bbs_seq=20260900747'],
];
const rows=[];
for(const [file,url] of sources){try{const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000)});const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>20_000_000)throw Error('size');writeFileSync(root+'/'+file,bytes);rows.push({file,url,status:r.status,type:r.headers.get('content-type'),bytes:bytes.length,hash:createHash('sha256').update(bytes).digest('hex'),at:new Date().toISOString(),retrieval:'research-fetch-not-app-pinned-downloader',legalApproval:false});}catch(e){rows.push({file,url,error:e.name,at:new Date().toISOString()});}writeFileSync(root+'/manifest.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.at(-1)));}
