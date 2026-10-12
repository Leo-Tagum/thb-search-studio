import json,collections
S = "<scratch directory>"
U=json.load(open(S+"/usage-real.json"))
def phase(o):
    t=o["type"]; d=o["desc"] or ""
    if o["session"]=="f341c740": return "classic-original (drafting)"
    if o["session"]=="3af375f8": return "3d adversarial V1 (fixture)"
    if o["session"]=="772f0142": return "opportunity agents 1-3 / misc"
    if t in("thb-04-section-writer","thb-05-fact-privacy-auditor","thb-06-seo-aeo-geo-auditor","thb-07-editorial-critic"): return "classic-revision (37 runs + retry)"
    if t=="general-purpose": return "judges/checkers (3c analysis)"
    if "on classic" in d: return "V1 on classic units (read-only test)"
    return "team revision"
G=collections.defaultdict(lambda:collections.Counter())
for o in U:
    g=G[phase(o)]
    g["agents"]+=1
    for k in("input","cache_create","cache_read","output","calls"): g[k]+=o[k]
print(f"{'phase':42}{'agents':>7}{'calls':>7}{'input':>9}{'cache_new':>11}{'cache_read':>12}{'output':>9}{'total':>11}{'read%':>7}{'fresh(in+new+out)':>20}{'per agent total':>16}")
for k,g in G.items():
    tot=g["input"]+g["cache_create"]+g["cache_read"]+g["output"]; fresh=g["input"]+g["cache_create"]+g["output"]
    print(f"{k:42}{g['agents']:>7}{g['calls']:>7}{g['input']:>9}{g['cache_create']:>11}{g['cache_read']:>12}{g['output']:>9}{tot:>11}{100*g['cache_read']/tot:>6.0f}%{fresh:>20}{tot//g['agents']:>16}")
# per agent type in team phase
T=collections.defaultdict(lambda:collections.Counter())
for o in U:
    if phase(o)=="team revision":
        g=T[o["type"]]; g["n"]+=1
        for k in("input","cache_create","cache_read","output"): g[k]+=o[k]
for k,g in T.items(): print(k,g["n"],{x:g[x] for x in("input","cache_create","cache_read","output")}, "total",sum(g[x] for x in("input","cache_create","cache_read","output")))
# elapsed
import datetime
def ts(s): return datetime.datetime.fromisoformat(s.replace("Z","+00:00"))
for ph in G:
    xs=[o for o in U if phase(o)==ph]; f=min(ts(o["first"]) for o in xs); l=max(ts(o["last"]) for o in xs); print(ph,"first",f.time(),"last",l.time(),"elapsed min",round((l-f).total_seconds()/60,1))
# estimator comparison for the team phase: est 1,036,937 vs real
