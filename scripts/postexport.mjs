import {copyFileSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
// Keep the latest main's manifest and Web Share Target intact.
const path='dist/index.html';let html=readFileSync(path,'utf8');
if(!html.includes('href="/manifest.json"'))html=html.replace('</head>','<link rel="manifest" href="/manifest.json"></head>');
writeFileSync(path,html);copyFileSync(path,'dist/share-target.html');
for(const file of ['sw.js','manifest.json','icon.png'])if(!existsSync('dist/'+file))throw Error('Missing web asset: '+file);
