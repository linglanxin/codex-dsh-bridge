# Releasing

Releases are prepared manually. CI runs checks without publishing packages or releases.

1. Update package/plugin versions, the compatibility matrix and CHANGELOG.
2. Run `npm ci`, `npm run check`, `npm run test:compatibility`, `npm run format:check` and `npm audit`.
3. Build with `npm run package:plugin`, then run `npm run verify:plugin`.
4. Inspect the archives for private configuration, credentials and workspace files. Check LICENSE, NOTICE and bundled dependency notices.
5. Test the extracted marketplace from a separate directory. Record Desktop acceptance results and remaining gaps in [VALIDATION.md](VALIDATION.md).
6. Commit the source, bundled runtime and Desktop adapter archive. Create the release tag on that commit.
7. Upload the Codex plugin ZIP, Desktop adapter TGZ, source ZIP and `SHA256SUMS.txt`. Verify uploaded digests against local files.
8. Write release notes covering features, supported versions and installation links.

Keep experimental releases marked as prereleases. npm distribution and repository visibility are managed separately from GitHub Releases.

## npm

The package includes the standalone MCP server and Desktop adapter. The Codex marketplace remains a separate distribution.

1. Complete `repository`, `homepage`, `bugs`, author and license metadata. Check the package name and npm account with `npm whoami`.
2. Run the local package check above and `npm run verify:npm -- --package ./outputs/dsh-desktop-mcp-bridge-0.2.1-rc2.tgz`.
3. Commit metadata and build artifacts. Publish the reviewed tarball with `npm publish ./outputs/dsh-desktop-mcp-bridge-0.2.1-rc2.tgz --ignore-scripts --access public --tag next`.
4. Compare the registry tarball integrity with the local archive. Run `npm run verify:npm` to install from a fresh anonymous registry cache.
5. Install the exact registry version through the Desktop-owned plugin installer after saving work and quitting Desktop. Reopen Desktop and test the installed MCP client against it.

Prereleases use the `next` dist-tag; documentation pins an exact version. A published package/version cannot be replaced, even after unpublishing. See the [npm policy](https://docs.npmjs.com/policies/unpublish/). Automated publishing can use [trusted publishing](https://docs.npmjs.com/trusted-publishers/) once configured for the package.
