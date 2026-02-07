# Agent Instructions (endfield-auto)

## Objective
Maintain a reliable, Docker-friendly, statically typed attendance automation service for Endfield with scheduled execution, credential lifecycle handling, and optional external integrations.

## Operating Guardrails
- Keep implementation modular, readable, and easy to test.
- Preserve existing behavior unless a change is explicitly requested or clearly fixes a defect.
- Favor configuration-driven behavior over hard-coded assumptions.
- Use strong logging and explicit error handling; avoid silent failures.
- Keep documentation aligned with actual runtime behavior.

## Integration Guardrails
- Treat external platform/API behavior as mutable; verify current behavior when uncertain.
- Prefer robust request/response handling and safe retry/refresh patterns where appropriate.
- Keep integrations operationally clear for both automated notifications and manual triggers.
- Maintain startup/scheduled flow reliability and timezone-aware date handling.
- Keep user-facing integration outputs concise, friendly, and in-universe/flavorful where applicable.
- Keep terminal output and logs administrative and diagnostic-friendly, with actionable technical detail.

## Data and Security Guardrails
- Never commit secrets or sensitive user data.
- Do not require storing user passwords.
- Persist operational data in `DATA_PATH` for container-friendly durability.
- Captured live-site artifacts are stored under `DATA_PATH/test_data` (HAR files, cookies/local storage exports, saved JavaScript files).
- Treat these artifacts as sensitive reference data and avoid exposing raw values in logs/docs.

## Configuration Guardrails
- Use `.env`/environment variables as the primary configuration surface.
- Keep optional integrations optional and fail-soft when not configured.
- Ensure sensible defaults exist for local and Docker execution.

## When Unsure
- Check repository context first, then verify uncertain external behavior.
- Ask for user confirmation before implementing speculative or high-impact changes.
