import { Goal, Plan } from './types.js';
import { WorldModel } from './worldModel.js';
import { stableHash } from './hash.js';

export class CognitivePlanner {
  createPlan(goal: Goal, world: WorldModel, now = Date.now()): Plan {
    const target = goal.targetEntityIds[0];
    const targetEntity = target ? world.getEntity(target) : undefined;
    const hasTarget = Boolean(targetEntity);
    const planId = `plan-${stableHash({ goalId: goal.id, target, world: world.summarize() })}`;
    return {
      id: planId,
      goalId: goal.id,
      status: hasTarget ? "PROPOSED" : "BLOCKED",
      rationale: hasTarget ? `Target ${targetEntity?.label ?? target} exists in the current world model.` : "Target entity is not present in the world model.",
      steps: [
        {
          id: `${planId}-inspect`,
          actionType: "INSPECT_TARGET",
          description: `Inspect target ${targetEntity?.label ?? target ?? "unspecified"}.`,
          targetEntityId: target,
          requiresApproval: false,
          deterministic: true,
          expectedEvidence: ["TARGET_STATE"],
        },
      ],
      createdAt: now,
    };
  }
}
