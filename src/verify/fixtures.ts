import type { EdgeKind } from "#shared";

/**
 * Answer keys derived from specs/TEST_SET_GUIDE.md (kept in sync with that doc).
 * Three TRAIN docs scored against ground truth; two ADVERSARIAL docs scored on
 * behavior (pass/fail of documented failure modes), not graph richness.
 */

export interface ExpectedNode {
  /** Canonical concept label. */
  label: string;
  /** Alternate surface forms that should still count as a match. */
  synonyms?: string[];
  /**
   * Expected parent:
   *  - "root"          : must hang under the document root concept
   *  - "root_or_null"  : root or top-level both acceptable (flatter docs)
   *  - null            : must be top-level / flat
   */
  parent: "root" | "root_or_null" | null;
}

/** A directed relation pattern that counts as a valid edge. `to: "*"` = any concept. */
export interface AllowedRelation {
  from: string;
  to: string; // canonical label or "*"
  kinds: EdgeKind[];
}

export interface Fixture {
  file: string;
  type: "train" | "adversarial";
  /** Acceptable root labels (matched case-insensitively, fuzzily). */
  rootLabels: string[];
  expectedNodes: ExpectedNode[];
  /** For train docs: relations that count toward relationship validity. */
  allowedRelations?: AllowedRelation[];
  /** train_1 only: layer ordering for the dependency-chain direction check. */
  layerOrder?: Record<string, number>;
  /** train_3 only: the inverse Price/Demand pair that must be `conflicts`. */
  requireConflictBetween?: [string, string];
  /**
   * Extra concepts accepted as valid edge endpoints (NOT counted toward recall
   * or hallucination) — for genuinely-valid relationships the canonical node
   * list omits. Logged as answer-key corrections.
   */
  extraConcepts?: ExpectedNode[];
  /** Treat the root concept as a valid edge target (organelle→whole-cell functional edges). */
  rootIsValidTarget?: boolean;
  /** Adversarial behavior expectations. */
  adversarial?: {
    maxEdges: number;
    /** Max number of distinct internal parents tolerated before it's a fabricated tree. */
    maxInternalParents: number;
    /** Edge kinds that are dishonest for this doc (e.g. influences on a timeline). */
    forbiddenKinds: EdgeKind[];
  };
}

