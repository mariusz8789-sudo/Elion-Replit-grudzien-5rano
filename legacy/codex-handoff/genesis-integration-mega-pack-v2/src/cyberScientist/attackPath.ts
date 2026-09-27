export interface CyberMatrixNode {
  id: string;
  type: "ASSET" | "SERVICE" | "IDENTITY" | "DATA" | "CONTROL" | "TRUST_BOUNDARY";
}

export interface CyberMatrixEdge {
  from: string;
  to: string;
  relation: string;
  riskWeight: number;
}

export interface AttackPath {
  nodes: string[];
  score: number;
  label: "ABSTRACT_SANDBOX_SIMULATION";
}

/** Unchanged from V1 (no defect found — genuine, self-contained, dependency-free graph
 * algorithm operating only on caller-constructed in-memory data; every result is
 * force-labeled ABSTRACT_SANDBOX_SIMULATION and cannot represent a real-world action). */
export function rankAbstractAttackPaths(
  nodes: readonly CyberMatrixNode[],
  edges: readonly CyberMatrixEdge[],
  startId: string,
  maxDepth = 4
): AttackPath[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (!nodeIds.has(startId)) return [];
  const out: AttackPath[] = [];

  const walk = (current: string, path: string[], score: number, depth: number) => {
    if (depth >= maxDepth) {
      out.push({ nodes: [...path], score, label: "ABSTRACT_SANDBOX_SIMULATION" });
      return;
    }
    const next = edges.filter((e) => e.from === current && !path.includes(e.to));
    if (next.length === 0) {
      out.push({ nodes: [...path], score, label: "ABSTRACT_SANDBOX_SIMULATION" });
      return;
    }
    for (const edge of next) walk(edge.to, [...path, edge.to], score + edge.riskWeight, depth + 1);
  };

  walk(startId, [startId], 0, 0);
  return out.sort((a, b) => b.score - a.score);
}
