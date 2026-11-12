import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const prohibited=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/GOCSPX-[A-Za-z0-9_-]{16,}/,/gh[pousr]_[A-Za-z0-9]{30,}/,/github_pat_[A-Za-z0-9_]{30,}/,/AKIA[A-Z0-9]{16}/,/192\.168\.\d+\.\d+/];
let bad=false;
for(const file of new Set(files)){
 if(/(^|\/)(?:\.env(?:\..*)?|client_secret[^/]*|[^/]*\.(?:pem|key))$/.test(file)){console.error('Private file:',file);bad=true;continue;}
 const value=await readFile(file,'utf8');
 if(prohibited.some(re=>re.test(value))){console.error('Potential private material:',file);bad=true;}
}
if(bad)process.exit(1);
console.log(`Checked ${files.length} public source files; no prohibited patterns found`);
