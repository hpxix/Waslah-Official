export function websiteInputUrl(message: string) {
  const match=message.match(/https?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/i);
  const candidate=match?.[0].replace(/[).,،؛!?؟\]]+$/u,'') || (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?$/i.test(message.trim()) ? message.trim() : '');
  if(!candidate)return null;
  try {const url=new URL(/^https?:\/\//i.test(candidate)?candidate:`https://${candidate}`);
    if(/(?:^|\.)(?:linkedin\.com|haraj\.com\.sa|apify\.com)$/i.test(url.hostname)&&!/(?:my website|our website|read (?:this|the) (?:site|website)|موقعي|موقعنا|اقرأ الموقع)/iu.test(message))return null;
    return url.href;}catch{return null;}
}
