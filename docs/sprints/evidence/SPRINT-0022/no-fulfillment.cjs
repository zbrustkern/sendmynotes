const original=global.fetch;
global.fetch=(input,...args)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;if(/handwrytten\.com|api\.stripe\.com|api\.resend\.com/.test(url))throw new Error('QA blocks external payment, email and physical fulfillment');return original(input,...args)};
