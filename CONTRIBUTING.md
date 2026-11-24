# Contributing

Thanks for taking a look. Jmeet is a school project, so changes are small and reviewed by hand.

1. Create a branch with a matching prefix, for example `feat/short-description` or `fix/short-description`.
2. Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `style:`, `perf:`, `test:`, `ci:`. Write a short imperative subject (72 characters or less), a blank line, then one bullet per change. Example: `feat: add CSV export`.
3. Leave the version alone. It changes only in a release commit (`chore: release vX.Y.Z`), which follows SemVer and updates `package.json` and the README version badge.
4. Run `npm test` and the [manual checklist](docs/testing.md#manual-checklist) before opening a pull request.
5. Update the README and `docs/` with every change.

Every key belongs in `config.bzg` and the certificate in `cert/`. Both are gitignored: never commit them, not even once, because they stay in the history.

By contributing you agree that your changes fall under the project's [LICENSE](LICENSE).
