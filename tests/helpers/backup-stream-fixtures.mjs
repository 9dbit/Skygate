// Small fixture bodies only. Production backup paths never collect complete archives.
export async function collectBody(body){
 if(Buffer.isBuffer(body)||typeof body==='string'||body instanceof Uint8Array)return Buffer.from(body);
 const chunks=[];for await(const chunk of body)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);
}
