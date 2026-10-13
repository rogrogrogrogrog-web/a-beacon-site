# Loaded by this repo's VS Code terminal (.vscode/settings.json).
# Makes `git push` run `git ship` (scripts/ship.sh), which pulls the
# workflow's "Rebuild public/" commits and keeps public/ out of your commits.
# Everything else, and git outside this repo, behaves as normal.
function git {
    $repo = (Resolve-Path "$PSScriptRoot\..").Path
    if ($args.Count -eq 1 -and $args[0] -eq 'push' -and (Get-Location).Path.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) {
        & git.exe ship
    } else {
        & git.exe @args
    }
}
