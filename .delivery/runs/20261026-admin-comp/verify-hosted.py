#!/usr/bin/env python3
"""Unauthenticated staging smoke checks. Never uses credentials or valid order/payment IDs."""
import json, urllib.request, urllib.error, datetime
from pathlib import Path
BASE = "https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app"
cases = [
 ("GET", "/", 200),
 ("GET", "/admin", 200),
 ("GET", "/api/admin/comp/catalog?countryCode=GB", 401),
 ("POST", "/api/admin/comp/quotes", 401),
 ("POST", "/api/admin/comp/orders", 401),
 ("GET", "/api/admin/comp/orders/nonexistent-staging-smoke", 401),
 ("POST", "/api/admin/comp/orders/nonexistent-staging-smoke/payment-request", 401),
 ("POST", "/api/admin/dispatch-comp", 423),
 ("GET", "/api/comp-payment/invalid-staging-smoke", 404),
 ("POST", "/api/comp-payment/invalid-staging-smoke/payment-intent", 404),
 ("GET", "/comp-payment/invalid-staging-smoke", 200),
]
results=[]
for method, path, expected in cases:
 request=urllib.request.Request(BASE+path, data=b'{}' if method=="POST" else None, method=method, headers={"Content-Type":"application/json", "User-Agent":"SendMyNotes-Staging-Release-Verification"})
 try: response=urllib.request.urlopen(request, timeout=30)
 except urllib.error.HTTPError as error: response=error
 body=response.read().decode("utf-8",errors="replace")
 status=response.status
 item={"method":method,"path":path,"status":status,"expected":expected,"passed":status==expected}
 if path.startswith("/comp-payment/"):
  headers={k.lower():v for k,v in response.headers.items()}
  item["privacyHeaders"]={k:headers.get(k) for k in ["referrer-policy","x-robots-tag","cache-control"]}
  item["passed"] &= headers.get("referrer-policy")=="no-referrer" and "noindex" in headers.get("x-robots-tag","") and "no-store" in headers.get("cache-control","")
 if status>=400:
  try: item["error"]=json.loads(body).get("error")
  except ValueError: item["error"]="Non-JSON response"
 results.append(item)
report={"checkedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),"base":BASE,"authenticated":False,"providerActions":False,"checks":results,"passed":all(x["passed"] for x in results)}
Path(__file__).with_name("checks").joinpath("hosted-smoke.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report,indent=2))
raise SystemExit(0 if report["passed"] else 1)
