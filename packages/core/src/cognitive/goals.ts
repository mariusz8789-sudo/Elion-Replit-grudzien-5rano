import { Goal, GoalPriority } from './types.js';

const PRIORITY: Record<GoalPriority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export class GoalManager {
  private goals: Goal[] = [];

  add(goal: Goal): void {
    if (!this.goals.some((existing) => existing.id === goal.id)) this.goals.push(goal);
  }

  replace(goals: Goal[]): void { this.goals = [...goals]; }

  active(limit = 8): Goal[] {
    return [...this.goals].sort((a, b) => PRIORITY[b.priority] - PRIORITY[a.priority] || a.createdAt - b.createdAt).slice(0, limit);
  }

  get(id: string): Goal | undefined { return this.goals.find((goal) => goal.id === id); }
}