export const FIXTURES: Fixture[] = [
  {
    file: "train_1_osi_model.pdf",
    type: "train",
    rootLabels: ["osi model", "the osi model", "osi reference model"],
    expectedNodes: [
      { label: "Physical Layer", synonyms: ["physical"], parent: "root" },
      { label: "Data Link Layer", synonyms: ["data link"], parent: "root" },
      { label: "Network Layer", synonyms: ["network"], parent: "root" },
      { label: "Transport Layer", synonyms: ["transport"], parent: "root" },
      { label: "Session Layer", synonyms: ["session"], parent: "root" },
      { label: "Presentation Layer", synonyms: ["presentation"], parent: "root" },
      { label: "Application Layer", synonyms: ["application"], parent: "root" },
      { label: "Encapsulation", synonyms: ["encapsulate"], parent: "root_or_null" },
    ],
    layerOrder: {
      "Application Layer": 7,
      "Presentation Layer": 6,
      "Session Layer": 5,
      "Transport Layer": 4,
      "Network Layer": 3,
      "Data Link Layer": 2,
      "Physical Layer": 1,
    },
  },
  {
    file: "train_2_cell_organelles.pdf",
    type: "train",
    rootLabels: ["eukaryotic cell", "cell", "the cell", "animal cell"],
    expectedNodes: [
      { label: "Nucleus", parent: "root" },
      { label: "Ribosomes", synonyms: ["ribosome"], parent: "root" },
      {
        label: "Endoplasmic Reticulum",
        synonyms: ["er", "rough endoplasmic reticulum", "smooth endoplasmic reticulum", "rough er", "smooth er"],
        parent: "root",
      },
      { label: "Golgi Apparatus", synonyms: ["golgi", "golgi body"], parent: "root" },
      { label: "Mitochondria", synonyms: ["mitochondrion"], parent: "root" },
      { label: "Lysosomes", synonyms: ["lysosome"], parent: "root" },
      { label: "Cell Membrane", synonyms: ["plasma membrane", "membrane"], parent: "root" },
    ],
    // The organelles form an interconnected producer/consumer system — any
    // directional edge between two organelle concepts is a real dynamic. (Edges
    // to the root "Cell" and same-concept self-edges are excluded by the scorer.)
    allowedRelations: [
      { from: "Nucleus", to: "*", kinds: ["influences", "produces_for", "relates", "depends_on"] },
      { from: "Ribosomes", to: "*", kinds: ["produces_for", "influences", "relates", "depends_on"] },
      { from: "Endoplasmic Reticulum", to: "*", kinds: ["produces_for", "influences", "relates", "depends_on"] },
      { from: "Golgi Apparatus", to: "*", kinds: ["produces_for", "influences", "relates", "depends_on"] },
      { from: "Mitochondria", to: "*", kinds: ["produces_for", "influences", "relates", "depends_on"] },
      { from: "Lysosomes", to: "*", kinds: ["influences", "relates", "produces_for", "depends_on"] },
      { from: "Cell Membrane", to: "*", kinds: ["influences", "relates", "produces_for", "depends_on"] },
      { from: "ATP", to: "*", kinds: ["influences", "produces_for", "relates"] },
    ],
    // §4 key corrections (logged in verify-results.md): ATP is part of the guide's
    // expected relationship set ("Mitochondria provide ATP that powers the other
    // organelles"), and organelle→whole-cell functional edges are real grounded
    // dynamics the canonical organelle→organelle list omitted.
    extraConcepts: [{ label: "ATP", synonyms: ["adenosine triphosphate"], parent: null }],
    rootIsValidTarget: true,
  },
  {
    file: "train_3_supply_demand.pdf",
    type: "train",
    rootLabels: ["market", "supply & demand", "supply and demand", "supply/demand", "supply-demand"],
    expectedNodes: [
      { label: "Price", parent: "root_or_null" },
      { label: "Demand", synonyms: ["law of demand", "quantity demanded"], parent: "root_or_null" },
      { label: "Supply", synonyms: ["law of supply", "quantity supplied"], parent: "root_or_null" },
      { label: "Equilibrium", synonyms: ["market equilibrium"], parent: "root_or_null" },
      { label: "Surplus", synonyms: ["excess supply"], parent: "root_or_null" },
      { label: "Shortage", synonyms: ["excess demand"], parent: "root_or_null" },
    ],
    // Densely interrelated doc — any directed edge between two econ concepts is a real dynamic.
    allowedRelations: [
      { from: "Price", to: "*", kinds: ["influences", "conflicts", "relates", "depends_on"] },
      { from: "Demand", to: "*", kinds: ["influences", "conflicts", "relates", "depends_on"] },
      { from: "Supply", to: "*", kinds: ["influences", "conflicts", "relates", "depends_on"] },
      { from: "Surplus", to: "*", kinds: ["influences", "conflicts", "relates", "depends_on"] },
      { from: "Shortage", to: "*", kinds: ["influences", "conflicts", "relates", "depends_on"] },
      { from: "Equilibrium", to: "*", kinds: ["influences", "conflicts", "relates", "depends_on"] },
    ],
    requireConflictBetween: ["Price", "Demand"],
  },
  {
    file: "adversarial_1_coffee_glossary.pdf",
    type: "adversarial",
    rootLabels: ["coffee", "coffee terms", "coffee glossary", "espresso glossary"],
    // Approximate — adversarial scoring is behavioral, recall/hallucination are informational.
    expectedNodes: [
      { label: "Espresso", parent: null },
      { label: "Tamp", synonyms: ["tamping"], parent: null },
      { label: "Burr Grinder", synonyms: ["grinder"], parent: null },
      { label: "Extraction", parent: null },
      { label: "Crema", parent: null },
    ],
    adversarial: { maxEdges: 1, maxInternalParents: 1, forbiddenKinds: ["influences", "conflicts"] },
  },
  {
    file: "adversarial_2_space_timeline.pdf",
    type: "adversarial",
    rootLabels: ["space race", "space exploration", "space timeline", "timeline"],
    expectedNodes: [
      { label: "Sputnik", parent: null },
      { label: "Apollo 11", synonyms: ["apollo"], parent: null },
    ],
    // Only honest relationship is precedes; causal influences / conflicts are dishonest.
    adversarial: { maxEdges: 8, maxInternalParents: 1, forbiddenKinds: ["influences", "conflicts"] },
  },
];

export function fixtureFor(file: string): Fixture {
  const f = FIXTURES.find((x) => x.file === file);
  if (!f) throw new Error(`no fixture for ${file}`);
  return f;
}
