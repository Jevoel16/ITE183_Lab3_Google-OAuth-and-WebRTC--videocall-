# Security policy

## Supported versions

Only the latest version on `main` gets fixes.

## Reporting a vulnerability

Please don't open a public issue. Report it privately through [GitHub's private vulnerability reporting](https://github.com/Jevoel16/ITE183_Lab3_Google-OAuth-and-WebRTC--videocall-/security/advisories/new) with the steps to reproduce it and what an attacker could do. I'll reply within a week.

## Known limits

Jmeet is a local lab, not a production app. The Bonezegei server can't verify Google ID token signatures and trusts the profile the browser sends, as described in [docs/architecture.md](docs/architecture.md#security-note). Reports about that limit are known and won't be fixed in this project.
