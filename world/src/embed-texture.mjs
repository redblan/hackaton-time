// Offline preparation only: embed a source pack's PNG in a GLB, with no runtime dependencies.
import {readFileSync,writeFileSync} from 'node:fs';
const [file,png]=process.argv.slice(2);
const input=readFileSync(file), length=input.readUInt32LE(12);
const doc=JSON.parse(input.subarray(20,20+length).toString());
for(const image of doc.images??[]) if(image.uri) image.uri=`data:image/png;base64,${readFileSync(png).toString('base64')}`;
const json=Buffer.from(JSON.stringify(doc));
const padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
const tail=input.subarray(20+length), header=Buffer.from(input.subarray(0,20));
header.writeUInt32LE(20+padded.length+tail.length,8);header.writeUInt32LE(padded.length,12);
writeFileSync(file,Buffer.concat([header,padded,tail]));
