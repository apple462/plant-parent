// Feature: plant-parent, Property 16: Symptom Checker Decision Tree Traversal
//
// Property 16: For any valid sequence of answers that follows a defined path
// through a symptom tree, traverseSymptomTree(tree, answers) must:
//   (a) at each NON-LEAF (question) node, return the EXACT set of answer
//       options defined for that node in the tree data;
//   (b) at a CONCLUSIVE leaf node, return a Diagnosis with non-empty `cause`
//       and `action` and `conclusive = true`;
//   (c) at a DEAD-END node (inconclusive leaf, or an undefined/unresolvable
//       path), return `conclusive = false`.
//
// Two complementary strategies are exercised:
//   1) Against the REAL bundled tree (src/data/symptomTree.json).
//   2) Against ARBITRARY generated, well-formed trees.
//
// Validates: Requirements 8.2, 8.3, 8.4

import fc from 'fast-check';
import realSymptomTree from '../../data/symptomTree.json';
import {
  traverseSymptomTree,
  isQuestionNode,
  isLeafNode,
  type SymptomTree,
  type SymptomNode,
  type QuestionNode,
  type LeafNode,
  type SymptomAnswer,
} from '../notificationUtils';

const tree = realSymptomTree as unknown as SymptomTree;

// ---------------------------------------------------------------------------
// Helpers shared across strategies
// ---------------------------------------------------------------------------

/** Collect every answer `value` defined anywhere in a tree's question nodes. */
function allAnswerValues(t: SymptomTree): string[] {
  const values: string[] = [];
  for (const node of Object.values(t.nodes)) {
    if (isQuestionNode(node)) {
      for (const a of node.answers) values.push(a.value);
    }
  }
  return Array.from(new Set(values));
}

// ===========================================================================
// Strategy 1 — against the REAL bundled tree
// ===========================================================================

