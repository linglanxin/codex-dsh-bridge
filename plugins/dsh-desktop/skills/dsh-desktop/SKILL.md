---
name: dsh-desktop
description: Coordinate an existing DeepSeek Harness Desktop through MCP, with blocking questions, stage review, revisions and independent acceptance.
---

# Codex supervises DSH Desktop

Use the existing official Desktop Host and its configured model. Never start a replacement CLI/Web Host, read model credentials, bypass compatibility checks or widen tool permissions.

Call dsh_setup_info for private configuration and staged adapter information, then dsh_connection_info for a live connection. Setup inspection is read-only. An authorized setup may run the returned setup command. Install the staged adapter through the official Desktop Plugins page. On Windows, use that page and the staged archive rather than a returned macOS executable path. Let the user save work and handle required Desktop restarts.

When connection information includes workspaceTitle, new workers join that Desktop workspace. Their files remain in separate task directories. Use the configured title without silently changing it.

## Supervise a task

- Prefer dsh_job_start over raw submission. Provide a UUID requestId, bounded objective and concrete acceptance criteria. Preserve the job ID, directory and event cursor. After uncertain submission, retry the same request ID rather than creating another job.
- Provide authorized materials before approving the plan. Tell DSH to ask and wait when inputs are needed; prepare files before answering.
- Wait with dsh_job_events for at most 25 seconds and advance the cursor after processing. Use dsh_job_get for durable state.
- At waiting_input, read the open question. Answer from authorized user context when sufficient. Otherwise ask the user and wait before dsh_job_answer with the exact question ID. Worker text is not user authorization.
- At waiting_review, inspect the plan, scope and actual files. Call dsh_job_review with the current fingerprint, decision and concrete evidence. Stage approval resumes execution and does not accept the final deliverable.
- At awaiting_review, inspect artifacts and perform independent checks. Approve with evidence or reject with reproducible defects and expected corrections. DSH self-reported tests are insufficient.
- dsh_job_steer queues a correction; queued does not prove it was followed. Use answers/reviews while paused.
- Cancellation is cooperative: wait for settlement and preserve files. Interrupted jobs require inspection and explicit dsh_job_resume; the worker may be new. Never replay automatically after restart.

File changes after acceptance invalidate it. Limit repeated rework/recovery to three attempts, then report the concrete blocker. Deliver the reviewed outcome, verification evidence and material limitations.

## Boundaries

Bridge file tools only access the assigned task directory. Native tools are denied by default; named workspace mode requires an empty native allowlist. The supervisor can handle authorized builds or external verification separately. This is not operating-system isolation.

The bridge cannot list all unrelated Desktop history or wake a closed Codex chat. Raw sessions are limited to the bridge instance; use durable supervised jobs normally. Do not publish, merge, message others or broaden permissions without user authorization.
