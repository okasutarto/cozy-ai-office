import {
  ManagerPlanSchema,
  type ManagerPlan,
  type CommandSpec,
  type TaskDraftVersion,
} from "../../shared/contracts.js";
import { RelativePathSchema } from "../../shared/contracts.js";
import { AppError } from "../errors.js";

export type ValidatedPlan = ManagerPlan & { topologicalOrder: string[] };

export function pathsOverlap(left: string, right: string): boolean {
  const a = left.replaceAll("\\", "/").replace(/\/$/u, "");
  const b = right.replaceAll("\\", "/").replace(/\/$/u, "");
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function isSubpath(sub: string, parent: string): boolean {
  const s = sub.replaceAll("\\", "/").replace(/\/$/u, "");
  const p = parent.replaceAll("\\", "/").replace(/\/$/u, "");
  return s === p || s.startsWith(`${p}/`);
}

export function validatePlan(
  input: unknown,
  draft: TaskDraftVersion,
  commands: CommandSpec[],
): ValidatedPlan {
  // 1. Parse ManagerPlanSchema
  const plan = ManagerPlanSchema.parse(input);

  // 2. Enforce unique IDs and known dependencies
  const taskIds = new Set<string>();
  for (const task of plan.tasks) {
    if (taskIds.has(task.id)) {
      throw new AppError("invalid_plan", `Duplicate task ID: ${task.id}`, 400);
    }
    taskIds.add(task.id);
  }

  for (const task of plan.tasks) {
    for (const depId of task.dependsOn) {
      if (depId === task.id) {
        throw new AppError("invalid_plan", `Task ${task.id} depends on itself`, 400);
      }
      if (!taskIds.has(depId)) {
        throw new AppError("invalid_plan", `Task ${task.id} has unknown dependency: ${depId}`, 400);
      }
    }
  }

  // 3. Compute Kahn topological order and reject cycles
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  for (const task of plan.tasks) {
    inDegree.set(task.id, 0);
    adjList.set(task.id, []);
  }

  for (const task of plan.tasks) {
    for (const depId of task.dependsOn) {
      adjList.get(depId)!.push(task.id);
      inDegree.set(task.id, inDegree.get(task.id)! + 1);
    }
  }

  const queue: string[] = [];
  const taskOrderMap = new Map<string, number>();
  plan.tasks.forEach((t, i) => taskOrderMap.set(t.id, i));

  for (const task of plan.tasks) {
    if (inDegree.get(task.id) === 0) {
      queue.push(task.id);
    }
  }

  queue.sort((a, b) => taskOrderMap.get(a)! - taskOrderMap.get(b)!);

  const topologicalOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topologicalOrder.push(curr);

    const neighbors = adjList.get(curr)!;
    for (const next of neighbors) {
      const newDegree = inDegree.get(next)! - 1;
      inDegree.set(next, newDegree);
      if (newDegree === 0) {
        queue.push(next);
      }
    }
    queue.sort((a, b) => taskOrderMap.get(a)! - taskOrderMap.get(b)!);
  }

  if (topologicalOrder.length !== plan.tasks.length) {
    throw new AppError("invalid_plan", "Dependency cycle detected in plan", 400);
  }

  // 4. Reject allowed/forbidden overlap inside each brief
  for (const task of plan.tasks) {
    for (const allowed of task.allowedPaths) {
      for (const forbidden of task.forbiddenPaths) {
        if (pathsOverlap(allowed, forbidden)) {
          throw new AppError(
            "invalid_plan",
            `Allowed path ${allowed} overlaps with forbidden path ${forbidden} in task ${task.id}`,
            400,
          );
        }
      }
    }
  }

  // 5. For every pair of write briefs with overlapping ownership, require a transitive dependency in one direction
  const reachable = new Map<string, Set<string>>();
  for (const task of plan.tasks) {
    reachable.set(task.id, new Set<string>());
  }

  for (const task of plan.tasks) {
    const visited = new Set<string>();
    const q = [task.id];
    while (q.length > 0) {
      const curr = q.shift()!;
      if (curr !== task.id) {
        reachable.get(task.id)!.add(curr);
      }
      for (const neighbor of adjList.get(curr)!) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          q.push(neighbor);
        }
      }
    }
  }

  for (let i = 0; i < plan.tasks.length; i++) {
    const taskA = plan.tasks[i]!;
    if (taskA.mode !== "write") continue;
    for (let j = i + 1; j < plan.tasks.length; j++) {
      const taskB = plan.tasks[j]!;
      if (taskB.mode !== "write") continue;

      let overlap = false;
      for (const pathA of taskA.allowedPaths) {
        for (const pathB of taskB.allowedPaths) {
          if (pathsOverlap(pathA, pathB)) {
            overlap = true;
            break;
          }
        }
        if (overlap) break;
      }

      if (overlap) {
        const A_depends_on_B = reachable.get(taskB.id)!.has(taskA.id);
        const B_depends_on_A = reachable.get(taskA.id)!.has(taskB.id);
        if (!A_depends_on_B && !B_depends_on_A) {
          throw new AppError(
            "invalid_plan",
            `Overlapping write tasks ${taskA.id} and ${taskB.id} must have a transitive dependency`,
            400,
          );
        }
      }
    }
  }

  // 6. Require every verificationCommands entry to match an approved CommandSpec ID
  const approvedCommandIds = new Set(commands.map((c) => c.id));
  for (const task of plan.tasks) {
    for (const cmdId of task.verificationCommands) {
      if (!approvedCommandIds.has(cmdId)) {
        throw new AppError(
          "invalid_plan",
          `Task ${task.id} uses unknown verification command ID: ${cmdId}`,
          400,
        );
      }
    }
  }

  // 7. Parse scope entries beginning with path: through RelativePathSchema; require write allowedPath beneath them
  const scopePaths: string[] = [];
  for (const entry of draft.scope) {
    if (entry.startsWith("path:")) {
      const pathPart = entry.substring("path:".length);
      scopePaths.push(RelativePathSchema.parse(pathPart));
    }
  }

  if (scopePaths.length > 0) {
    for (const task of plan.tasks) {
      if (task.mode !== "write") continue;
      for (const allowed of task.allowedPaths) {
        const ok = scopePaths.some((sp) => isSubpath(allowed, sp));
        if (!ok) {
          throw new AppError(
            "invalid_plan",
            `Allowed write path ${allowed} in task ${task.id} is outside the frozen draft scope`,
            400,
          );
        }
      }
    }
  }

  return {
    ...plan,
    topologicalOrder,
  };
}
