# Issue tracker — GitHub Issues

Issues for this repository live in **GitHub Issues** on `mohmaedeslam00116/ZEUS`:

> https://github.com/mohmaedeslam00116/ZEUS/issues

All issue reads and writes go through the [`gh`](https://cli.github.com/) CLI.

## Rules for agents

- Read issues with `gh issue view <n> --comments`; list with
  `gh issue list --state open` (add `--label <label>` to filter).
- Create issues with `gh issue create --title "..." --body "..."`.
- Update by editing the body (`gh issue edit <n> --body "..."`) or commenting
  (`gh issue comment <n> --body "..."`) — prefer commenting for discussion;
  edit the body only to refine the original report.
- Keep one issue per unit of work. Titles imperative and specific; acceptance
  criteria belong in the body, not in comments.
- Reference issues from commits and PRs as `#<n>`.
- If `gh` is missing or unauthenticated, stop and report to the user — do not
  fall back to another tracker or invent issue numbers.

## PRs as a request surface

`prs_as_request_surface: false`

Open pull requests are **not** part of the triage queue. Set this flag to
`true` if open PRs should be considered alongside issues by triage-style
workflows.
