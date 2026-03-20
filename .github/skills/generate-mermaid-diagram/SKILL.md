---
name: generate-mermaid-diagram
description: "Generate Mermaid diagrams from a description and reference files. Use when: creating diagrams, visualizing architecture, drawing flowcharts, sequence diagrams, ER diagrams, class diagrams, state diagrams, C4 diagrams, mindmaps, timelines, or any Mermaid-supported chart type."
argument-hint: "Describe the diagram you want and mention any reference files to base it on"
---

# Generate Mermaid Diagram

Create accurate, well-structured Mermaid diagrams based on a user-provided description and optional reference files.

## When to Use

- Visualizing system architecture, data flows, or service interactions
- Creating flowcharts for business logic or decision trees
- Drawing sequence diagrams for API or messaging flows
- Generating ER diagrams from database schemas or repo files
- Building state diagrams, class diagrams, C4 diagrams, or any other Mermaid-supported type
- Documenting processes from existing code or specifications

## Procedure

### 1. Understand the Request

Identify from the user's description:
- **Diagram type** — which Mermaid diagram type fits best (flowchart, sequenceDiagram, classDiagram, etc.)
- **Reference files** — any source files, configs, or docs the user wants the diagram based on
- **Scope** — what should be included vs excluded
- **Output location** — where to save the `.mmd` or `.md` file (default: `docs/diagrams/`)

If the diagram type is ambiguous, ask the user. Use this mapping for common requests:

| Request | Diagram Type |
|---------|-------------|
| Flow, process, decision tree | `flowchart.md` |
| API calls, service interactions, messaging | `sequenceDiagram.md` |
| Database schema, data model | `entityRelationshipDiagram.md` |
| Object model, class hierarchy | `classDiagram.md` |
| Lifecycle, status transitions | `stateDiagram.md` |
| System context, containers, components | `c4.md` |
| Infrastructure, cloud layout | `architecture.md` |
| Project timeline, milestones | `gantt.md` or `timeline.md` |
| User experience flow | `userJourney.md` |
| Concept breakdown, brainstorming | `mindmap.md` |
| Data distribution | `pie.md` or `sankey.md` |

### 2. Load Syntax Documentation

**Always** call `get-syntax-docs-mermaid` with the appropriate diagram type file before writing any Mermaid code. This ensures you use correct, up-to-date syntax.

### 3. Read Reference Files

Read all files the user has mentioned or attached. Extract the relevant details:
- For **code files**: function names, module boundaries, call chains, data structures
- For **config files**: service names, connection details, environment settings
- For **API schemas**: endpoints, methods, request/response shapes
- For **database models**: collections, fields, relationships, indexes

Summarize what you found before proceeding.

### 4. Draft the Diagram

Write the Mermaid code following these conventions:

- **Use descriptive node IDs** — `uploadService` not `A`, `mongoDb` not `B`
- **Label edges clearly** — describe what flows between nodes
- **Group related nodes** — use `subgraph` blocks for logical grouping
- **Keep it readable** — prefer vertical layout (`TB`) for processes, horizontal (`LR`) for timelines
- **Add a title** — use YAML frontmatter or `---` block where supported:
  ```
  ---
  title: My Diagram Title
  ---
  ```

### 5. Validate the Diagram

**Always** call `mermaid-diagram-validator` with the complete diagram code. Fix any syntax errors before proceeding.

### 6. Preview the Diagram

**Always** call `mermaid-diagram-preview` to render and display the diagram. If it is a new diagram, pass the `code` parameter. If it is an existing file, pass the `documentUri` parameter.

### 7. Save the Diagram

Save the diagram as a `.mmd` file (pure Mermaid) or embedded in a `.md` file (with ` ```mermaid ` code fence), based on user preference. Default to `.mmd` if no preference is stated.

### 8. Iterate

Ask the user if adjustments are needed — layout, detail level, missing nodes, or styling changes. Repeat steps 4–6 for each revision.

## Quality Checklist

- [ ] Loaded syntax docs for the chosen diagram type via `get-syntax-docs-mermaid`
- [ ] Read all referenced source files
- [ ] Used descriptive node IDs and edge labels (not single letters)
- [ ] Validated with `mermaid-diagram-validator` — no errors
- [ ] Previewed with `mermaid-diagram-preview` — renders correctly
- [ ] Saved to the agreed output location
