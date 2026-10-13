import json,re,sys,os
S="<scratch directory>"
rnd=sys.argv[1]
exp=json.load(open(S+"/t11/expected.json")); pre=json.load(open(S+"/t11-pre.json"))["units"]
BAD=re.compile(r"\b(often|many owners|most|usually|always|never|nobody|everyone|people)\b",re.I)
ok_all=True
for u in ["s1","s2","s4","s6","s7","faq"]:
    f=f"{S}/t11/{rnd}/04-{u}-out.json"
    if not os.path.exists(f): print(u,"no output"); ok_all=False; continue
    o=json.load(open(f)); w=o["result"].get("unit")
    if o["decision"]!="PASS" or not w: print(u,"decision",o["decision"]); ok_all=False; continue
    if u!="s4":
        same = w==exp[u]
        print(u,"EXACT MATCH to the intended edit" if same else "DIFFERS from the intended edit"); ok_all&=same
        if not same:
            import difflib
            a=json.dumps(exp[u],indent=1,ensure_ascii=False).split("\n"); b=json.dumps(w,indent=1,ensure_ascii=False).split("\n")
            for l in difflib.unified_diff(a,b,lineterm="",n=0): print("   ",l[:260])
    else:
        e=json.loads(json.dumps(pre["s4"]["content"])); wb=w["blocks"]; eb=e["blocks"]
        same_struct = len(wb)==len(eb) and all(wb[i]==eb[i] for i in range(len(eb)) if i!=1) and {k:v for k,v in w.items() if k!="blocks"}=={k:v for k,v in e.items() if k!="blocks"}
        t=wb[1]["text"]; keep="Let me separate what the law says from what I can't tell you."
        m=t.endswith(keep); head=t[:-len(keep)].strip() if m else t
        print("s4 rest of unit identical:",same_struct,"| block 1 keeps its last sentence:",m,"| bad words in the rewrite:",BAD.findall(head)); print("   new sentences:",head); ok_all&=same_struct and m and not BAD.findall(head)
    print("   change_note:",o["result"].get("change_note","")[:220],"| addresses:",o["result"].get("addresses"),"| declines:",o["result"].get("declines"))
print("ALL OK" if ok_all else "NOT OK")
