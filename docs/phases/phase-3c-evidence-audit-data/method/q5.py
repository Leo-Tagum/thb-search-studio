import json,random,re
S = "<scratch directory>"
B="2-findings-and-declines/"
F=json.load(open(B+"findings.json")); ct=json.load(open("1-blind-original-vs-team/classic-text.json")); tt=json.load(open("1-blind-original-vs-team/team-text.json"))
V={u:{x["n"]:x for x in json.load(open(B+f"per-unit-checks/out/{u}.json"))} for u in ["s1","s2","s3","s4","s5","s6","s7","s8","faq"]}
W=lambda s:set(w for w in re.findall(r"[a-z0-9']+",s.lower()) if len(w)>3)
def paras(t): return [p.strip() for p in re.split(r'\n\s*\n',t) if len(p.strip())>20]
def bestp(probe,pool):
    pw=W(probe); return max(pool,key=lambda p:len(pw&W(p))/(len(W(p))**0.5+1))
random.seed(20261012)
out=[]
for f in sorted(random.sample(F,5),key=lambda x:x["n"]):
    u=f["unit"]; v=V[u].get(f["n"]) or {}
    qs=re.findall(r"'([^']{12,})'",f["text"])
    probe=" ".join(qs) if qs else f["text"]
    before=bestp(probe,paras(ct[u]))
    q=v.get("quote") or ""
    after_hit=[p for p in paras(tt[u]) if q and q[:40].lower() in p.lower()]
    after=after_hit[0] if after_hit else bestp(before,paras(tt[u]))
    out.append(dict(n=f["n"],unit=u,reviewer=f["role"],finding=f["text"],verdict=v.get("verdict"),checker_reason=v.get("reason"),checker_quote=q,before=before,after=after,quote_found_in_team_text=bool(after_hit)))
json.dump(out,open(S+"/q5.json","w"),indent=1)
for o in out: print("#",o["n"],o["unit"],o["verdict"],o["quote_found_in_team_text"],"\n F:",o["finding"][:300],"\n B:",o["before"][:400],"\n A:",o["after"][:400],"\n")
