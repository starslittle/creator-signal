import {spawnSync} from 'node:child_process';
import {rmSync} from 'node:fs';
rmSync('creator-signal-extension.zip',{force:true});
const result=spawnSync('zip',['-rq','creator-signal-extension.zip','extension','README.md'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
console.log('已生成 creator-signal-extension.zip；解压后加载 extension 文件夹。');
