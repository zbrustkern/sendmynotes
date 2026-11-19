import https from 'node:https';

// Node fetch can serialize Origin as "null" in redirect:error mode. Use a
// fixed-destination HTTPS request to keep browser-equivalent Origin and never
// follow a redirect with a project cookie, invite or uploaded fixture.
export async function stagingRequest(url, init={}) {
  const target = new URL(url);
  if (!['https://staging.sendmynotes.com','https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app'].includes(target.origin))
    throw Error('Only the wedding staging origin is accepted.');
  const request = new Request(target,init);
  const payload = request.body ? Buffer.from(await request.arrayBuffer()) : null;
  return new Promise((resolve,reject) => {
    const outgoing=https.request(target,{
      method:request.method,headers:Object.fromEntries(request.headers),signal:request.signal,
    }, incoming=>{
      if (incoming.statusCode>=300 && incoming.statusCode<400) {incoming.resume(); reject(Error('Unexpected staging redirect')); return;}
      const headers=new Headers();
      for (let i=0;i<incoming.rawHeaders.length;i+=2) headers.append(incoming.rawHeaders[i],incoming.rawHeaders[i+1]);
      let length=0;const parts=[];
      incoming.on('data',part=>{
        length+=part.length;
        if(length>24*1024*1024) {incoming.destroy(Error('Oversized staging response'));return;}
        parts.push(part);
      });
      incoming.on('error',reject);
      incoming.on('end',()=>resolve(new Response([204,205,304].includes(incoming.statusCode)?null:Buffer.concat(parts),{status:incoming.statusCode,headers})));
    });
    outgoing.on('error',reject);outgoing.end(payload);
  });
}
