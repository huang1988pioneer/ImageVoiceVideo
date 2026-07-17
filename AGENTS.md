<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Agent skills

### Issue tracker

GitHub Issues on `huang1988pioneer/ImageVoiceVideo` (via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/` (created lazily by domain-modeling skills). See `docs/agents/domain.md`.

### Design context (Impeccable)

Product strategy in `PRODUCT.md`; visual system in `DESIGN.md` + `.impeccable/design.json`. Use `/impeccable <command>` for UI work ([impeccable.style](https://impeccable.style/)).
