# Deployment

## Local development

The local Docker workflow is documented in the repository's
[Local development guide](../docs/LOCAL-DEVELOPMENT.md). It covers setup on a
new computer, the local-only PHP configuration, admin seeding, Compose services,
ports, persistent data, reset behavior, and troubleshooting. Keep
`config.local.php` out of hosted deployments; production continues to use
`config.php` and the production deploy scripts.

Deployment (front-end **and** back-end) is documented at the repo root: **[../DEPLOY.md](../DEPLOY.md)**.
