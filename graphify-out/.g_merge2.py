import json, glob
from pathlib import Path
from graphify.cache import save_semantic_cache

chunks = sorted(glob.glob("graphify-out/.graphify_chunk_*.json"))
nodes, edges, hyper = [], [], []
for c in chunks:
    try:
        d = json.loads(Path(c).read_text(encoding="utf-8"))
    except Exception as e:
        print("skip", c, e); continue
    nodes += d.get("nodes", [])
    edges += d.get("edges", [])
    hyper += d.get("hyperedges", [])
total_in = 601238
print(f"merged {len(chunks)} chunks: {len(nodes)} nodes, {len(edges)} edges")

save_semantic_cache(nodes, edges, hyper)

cachedp = Path("graphify-out/.graphify_cached.json")
cached = json.loads(cachedp.read_text(encoding="utf-8")) if cachedp.exists() else {"nodes":[],"edges":[],"hyperedges":[]}
all_nodes = cached["nodes"] + nodes
all_edges = cached["edges"] + edges
all_hyper = cached.get("hyperedges", []) + hyper
seen=set(); dedup=[]
for n in all_nodes:
    if n["id"] not in seen:
        seen.add(n["id"]); dedup.append(n)

ast = json.loads(Path("graphify-out/.graphify_ast.json").read_text(encoding="utf-8"))
seen = {n["id"] for n in ast["nodes"]}
merged_nodes = list(ast["nodes"])
for n in dedup:
    if n["id"] not in seen:
        merged_nodes.append(n); seen.add(n["id"])
merged = {"nodes": merged_nodes, "edges": ast["edges"] + all_edges, "hyperedges": all_hyper, "input_tokens": total_in, "output_tokens": 0}
Path("graphify-out/.graphify_extract.json").write_text(json.dumps(merged, ensure_ascii=False), encoding="utf-8")
print(f"FINAL: {len(merged_nodes)} nodes, {len(merged['edges'])} edges ({len(ast['nodes'])} AST + {len(dedup)} semantic), {len(all_hyper)} hyperedges")
