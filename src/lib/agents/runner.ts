// AgentRunner interface. ClaudeCodeManualRunner is the only runner in Phase 2: a human operator in Claude Code runs
// /thb-run-agent, which fetches the packet and submits the output through the CLI. An API runner can implement the same
// interface later using the same packets and schemas; none is built here (out of scope).
import type { AgentKey } from "./schemas";

export interface AgentRunner {
  readonly kind: "claude-code-manual" | "anthropic-api";
  /** Queue work for an agent; returns the run id. */
  enqueue(agent: AgentKey, opportunityId: string): Promise<{ runId: string }>;
}

export class ClaudeCodeManualRunner implements AgentRunner {
  readonly kind = "claude-code-manual" as const;
  constructor(private queue: (agent: AgentKey, opportunityId: string) => Promise<{ run: { id: string } }>) {}
  async enqueue(agent: AgentKey, opportunityId: string) {
    const { run } = await this.queue(agent, opportunityId);
    return { runId: run.id }; // execution happens when the operator runs /thb-run-agent <run_id>
  }
}