describe('traverseSymptomTree against the real bundled tree (Property 16)', () => {
  const knownValues = allAnswerValues(tree);

  // An arbitrary answer token: a mix of valid answer values and random strings.
  const answerToken = fc.oneof(
    fc.constantFrom(...knownValues),
    fc.string(),
  );

  it('invariants hold for arbitrary answer sequences', () => {
    fc.assert(
      fc.property(fc.array(answerToken, { maxLength: 12 }), (answers) => {
        const result = traverseSymptomTree(tree, answers);

        if (result.kind === 'question') {
          // (a) The returned answers must EQUAL the data node's answers exactly.
          const node = tree.nodes[result.nodeId];
          expect(isQuestionNode(node)).toBe(true);
          const qNode = node as QuestionNode;
          expect(result.answers).toEqual(qNode.answers);
          expect(result.question).toBe(qNode.question);
        } else if (result.kind === 'diagnosis') {
          // (b) Conclusive leaf -> non-empty cause/action, conclusive true.
          expect(result.conclusive).toBe(true);
          expect(typeof result.cause).toBe('string');
          expect(typeof result.action).toBe('string');
          expect(result.cause.length).toBeGreaterThan(0);
          expect(result.action.length).toBeGreaterThan(0);
        } else {
          // (c) Dead end / unresolved path -> conclusive false.
          expect(result.kind).toBe('inconclusive');
          expect(result.conclusive).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('faithfully follows defined valid paths to their leaf', () => {
    // Generator: starting at root, at each question node pick one of its actual
    // answers at random, building a valid path until a leaf is reached.
    const validPathArb = fc
      .infiniteStream(fc.nat())
      .map((stream) => {
        const it = stream[Symbol.iterator]();
        const answers: string[] = [];
        let current: SymptomNode | undefined = tree.nodes[tree.rootId];
        let guard = 0;
        while (current && isQuestionNode(current) && guard < 50) {
          const qNode: QuestionNode = current;
          const idx = it.next().value % qNode.answers.length;
          const chosen = qNode.answers[idx];
          answers.push(chosen.value);
          current = tree.nodes[chosen.next];
          guard += 1;
        }
        return { answers, leaf: current };
      });

    fc.assert(
      fc.property(validPathArb, ({ answers, leaf }) => {
        const result = traverseSymptomTree(tree, answers);

        // A valid path always terminates at a leaf node.
        expect(leaf).toBeDefined();
        expect(isLeafNode(leaf)).toBe(true);
        const leafNode = leaf as LeafNode;

        if (leafNode.conclusive) {
          expect(result.kind).toBe('diagnosis');
          if (result.kind === 'diagnosis') {
            expect(result.conclusive).toBe(true);
            expect(result.cause).toBe(leafNode.cause);
            expect(result.action).toBe(leafNode.action);
          }
        } else {
          expect(result.kind).toBe('inconclusive');
          if (result.kind === 'inconclusive') {
            expect(result.conclusive).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('returns the exact root answer set for the empty answer sequence', () => {
    const result = traverseSymptomTree(tree, []);
    expect(result.kind).toBe('question');
    if (result.kind === 'question') {
      const root = tree.nodes[tree.rootId] as QuestionNode;
      expect(result.nodeId).toBe(tree.rootId);
      expect(result.answers).toEqual(root.answers);
    }
  });
});

// ===========================================================================
// Strategy 2 — against ARBITRARY generated, well-formed trees
// ===========================================================================

/**
 * Build a small, well-formed SymptomTree. Layout:
 *   root question -> each answer points to one of: another question, a
 *   conclusive leaf, or a dead-end leaf. Every `next` references a real node.
 */
function buildArb() {
  return fc
    .record({
      // a couple of conclusive leaves
      causes: fc.array(
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
        ),
        { minLength: 1, maxLength: 3 },
      ),
      // number of intermediate question nodes
      questionCount: fc.integer({ min: 1, max: 3 }),
      // seeds used to wire answers to targets
      seeds: fc.array(fc.nat(), { minLength: 6, maxLength: 30 }),
    })
    .map(({ causes, questionCount, seeds }) => {
      const nodes: Record<string, SymptomNode> = {};

      // conclusive leaves
      const conclusiveIds: string[] = [];
      causes.forEach(([cause, action], i) => {
        const id = `leaf_c_${i}`;
        conclusiveIds.push(id);
        const leaf: LeafNode = { id, conclusive: true, cause, action };
        nodes[id] = leaf;
      });

      // a dead-end leaf
      const deadId = 'leaf_dead';
      const deadLeaf: LeafNode = { id: deadId, conclusive: false, cause: '', action: '' };
      nodes[deadId] = deadLeaf;

      // candidate targets a question answer can point to
      const targets = [...conclusiveIds, deadId];

      // question nodes q0..q(n-1); q0 is root. Each answer points to either a
      // later question or a leaf, so every `next` is a real node.
      let seedIdx = 0;
      const nextSeed = () => seeds[seedIdx++ % seeds.length];

      for (let i = 0; i < questionCount; i++) {
        const id = `q${i}`;
        const answerCount = (nextSeed() % 3) + 1; // 1..3 answers
        const answers: SymptomAnswer[] = [];
        for (let a = 0; a < answerCount; a++) {
          // later questions are valid forward targets too
          const laterQuestions: string[] = [];
          for (let j = i + 1; j < questionCount; j++) laterQuestions.push(`q${j}`);
          const pool = [...laterQuestions, ...targets];
          const next = pool[nextSeed() % pool.length];
          answers.push({ label: `label_${i}_${a}`, value: `v${i}_${a}`, next });
        }
        const q: QuestionNode = { id, question: `question ${i}`, answers };
        nodes[id] = q;
      }

      const t: SymptomTree = { version: 1, rootId: 'q0', nodes };
      return t;
    });
}

describe('traverseSymptomTree against arbitrary generated trees (Property 16)', () => {
  it('at a question node returns the node\'s exact defined answers', () => {
    fc.assert(
      fc.property(buildArb(), (t) => {
        // The empty path lands on the root question node.
        const result = traverseSymptomTree(t, []);
        expect(result.kind).toBe('question');
        if (result.kind === 'question') {
          const root = t.nodes[t.rootId] as QuestionNode;
          expect(result.nodeId).toBe(t.rootId);
          expect(result.answers).toEqual(root.answers);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('following a defined answer value leads to the linked node', () => {
    fc.assert(
      fc.property(buildArb(), fc.nat(), (t, seed) => {
        const root = t.nodes[t.rootId] as QuestionNode;
        const chosen = root.answers[seed % root.answers.length];
        const result = traverseSymptomTree(t, [chosen.value]);
        const linked = t.nodes[chosen.next];

        if (isQuestionNode(linked)) {
          expect(result.kind).toBe('question');
          if (result.kind === 'question') {
            expect(result.nodeId).toBe(linked.id);
            expect(result.answers).toEqual(linked.answers);
          }
        } else if (isLeafNode(linked) && linked.conclusive) {
          expect(result.kind).toBe('diagnosis');
          if (result.kind === 'diagnosis') {
            expect(result.cause).toBe(linked.cause);
            expect(result.action).toBe(linked.action);
            expect(result.conclusive).toBe(true);
          }
        } else {
          expect(result.kind).toBe('inconclusive');
          if (result.kind === 'inconclusive') {
            expect(result.conclusive).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('an answer value not present at the current node yields inconclusive', () => {
    fc.assert(
      fc.property(buildArb(), fc.string(), (t, token) => {
        const root = t.nodes[t.rootId] as QuestionNode;
        const isValid = root.answers.some((a) => a.value === token);
        fc.pre(!isValid); // only test tokens that are NOT valid options
        const result = traverseSymptomTree(t, [token]);
        expect(result.kind).toBe('inconclusive');
        if (result.kind === 'inconclusive') {
          expect(result.conclusive).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('a `next` pointing to a missing node yields inconclusive', () => {
    fc.assert(
      fc.property(buildArb(), (t) => {
        // Point the root's first answer at a node id that does not exist.
        const root = t.nodes[t.rootId] as QuestionNode;
        const broken: SymptomTree = {
          ...t,
          nodes: {
            ...t.nodes,
            [t.rootId]: {
              ...root,
              answers: [
                { label: 'broken', value: '__broken__', next: '__missing_node__' },
                ...root.answers,
              ],
            } as QuestionNode,
          },
        };
        const result = traverseSymptomTree(broken, ['__broken__']);
        expect(result.kind).toBe('inconclusive');
        if (result.kind === 'inconclusive') {
          expect(result.conclusive).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('a missing/unresolvable root yields inconclusive', () => {
    const empty: SymptomTree = { version: 1, rootId: 'nope', nodes: {} };
    const result = traverseSymptomTree(empty, []);
    expect(result.kind).toBe('inconclusive');
    if (result.kind === 'inconclusive') {
      expect(result.conclusive).toBe(false);
    }
  });
});
