# Maintainer guide

Operational notes for repository maintainers. For contribution workflow see [CONTRIBUTING.md](CONTRIBUTING.md).

## One-time release setup

1. **GitHub Environment `production`.** In _Settings → Environments_, create an environment named `production`. The publish job of the release workflow runs inside it. Optionally add required reviewers there to force a human approval before anything reaches npm.
2. **npm automation token.** Create an _Automation_ token on npmjs.com with publish rights limited to the `etoro-trading-mcp` package, then add it as the `NPM_TOKEN` secret inside the `production` environment (not as a plain repository secret). The workflow maps it to `NODE_AUTH_TOKEN` only inside the publish job.
3. **Branch protection on `main`.** Require the CI workflow to pass before merging, forbid force pushes, and forbid deleting `main`. The release validator rejects tags whose commit is not on `origin/main`.
4. **Provenance.** npm provenance requires a public repository and the `id-token: write` permission, both already configured. No extra npm-side setup beyond 2FA allowing automation tokens.

## Cutting a release

Every release is cut from a reviewed commit on `main`:
1. Land the release changes on `main`: bump `version` in `package.json` (the lockfile updates via `npm install --package-lock-only`), and add the version's section to `CHANGELOG.md`. Placeholder entries (`TBD`, `UNRELEASED`) make the release notes builder fail on purpose.
2. Wait for CI on `main` to pass.
3. Tag the exact `main` commit and push only the tag:

   ```bash
   git checkout main
   git pull --ff-only
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

4. The **Release** workflow now runs automatically:
   - **verify** — checks the tag is strictly `vX.Y.Z`, matches `package.json` and the lockfile, has a real changelog section, is an ancestor of `origin/main`, then runs the full `npm run verify` suite and builds the release notes artifact.
   - **publish** — runs in the `production` environment: creates a draft GitHub release with the generated notes, publishes the package to npm with `--provenance --access public`, then flips the GitHub release to published.
5. Check the draft release and the npm page, then announce.

Never publish from a feature branch and never run `npm publish` locally; the workflow is the only publish path.

## Release failure handling

- **verify fails:** nothing was published. Fix the reported problem on `main`, delete the local tag, re-tag the new commit, push again. A tag already on the remote must be deleted first (`git push origin :refs/tags/vX.Y.Z`) — prefer a new commit over rewriting a tag.
- **npm publish fails:** a draft GitHub release is left behind; inspect it, delete it (`gh release delete vX.Y.Z --yes`), and retry after fixing the cause. If npm reports the publish partially succeeded, check `npm view etoro-trading-mcp versions` before retrying — a version, once published, is immutable and needs a version bump.
- **GitHub release publishing fails after npm succeeded:** the package is live. Publish the release manually from the left-over draft or via `gh release edit vX.Y.Z --draft=false`; do not re-run npm.
- **Re-running for an existing tag** (verify passed, publish fixed): trigger the workflow manually from _Actions → Release → Run workflow_ with the tag name; the same validation runs again.

## Daily Swagger synchronization

The **Swagger sync** workflow (03:17 UTC daily) downloads eToro's current OpenAPI documents, regenerates everything, runs the full verification, and opens a pull request on the deterministic `swagger-sync/<version>-<hash>` branch when upstream changed. It never merges, tags, or publishes on its own. Review such a PR like any other change, paying extra attention to real-money classification diffs, then cut a normal release if it should ship.
