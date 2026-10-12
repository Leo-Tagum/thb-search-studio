import json,re
S = "<scratch directory>"
revs=json.load(open(S+"/team-revs.json")); vers=json.load(open(S+"/team-vers.json")); tix=json.load(open(S+"/team-tix.json")); runs={r["id"]:r for r in json.load(open(S+"/team-runs.json"))}
def txt(c):
    if c.get("kind")=="faq": return "\n".join(f"Q: {i['q']} A: {i['a']}" for i in c["items"])
    return json.dumps(c)
print("FAQ versions:")
for v in [v for v in vers if v["unit"]=="faq"]:
    t=txt(v["content"]); print(v["version_no"],v["created_at"][11:19],v["created_by"],runs.get(v["agent_run_id"],{}).get("agent_key"),"| Generally yes" if "Generally yes" in t else "","| Not always" if "Not always" in t else "")
    for line in t.split("\n"):
        if "disclose" in line.lower() and "Q:" in line: print("   ",line[:260])
print()
print("FAQ reviews mentioning item 2 / Not always / Generally:")
for r in [r for r in revs if r["unit"]=="faq"]:
    f=[x for x in r["findings"] if re.search(r"not always|generally|item 2|disclos",x.get("note","")+x.get("issue_key",""),re.I)]
    print(r["created_at"][11:19],r["agent_key"],r["decision"],"ver",r["version_id"][:6],[ (x["issue_key"],x["severity"],x["note"][:230]) for x in f])
