export class ApiError extends Error { constructor(public status:number,public code:string){super(code);} }
export async function request(path:string, method="GET", body?:unknown, token?:string, signal?:AbortSignal) {
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  signal?.addEventListener("abort",cancel,{once:true});
  if(signal?.aborted)cancel();
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},20000);
  try {
    const response=await fetch(path,{method,body:body===undefined?undefined:JSON.stringify(body),headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},cache:"no-store",signal:controller.signal});
    const value=await response.json().catch(()=>null);
    if(!response.ok)throw new ApiError(response.status,String(value?.detail?.code??`HTTP_${response.status}`));
    if(!value)throw new ApiError(502,"INVALID_RESPONSE");
    return value;
  } catch(e) {if(timedOut)throw new ApiError(408,"REQUEST_TIMEOUT");throw e;}
  finally {clearTimeout(timer);signal?.removeEventListener("abort",cancel);}
}
