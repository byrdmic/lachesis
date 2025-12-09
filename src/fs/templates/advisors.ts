// Advisors.json template
import type { ProjectDefinition } from "../../core/project/types.ts";

export function generateAdvisorsJson(project: ProjectDefinition): string {
  return JSON.stringify(project.advisorsConfig, null, 2);
}
