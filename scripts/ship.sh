#!/usr/bin/env bash
# Push to GitHub without clashing with the "Rebuild public/" commits that
# .github/workflows/build-site.yml makes after every push.
#
#   git ship        (alias set up with: git config alias.ship '!bash scripts/ship.sh')
#
# 1. Sets aside any local hugo output in public/ (kept in `git stash list`).
# 2. Takes public/ out of any unpushed commits, since GitHub builds it.
# 3. Pulls the latest commits (rebasing yours on top) and pushes.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

branch=main
git fetch -q origin "$branch"

# 1. Local hugo output in public/ would clash with the workflow's rebuild.
if [ -n "$(git status --porcelain -- public)" ]; then
  git stash push -q -u -m "ship: local public/ build $(date '+%Y-%m-%d %H:%M')" -- public
  echo "Set aside local public/ changes (git stash list to see them)."
fi

# 2. Strip public/ out of unpushed commits.
base=$(git merge-base HEAD "origin/$branch")
if [ -n "$(git diff --name-only "$base" HEAD -- public)" ]; then
  if ! git diff --cached --quiet; then
    echo "You have staged changes that aren't committed. Commit or unstage them, then run git ship again." >&2
    exit 1
  fi
  message=$(git log --reverse --format='%s' "$base..HEAD" | paste -sd ';' - | sed 's/;/; /g')
  added=$(git diff --name-only --diff-filter=A "$base" HEAD -- public)
  git reset -q --soft "$base"
  git reset -q -- public
  git checkout -q -- public
  # Files the commits added to public/ are now untracked; remove them so the
  # workflow's copies can be pulled. (Still recoverable via git reflog.)
  [ -n "$added" ] && printf '%s\n' "$added" | while IFS= read -r f; do rm -f -- "$f"; done
  if git diff --cached --quiet; then
    echo "Your unpushed commits only changed public/, which GitHub builds, so there's nothing to push."
    exit 0
  fi
  git commit -q -m "$message"
  echo "Removed public/ from your commit (GitHub rebuilds it)."
fi

# 3. Pull, then push. Retry once in case the workflow pushes in between.
for attempt in 1 2; do
  git pull -q --rebase --autostash origin "$branch"
  if git push -q origin "$branch"; then
    echo "Pushed. GitHub will rebuild the site in a minute or two."
    exit 0
  fi
  echo "Push rejected, pulling again..."
done
echo "Push still rejected. Run git ship again in a minute." >&2
exit 1
