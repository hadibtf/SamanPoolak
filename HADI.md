# HADI.md

Copy-paste commands for quick personal work in this repo.

## Git

```bash
git status --short
git add .
git commit -m "your commit message" -m "Co-Authored-By: Codex <noreply@openai.com>"
git push
```

If you want to review changes before committing:

```bash
git diff
git status
```

If the remote moved ahead and you need to update your branch first:

```bash
git pull --rebase
git push
```

## Local development

```bash
npm start
```

## Build check

```bash
npm run build
```

Run this before deploying. The build fails on lint warnings.

## Deploy

```bash
npm run deploy:web
npm run deploy:api
npm run deploy:landing
npm run deploy:all
```

## Useful checks

```bash
git log --oneline -n 5
git branch --show-current
rg -n "TODO|FIXME" src server todo
```

## Notes

- Keep database storage changes backward compatible unless the server schema is updated too.
- If you change backend tables or columns, remember the live database still needs a manual `CREATE` or `ALTER` step.
- After a web deploy, hard refresh the browser if the update does not appear immediately.
