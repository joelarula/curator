# Curator Semantic Identity & Vocabulary Standards

This document establishes the high-fidelity standards for RDF identity and relational terminology within the **Curator Knowledge Studio**. Adhering to these standards ensures consistency, interoperability, and professional graph ergonomics.

## 1. Compact Namespacing (CURIEs)
To keep URIs human-readable and efficient in search/filters, use the following functional prefixes for internal concepts:

| Prefix | Usage | Examples |
| :--- | :--- | :--- |
| `type:` | **Classes & Entities** | `type:article`, `type:predicate`, `type:agent`, `type:concept` |
| `prop:` | **Internal Properties** | `prop:confidence`, `prop:extraction_method`, `prop:justification` |
| `status:`| **Workflow States** | `status:draft`, `status:published`, `status:archived` |
| `lang:` | **Language Codes** | `lang:et`, `lang:en`, `lang:ru` |
| `schema:`| **Schema.org Alignment**| `schema:about`, `schema:title`, `schema:author` |
| `res:`  | **Internal References**| `res:947` (Internal ID reference) |


> [!TIP]
> Use these short prefixes for system-wide metadata. They are easier to type in autocompletes and keep the UI clean.

---

## 2. Global Semantic Alignment
For properties and classes that have established global standards, use the full Canonical URI to ensure your knowledge graph is high-fidelity and "linked-data" ready.

### Core RDF
- **Instance Of**: `http://www.w3.org/1999/02/22-rdf-syntax-ns#type`
- **Label**: `http://www.w3.org/2000/01/rdf-schema#label`

### Schema.org (Preferred for Content)
Align with [Schema.org](https://schema.org) for all public-facing metadata:
- **Title**: `https://schema.org/title`
- **Description**: `https://schema.org/description`
- **About / Subject**: `https://schema.org/about`
- **Provider**: `https://schema.org/provider`
- **Date Published**: `https://schema.org/datePublished`

---

## 3. Casing & Formatting Conventions

### Classes (`type:`)
- **Convention**: `snake_case` or `lowercase` for internal stubs.
- **Rationale**: Minimizes shift-key usage in autocompletes and reduces typos.
- **Example**: `type:logical_fallacy`, `type:article`.

### Properties (`prop:`)
- **Convention**: `camelCase`.
- **Rationale**: Distinguishes properties visually from classes.
- **Example**: `prop:agentVersion`, `prop:scoreValue`.

### External URIs
- Always use the **Canonical URL** as the primary URI for scraped or external resources.
- **Example**: `https://www.err.ee/1610020511/narva-joesuu...`

---

## 4. Implementation Best Practices

1. **Auto-Tagging**: Ensure all custom predicates are automatically tagged with `type:predicate` using the `upsertRelation` tool.
2. **Autocomplete First**: Always search for existing URIs before creating a new one to prevent graph fragmentation.
3. **Literal vs. Object**: 
   - Use **Object URIs** for links between entities (e.g., `res:947` -> `type:article`).
   - Use **Literal Values** for attributes (e.g., `res:947` -> `prop:confidence` -> `0.95`).

---

## 5. Registry of Core Predicates
| URI | Description |
| :--- | :--- |
| `http://www.w3.org/1999/02/22-rdf-syntax-ns#type` | Links an instance to a Class (e.g., `type:article`). |
| `type:predicate` | High-fidelity marker for resources used as predicates. |
| `https://schema.org/about` | Links a resource to its primary subject/concept. |
| `prop:status` | Current workflow state (replaces legacy boolean flags). |
| `prop:allows_value` | Links a predicate to its valid enum options/objects. |


---

## 6. Workflow State Registry (`status:`)
Use these consistent resources as objects for the `prop:status` predicate:

| URI | Description |
| :--- | :--- |
| `status:draft` | Initial state. Resource is being processed or edited. |
| `status:published` | Resource is verified and visible in public contexts. |
| `status:archived` | Resource is preserved but no longer active. |
| `status:flagged` | Resource requires immediate human review or auditing. |

