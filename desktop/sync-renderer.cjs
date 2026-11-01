const fs=require('node:fs'),path=require('node:path');
const source=path.resolve(__dirname,'../app/dist'),target=path.join(__dirname,'renderer');
if(!fs.existsSync(path.join(source,'index.html')))throw Error('Compile o app antes: npm --prefix ../app run build');
fs.mkdirSync(target,{recursive:true});fs.cpSync(source,target,{recursive:true});
