import json,re
S = "<scratch directory>"
revs=json.load(open(S+"/team-revs.json")); vers=json.load(open(S+"/team-vers.json"))
ct=json.load(open("docs/phases/phase-3c-data/1-blind-original-vs-team/classic-text.json"))
def txt(c):
    if c.get("kind")=="faq": return "\n".join(f"Q: {i['q']} A: {i['a']}" for i in c["items"])
    out=[c.get("capsule") or ""]
    for b in c["blocks"]:
        out.append(b.get("text") or " ".join(b.get("items",[])) or json.dumps(b.get("rows","")))
    return "\n".join(out)
for phrase in ["That route is closed","Generally yes","Not always"]:
    print("==",phrase, "| in classic text:", {u:(phrase in t) for u,t in ct.items() if phrase in t})
    seen=False
    for v in vers:
        if phrase in txt(v["content"]):
            print("  first in team version", v["unit"],"v",v["version_no"],v["created_at"][11:19],"by",v["created_by"],"reason:",(v["reason"] or "")[:200]); break
for unit in ["s2","s4"]:
    print("\n==",unit,"opening reviews")
    for r in [r for r in revs if r["unit"]==unit and r["agent_key"] in("thb-v2-seo-aeo-geo","thb-v3-editorial")]:
        f=[x for x in r["findings"] if re.search(r"open|first|lead|answer|direct|start",x.get("note","")+x.get("issue_key",""),re.I)]
        if f: print(r["created_at"][11:19],r["agent_key"][-14:],r["decision"],[(x["issue_key"],x["severity"],x["note"][:300]) for x in f[:2]])
