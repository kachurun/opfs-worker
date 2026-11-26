---
"opfs-worker": minor
---

Update the bundled `minimatch` to 11.0.9 and `brace-expansion` to 5.0.13. The published bundles and source maps carried `brace-expansion` 5.0.8 (CPU/stack-exhaustion advisories in glob brace expansion) and `minimatch` 10.2.5; both are now on fixed versions. Watch patterns match the same paths as before.
