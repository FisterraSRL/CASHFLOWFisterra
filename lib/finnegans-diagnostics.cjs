'use strict';

function reportDiagnostics(url,response,text,token){
  const masked=new URL(url);masked.searchParams.set('ACCESS_TOKEN','[OCULTO]');
  let safe=String(text).replaceAll(token,'[OCULTO]').replaceAll(encodeURIComponent(token),'[OCULTO]');
  safe=safe.replace(/("(?:access_token|client_secret|secret_key)"\s*:\s*")[^"]*(")/gi,'$1[OCULTO]$2');
  const limit=32768;
  return {
    method:'GET',
    url:masked.toString().replace('%5BOCULTO%5D','[OCULTO]'),
    parameters:Object.fromEntries(masked.searchParams),
    status:response.status,
    contentType:response.headers.get('content-type')||'No informado',
    receivedAt:new Date().toISOString(),
    responseBody:safe.slice(0,limit),
    responseTruncated:safe.length>limit,
    responseCharacters:safe.length,
  };
}
module.exports={reportDiagnostics};
