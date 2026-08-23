# Git workflow

```
main      protected, tagged releases only
develop   integration branch — all features merge here first
feature/* one per member per subsystem
```

Daily loop:

```bash
git checkout develop && git pull
git checkout -b feature/<subsystem>
# work, commit often
git push -u origin feature/<subsystem>
# open a PR into develop, ask a teammate to review
```

Rules:
- Never push directly to `main` or `develop`.
- Anything touching `shared/` or `docker-compose.yml` needs the leader's review.
- Keep PRs small. Delete the branch after merge.
- Commit style: `feat(collector): add MinHash dedup`, `fix(entity): ...`,
  `docs(rai): ...`, `test(critic): ...`.

Every member needs their own commits, branches and PRs — the viva marks
individual contribution and `git log` is the evidence.
