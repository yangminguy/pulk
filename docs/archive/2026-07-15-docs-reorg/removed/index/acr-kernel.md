# index · acr-kernel

전체: `docs/cto/ACR_KERNEL_REFACTOR_PLAN.md`, PRD §8/§14/§16.

- ACR = Executor. ExecutionRun(task vs run 분리) 중심.
- Harness 14단계(§14.3): validate → context pack → approval → mode → workspace → command guard → agent → logs → diff → verify → boundary → result packet → handoff → return.
- Harness 모드: direct(C0) · safe_solo(C1) · standard(C2) · strict(C3~C4) · parallel_patch(C5).
- Result Packet recommendation: merge_ready / human_review / retry_* / blocked / discard_patch.
- ACR repo: `/Users/wonminyang/Desktop/양원민 개발자/agent_control_room_docs` (`lib/harness/`, `lib/execution-run/`, `lib/worktree/`).
