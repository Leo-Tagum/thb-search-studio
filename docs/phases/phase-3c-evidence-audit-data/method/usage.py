import json,glob,os,collections,re
R = "<~/.claude/projects/<project>/>"
S = "<scratch directory>"
S = "<scratch directory>"
out=[]
for sess in ["f341c740-5940-4b29-bafb-68bc85d2f112","955319e9-76d6-41d8-8b2d-c0cdca4d8ef5","3af375f8-0850-4a7d-925e-736a4f04ba3c","772f0142-ac61-43cd-b268-d4296c2f0992"]:
    for mf in glob.glob(R+sess+"/subagents/*.meta.json"):
        meta=json.load(open(mf)); jf=mf.replace(".meta.json",".jsonl")
        calls={}; models=collections.Counter(); efforts=collections.Counter(); first=last=None
        for line in open(jf,encoding='utf8'):
            try: d=json.loads(line)
            except: continue
            if d.get("type")!="assistant": continue
            m=d.get("message") or {}; u=m.get("usage")
            if not u: continue
            key=m.get("id") or d.get("requestId") or d.get("uuid")
            calls[key]=u   # last record per API call wins (streaming duplicates)
            models[m.get("model")]+=1; efforts[str(d.get("effort"))+"/"+str(d.get("perTurnEffort"))]+=1
            ts=d.get("timestamp"); first=first or ts; last=ts
        tot=dict(input=0,cache_create=0,cache_read=0,output=0,calls=len(calls))
        for u in calls.values():
            tot["input"]+=u.get("input_tokens",0) or 0; tot["cache_create"]+=u.get("cache_creation_input_tokens",0) or 0
            tot["cache_read"]+=u.get("cache_read_input_tokens",0) or 0; tot["output"]+=u.get("output_tokens",0) or 0
        out.append(dict(session=sess[:8],agent=os.path.basename(jf)[6:-6],type=meta.get("agentType"),desc=meta.get("description"),model_req=meta.get("model"),models=dict(models),efforts=dict(efforts),first=first,last=last,**tot))
json.dump(out,open(S+"/usage-real.json","w"),indent=0)
print(len(out)); print(collections.Counter((o["session"],o["type"]) for o in out))
print(collections.Counter(json.dumps(o["models"],sort_keys=True) for o in out).most_common(6))
print(collections.Counter(json.dumps(o["efforts"],sort_keys=True) for o in out).most_common(6))
