# Simulation Prompt

> Version: 2. Model: Claude Haiku 4.5 / Sonnet 4.6, temperature 0, structured JSON output.
> This file is the single source of truth — the simulation service reads it at runtime.
> Few-shot examples must NOT reuse any content from the evaluation PDFs.

---SYSTEM---

You are given a set of concept nodes extracted from study material (each with an id, label, and description) and the SOURCE TEXT they came from. Identify the most significant relationships between the concepts and return ONLY JSON matching the schema.

## Grounding by citation (most important rule)

Every edge MUST include an `evidence` field: a short verbatim quote (≤ 20 words) copied from the SOURCE TEXT that explicitly describes the interaction between the two concepts. Quote the source exactly — do not paraphrase in `evidence`.

> Co-occurrence, topical similarity, or appearing in the same document is NOT a relationship. Only an explicitly described interaction counts. When in doubt, emit no edge. Returning zero edges is a correct answer for unrelated concepts.

If you cannot find a sentence in the source that states the relationship, **do not emit the edge.** A flat glossary of independent definitions has no interaction sentences, so it should yield zero (or at most one) edge.

## Edge-kind decision procedure

For each candidate relationship, pick the FIRST kind that matches, in this order:

```
1. depends_on   A requires B to function; B is a prerequisite for A.
2. produces_for A creates an output that B consumes / receives.
3. conflicts    A and B move in opposite directions or oppose each other (inverse).
4. influences   A causally changes B's quantity or state (same-direction cause).
5. precedes     A occurs before B in time, with NO causal claim (sequence only).
6. relates      The text explicitly links them but none of the above fits.
   else         NO EDGE.
```

Critical clarifications:
- **`precedes` is for time only.** A structural or layered dependency (each level relies on the one beneath it) is `depends_on`, NOT `precedes`, even though the dependent thing "comes after". Reserve `precedes` for dated milestones or steps that literally happen at different times.
- **Inverse / opposing dynamics are `conflicts`,** not `relates` and not plain `influences`: if A rising makes B fall, A→B is `conflicts`; if A rising makes B rise, A→B is `influences`.

## Other rules

- **Do NOT restate the hierarchy.** Never emit an edge that just expresses containment/membership (the root topic "relating to" its members, or a parent "relating to" its child). That belongs to `parentId`. Edges capture relationships BETWEEN sibling concepts.
- **Be selective.** Return only the most significant relationships — **maximum 15**, usually far fewer. Never pad to the maximum.
- Edges are directional: `fromNodeId` → `toNodeId`. Get the direction right.
- `fromNodeId` and `toNodeId` MUST be exact ids from the provided node set. Never invent ids or use labels.
- `rationale` is your one-line explanation; `evidence` is the verbatim source quote.

## Schema

```
{
  "edges": [
    { "id": string, "fromNodeId": string, "toNodeId": string,
      "kind": "depends_on"|"produces_for"|"influences"|"conflicts"|"precedes"|"relates",
      "rationale": string,
      "evidence": string }
  ]
}
```

---FEW-SHOT EXAMPLE 1 (mixed kinds, grounded — unrelated content)---

SOURCE TEXT:
"A building's frame is built on and supported by the foundation, which transfers the load to the ground. The roof sits on top of the frame. Heating raises the indoor temperature while cooling lowers it."

Nodes:
```
n1 Foundation
n2 Frame
n3 Roof
n4 Heating
n5 Cooling
```

Output:
```json
{
  "edges": [
    { "id": "e1", "fromNodeId": "n2", "toNodeId": "n1", "kind": "depends_on", "rationale": "The frame relies on the foundation for support.", "evidence": "frame is built on and supported by the foundation" },
    { "id": "e2", "fromNodeId": "n3", "toNodeId": "n2", "kind": "depends_on", "rationale": "The roof is supported by the frame.", "evidence": "The roof sits on top of the frame" },
    { "id": "e3", "fromNodeId": "n4", "toNodeId": "n5", "kind": "conflicts", "rationale": "Heating and cooling push indoor temperature in opposite directions.", "evidence": "Heating raises the indoor temperature while cooling lowers it" }
  ]
}
```

---FEW-SHOT EXAMPLE 2 (dependency vs no-edge)---

SOURCE TEXT:
"A plant cannot photosynthesize without sunlight. Chlorophyll gives leaves their green color. Roots anchor the plant in the soil."

Nodes:
```
n1 Photosynthesis
n2 Sunlight
n3 Chlorophyll
n4 Roots
```

Output:
```json
{
  "edges": [
    { "id": "e1", "fromNodeId": "n1", "toNodeId": "n2", "kind": "depends_on", "rationale": "Photosynthesis requires sunlight.", "evidence": "A plant cannot photosynthesize without sunlight" }
  ]
}
```

Note: Chlorophyll and Roots co-occur with the other concepts but the text states no interaction between them, so no edge is emitted for them. Co-occurrence is not a relationship.
