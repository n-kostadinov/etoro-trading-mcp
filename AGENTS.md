# AGENTS.md

Guidance for AI agents working in this repository.

## Swagger drift failures: check eToro's announcements before acting

When the daily `Swagger drift` workflow fails (it exits non-zero naming each
changed OpenAPI source as soon as eToro publishes a change), or a manual update
hits a toolset mapping mismatch (`stale=<tag>` or `missing=<tag>` in
`compile-tool-catalog`), do not treat the raw Swagger document as the whole
story. eToro announces significant API changes — deprecations, withdrawals,
reinstatements — in advance through the API portal (announcements and dated
deprecation/withdrawal notices), outside the machine-readable Swagger document.
The 1.1.0 withdrawal of `social-feeds`, for example, followed published notices.

Check those sources before removing or re-adding a toolset. On 2026-11-02 the
Clubs API disappeared in Swagger v1.404.0 and returned in v1.405.0 the same day;
reacting to the raw document alone produced two releases within an hour of each
other (1.2.0 removing `clubs`, 1.3.0 restoring it — see
`plan/clubs-withdrawal-release.md` and `plan/clubs-restoration-release.md`).
A change with no matching announcement, or one that contradicts an announcement,
may be transient upstream churn — confirm before cutting a release. The manual
update playbook lives in `MAINTAINERS.md` under "Daily Swagger drift check".
