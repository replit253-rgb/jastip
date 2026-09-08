---
name: Dependency firewall install
description: How to handle imported workspace installs when the package firewall rejects a direct dependency.
---

When the package firewall blocks a direct dependency, prefer a mature stable release that satisfies the project API and pin it exactly if a caret range could resolve to a newly published release.

**Why:** The workspace enforces a minimum release age, and the registry can independently reject an older package; using the newest visible release may introduce a second age-policy failure.

**How to apply:** Check release dates and compatibility, update only the affected dependency and lockfile, then rerun the workspace install before restarting workflows.