# Homepage 3D ForceGraph — Manual

This is a lightweight, static site that renders an interactive 3D knowledge graph (owner → categories → documents) using `three` and `3d-force-graph` from a single JSON file.

## Project Structure
- `index.html` — the app UI and 3D ForceGraph setup.
- `graph.json` — your data (nodes + links).
- `docs/` — HTML files opened when clicking document nodes.

## Data Model (`graph.json`)
Nodes have a `kind` and optional fields:
- `owner`: the central person/entity.
- `category`: a topical bucket; displayed in the filter list.
- `doc`: a document/note.

Doc fields:
- `category`: lowercase category name. Must match the category label lowercased.
- `tags`: optional array of strings.
- `path`: file path under `docs/` to open on click.

Links:
- Category membership: `{ kind: "contains" }` between a `category` and a `doc`.
- Ownership: `{ kind: "owns" }` between `owner` and each `category`.
- Tag relation: any link with `kind` starting with `"tag:"` (e.g., `"tag:python"`) shows animated particles.

Minimal example:
```json
{
  "nodes": [
    { "id": "owner:sergio", "label": "Sérgio Batalha", "kind": "owner" },
    { "id": "cat:development", "label": "Development", "kind": "category" },
    { "id": "doc:web-graph", "label": "Web Graph Prototype", "kind": "doc", "category": "development", "tags": ["js", "3d"], "path": "web-graph.html" }
  ],
  "links": [
    { "source": "owner:sergio", "target": "cat:development", "kind": "owns" },
    { "source": "cat:development", "target": "doc:web-graph", "kind": "contains" },
    { "source": "doc:web-graph", "target": "doc:web-graph", "kind": "tag:3d" }
  ]
}
```

## Add or Update Categories
1. Add a category node to `nodes`:
   - `id`: unique (e.g., `"cat:design"`).
   - `label`: display name (e.g., `"Design"`).
   - `kind`: `"category"`.
2. Link it from the owner:
   - `{ "source": "owner:sergio", "target": "cat:design", "kind": "owns" }`.
3. When adding docs in that category, set each doc's `category` to the category label lowercased (e.g., `"design"`). This must match the dropdown filter logic in `index.html`.

## Add New Documents
1. Create a file under `docs/`, e.g., `docs/my-note.html` (any static HTML is fine).
2. Add a `doc` node in `graph.json`:
   - `id`: unique (e.g., `"doc:my-note"`).
   - `label`: shown in the graph tooltip.
   - `kind`: `"doc"`.
   - `category`: lowercase category name (e.g., `"development"`).
   - `tags`: optional list (e.g., `["python", "cli"]`).
   - `path`: `"my-note.html"` (relative to `docs/`).
3. Link the doc to its category:
   - `{ "source": "cat:development", "target": "doc:my-note", "kind": "contains" }`.
4. Optionally add tag links between documents to visualize relationships:
   - `{ "source": "doc:my-note", "target": "doc:another-doc", "kind": "tag:python" }`.

## Local Preview
Because `index.html` uses `fetch('graph.json')`, open it via a local server (not `file:///`). Options:
- Python: `python -m http.server 8080` then visit `http://localhost:8080`.
- Node: `npx serve .` or any static server.
- VS Code: Live Server extension.

## Deploy to GitHub Pages
1. Push this folder to a GitHub repository.
2. In GitHub → your repo → Settings → Pages:
   - Build and deployment → Source: "Deploy from a branch".
   - Branch: `main` and folder `/ (root)`.
3. Wait for the green check. Your site is at `https://<user>.github.io/<repo>/`.
4. Updating content:
   - Edit `graph.json` and commit. Hard refresh (Ctrl/Cmd+Shift+R) to bypass cache.
5. Optional custom domain:
   - In Pages settings, set your domain and add the DNS `CNAME` at your registrar.

## Deploy to Vercel
1. Go to Vercel and "Import Project" from your GitHub repo.
2. Framework preset: "Other" (static site).
3. Build command: leave empty. Output directory: `.` (project root).
4. Deploy. Your site will be live at `https://<project>.vercel.app/`.
5. Every push to `main` triggers a new deploy.

## Customization Tips
- Libraries are loaded from CDN in `index.html`. To pin versions or avoid CDN, download `three.min.js` and `3d-force-graph.min.js` and update the `<script>` tags to local files.
- Colors and sizes are set via CSS variables in `index.html` under `:root`.
- The category filter uses each category node's `label` for display and compares docs using the lowercased label; keep them consistent.

## Troubleshooting
- Empty graph: open DevTools → Console; ensure `graph.json` loaded (no 404) and is valid JSON.
- Filters not matching: confirm each doc `category` exactly equals the lowercased category `label`.
- Clicks not opening: verify the doc's `path` exists under `docs/` and matches the filename.
- Slow layout: reduce node count, lower `d3Force('charge').strength`, or disable link particles.

---
Questions or want tweaks (layout, labels, colors)? Open an issue or ping me.
