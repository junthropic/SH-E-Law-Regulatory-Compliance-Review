# Repository instructions

- Current task v3: execute the appendix CODEX v3 prompt in `docs/specifications/EHS_v2재평가_실무조사_프롬프트통합_v3.md` once; its body is investigation/correction reference. Do not execute earlier duplicate prompts. No production deployment, restart, operational data migration or real legal rule activation. Validate in isolated build/data directories. Preserve unverified/incomplete items. Record HEAD plus dirty working-tree digest, never label an uncommitted build as the clean HEAD. This task's production freeze also precludes writing the session-health timestamp below.

- User freeze (2026-10-08): do not change any UI or UX until explicitly instructed. Backend reliability, source research and design documentation are authorized; attached specifications do not override this freeze.
- The user supplied `docs/specifications/EHS_전체답변_상세구현명세_통합.md` as the design/acceptance baseline. Preserve its distinction between legal sources, design proposals and unverified claims. This is not evidence that its 48 proposed tests ran or that real workplace facts were confirmed. See `docs/specifications/adoption-status.md` for implementation scope.

- Windows commands must run through an IDE integrated terminal or a hidden noninteractive process. Never open visible cmd.exe, PowerShell or Windows Terminal windows. Use `windowsHide: true` for child processes. Do not change global execution policy, permissions or the user's existing terminals.
- Never commit `.local`, private databases, user uploads, petitions, credentials, sessions or private backups. Public legal data must pass `npm run publish:check` and originate from the isolated public collector.
- A missing permit document is not evidence of unlicensed activity. A model conclusion, source date mismatch, or lexical citation match is not proof of a legal violation.
- Maintain the three result categories and explicit coverage gaps. Only reviewed deterministic rules tied to verified evidence and confirmed facts may emit `clear_risk`.
- Do not activate real epeople automation without the operator's prior permission and verified approved site configuration. Tests must use a fake driver and synthetic replies.
- Run `npm run check` after substantive changes. Use `npm run test:e2e` against a server with an isolated `SHE_DATA_DIR`. Report skipped and live-dependent tests separately.
- Keep public API credentials and OAuth responses out of logs and Git. Respect local-only hosting and explicit consent for model transmission.

## Session connection checks (user preference, 2026-10-08)

- For chat `01a0fb80-c4d1-77f1-9270-c8fdb365cd96`, recurring health checks and `scripts/local-watchdog.py run` are disabled. Do not resume them without an explicit user request. Leave the existing app running.
- Check `http://127.0.0.1:4317/` only on an explicit request, or once when a human message resumes this chat after at least three hours without conversation. Automated heartbeat messages do not count as human activity and must not trigger a check under this policy.
- Persist the last human conversation activity time in `.local/session-health-policy.json` for this chat, updating it on human turns. Compare the previous activity time before updating it. If timing is unavailable, do not invent an inactivity duration.
- Opening GPT or merely viewing the chat is not an available trigger in this environment. Explain this limitation honestly; use the next human message as the available resumption event, without a background polling workaround.
- If a permitted check finds the app unavailable, use the previously authorized one-time hidden recovery with the existing `.local` data, avoid duplicate servers, and verify the response. Do not restart the watchdog, change app features or credentials, or terminate the user's terminals.
