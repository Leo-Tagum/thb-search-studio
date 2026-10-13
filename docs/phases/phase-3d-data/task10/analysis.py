import json,glob,os,re,collections,datetime
S="<scratch directory>"
st=json.load(open(S+"/t10-state.json"))
def packet_hedges(path):
    p=json.load(open(path)); b=p["untrusted_data_block"]; d=json.loads(b[b.index("\n")+1:b.rindex("\n<<<END")]); return {h["key"]:h for h in d.get("hedge_flags",[])}, d
rows=[]; allrul=[]
for rnd in ["r1","r3"]:
    for f in sorted(glob.glob(f"{S}/t10/{rnd}/v1-*-out.json")):
        u=os.path.basename(f)[3:-9]; o=json.load(open(f)); pk,_=packet_hedges(f.replace("-out","-packet"))
        must=[x for x in o["findings"] if x["severity"]=="required"]; opt=[x for x in o["findings"] if x["severity"]=="optional"]
        rl=o["result"]["hedge_rulings"]
        for r in rl:
            allrul.append(dict(round=rnd,unit=u,ruling=r["ruling"],note=r.get("note",""),sentence=pk.get(r["key"],{}).get("sentence"),term=pk.get(r["key"],{}).get("term")))
        mr=[r for r in rl if r["ruling"] in("reword","drop")]
        rows.append(dict(round=rnd,unit=u,decision=o["decision"],must=len(must)+len(mr),should=len(opt)+sum(r["ruling"]=="soften" for r in rl),not_a_claim=sum(r["ruling"]=="not_a_claim" for r in rl),proven=sum(r["ruling"]=="proven" for r in rl),flagged=len(rl),must_notes=[x["note"][:230] for x in must],should_notes=[x["note"][:200] for x in opt]))
for r in rows: print(r["round"],r["unit"],r["decision"],"must",r["must"],"should",r["should"],"not_a_claim",r["not_a_claim"],"proven",r["proven"],"flagged",r["flagged"])
json.dump(rows,open(S+"/t10-v1-rows.json","w"),indent=1); json.dump(allrul,open(S+"/t10-rulings.json","w"),indent=1)
print(collections.Counter((a["round"],a["ruling"]) for a in allrul))
# fixes: diff of unit text before/after for units with >1 version after run start
def text(c):
    if c.get("kind")=="faq": return [f"Q: {i['q']}\nA: {i['a']}" for i in c["items"]]
    out=[c.get("capsule") or ""]
    for b in c["blocks"]: out.append(b.get("text") or "\n".join(b.get("items",[])) or json.dumps(b.get("rows","")))
    return [x for x in out if x]
import difflib
for u in st["units"]:
    v=u["versions"]
    if len(v)>=2 and v[-1]["by"].startswith("thb-04"):
        a=" ".join(text(v[-2]["content"])); b=" ".join(text(v[-1]["content"]))
        sa=re.split(r"(?<=[.!?])\s+",a); sb=re.split(r"(?<=[.!?])\s+",b)
        print("\n== FIX",u["unit"],"v",v[-2]["no"],"->",v[-1]["no"],v[-1]["reason"][:200])
        for t in difflib.unified_diff(sa,sb,lineterm="",n=0):
            if t[0] in "+-" and not t.startswith(("+++","---")): print("  ",t[:300])
