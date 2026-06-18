/**
 * Symptom-checker decision-tree traversal utilities for Plant Parent.
 *
 * NOTE ON FILENAME: per the design/tasks, the pure symptom-tree traversal
 * helper lives in this file (`notificationUtils.ts`). It is a pure function
 * over the bundled `src/data/symptomTree.json` data and has no Expo / network
 * dependencies, so it can be exercised by property-based tests with arbitrary
 * trees as well as the real bundled tree.
 *
 * Consumed by:
 *  - the SymptomChecker component (task 13.5)
 *  - the Symptom Checker screen (task 20.1)
 *  - the Property 16 property-based test (task 10.6)
 *
 * Validates: Requirements 8.2, 8.3, 8.4 (Property 16)
 */

/** A single selectable answer on a question (non-leaf) node. */
export interface SymptomAnswer {
  /** Human-readable answer text shown to the user. */
  label: string;
  /** Stable machine value used to follow the path during traversal. */
  value: string;
  /** Id of the node reached when this answer is chosen. */
  next: string;
}

/** A non-leaf node: poses a question and offers a set of answers. */
export interface QuestionNode {
  id: string;
  question: string;
  answers: SymptomAnswer[];
}

/** A leaf node: a terminal result, either a conclusive diagnosis or a dead end. */
export interface LeafNode {
  id: string;
  conclusive: boolean;
  /** Non-empty on a conclusive leaf; empty string on a dead-end leaf. */
  cause: string;
  /** Non-empty on a conclusive leaf; empty string on a dead-end leaf. */
  action: string;
  /** Optional guidance shown on a dead-end (inconclusive) leaf. */
  suggestion?: string;
}

/** Any node in the tree is either a question node or a leaf node. */
export type SymptomNode = QuestionNode | LeafNode;

/** The bundled decision tree: a root id plus a map of node id -> node. */
export interface SymptomTree {
  version: number;
  rootId: string;
  nodes: Record<string, SymptomNode>;
}

/**
 * A terminal diagnosis result, shape-compatible with the design's `Diagnosis`.
 * Conclusive diagnoses carry a non-empty cause/action; dead ends carry empty
 * strings with `conclusive = false`.
 */
export interface Diagnosis {
  cause: string;
  action: string;
  conclusive: boolean;
}

/**
 * The result of traversing the tree for a given sequence of answers. A
 * discriminated union over `kind` distinguishing the three possible outcomes:
 *  - `question`     : landed on a non-leaf node; carries that node's options.
 *  - `diagnosis`    : landed on a conclusive leaf; a Diagnosis (conclusive=true).
 *  - `inconclusive` : dead end / unresolved path; a Diagnosis (conclusive=false).
 */
export type TraversalResult =
  | { kind: 'question'; nodeId: string; question: string; answers: SymptomAnswer[] }
  | { kind: 'diagnosis'; conclusive: true; cause: string; action: string }
  | { kind: 'inconclusive'; conclusive: false };

/** Type guard: is this node a question (non-leaf) node? */
export function isQuestionNode(node: SymptomNode | undefined): node is QuestionNode {
  return (
    node != null &&
    typeof (node as QuestionNode).question === 'string' &&
    Array.isArray((node as QuestionNode).answers)
  );
}

/** Type guard: is this node a leaf (terminal) node? */
export function isLeafNode(node: SymptomNode | undefined): node is LeafNode {
  return (
    node != null &&
    !isQuestionNode(node) &&
    typeof (node as LeafNode).conclusive === 'boolean'
  );
}

/** The single inconclusive/dead-end result value. */
const INCONCLUSIVE: TraversalResult = { kind: 'inconclusive', conclusive: false };

/** Safely look up a node by id, returning undefined when absent. */
function getNode(tree: SymptomTree, id: string | undefined): SymptomNode | undefined {
  if (id == null || tree.nodes == null) {
    return undefined;
  }
  return tree.nodes[id];
}

/**
 * Classify the node we have arrived at into a `TraversalResult`.
 *
 * - A question node yields a `question` result exposing the EXACT answers array
 *   defined for that node in the tree data.
 * - A conclusive leaf (with non-empty cause and action) yields a `diagnosis`.
 * - Anything else (dead-end leaf, malformed node) yields `inconclusive`.
 */
function classify(node: SymptomNode | undefined): TraversalResult {
  if (isQuestionNode(node)) {
    return {
      kind: 'question',
      nodeId: node.id,
      question: node.question,
      answers: node.answers,
    };
  }
  if (isLeafNode(node) && node.conclusive && node.cause !== '' && node.action !== '') {
    return {
      kind: 'diagnosis',
      conclusive: true,
      cause: node.cause,
      action: node.action,
    };
  }
  return INCONCLUSIVE;
}

/**
 * Walk `tree` from its root, following the supplied sequence of `answers`
 * (each entry is the `value` chosen at the current question node), and return
 * the resulting `TraversalResult`.
 *
 * Behaviour (Property 16):
 *  (a) If the node reached is a NON-LEAF (question) node, the result is a
 *      `question` carrying that node's id, question text, and the exact set of
 *      answer options defined for it in the data.
 *  (b) If the node reached is a CONCLUSIVE leaf, the result is a `diagnosis`
 *      with `conclusive = true` and the node's non-empty cause and action.
 *  (c) If the path hits a dead end — an inconclusive leaf, an answer value with
 *      no match at the current node, a `next` pointing at a missing node, or a
 *      missing/ malformed root — the result is `inconclusive`
 *      (`conclusive = false`).
 *
 * Pure: depends only on its arguments and never throws on malformed input.
 *
 * Validates: Requirements 8.2, 8.3, 8.4
 */
export function traverseSymptomTree(
  tree: SymptomTree,
  answers: readonly string[],
): TraversalResult {
  let current = getNode(tree, tree.rootId);
  if (current === undefined) {
    return INCONCLUSIVE;
  }

  for (const value of answers) {
    // If we have already reached a terminal (leaf) node, traversal is over;
    // any further answers cannot be applied, so return the leaf's result.
    if (!isQuestionNode(current)) {
      return classify(current);
    }

    const chosen = current.answers.find((answer) => answer.value === value);
    if (chosen === undefined) {
      // The answer value doesn't match any option at this node -> dead end.
      return INCONCLUSIVE;
    }

    const nextNode = getNode(tree, chosen.next);
    if (nextNode === undefined) {
      // `next` points at a node that doesn't exist -> dead end.
      return INCONCLUSIVE;
    }

    current = nextNode;
  }

  return classify(current);
}

/**
 * Convert a `TraversalResult` into a `Diagnosis` when it is a terminal result
 * (a conclusive diagnosis or a dead end), or `null` when the result is still a
 * `question`. Convenience for callers (e.g. `onDiagnosisComplete(diagnosis)`).
 */
export function toDiagnosis(result: TraversalResult): Diagnosis | null {
  if (result.kind === 'diagnosis') {
    return { cause: result.cause, action: result.action, conclusive: true };
  }
  if (result.kind === 'inconclusive') {
    return { cause: '', action: '', conclusive: false };
  }
  return null;
}
