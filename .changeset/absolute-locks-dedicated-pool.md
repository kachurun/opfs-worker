---
"opfs-worker": patch
---

Path locks use the absolute OPFS path (`root` + API path), so overlapping mounts of the same file serialize correctly. Dedicated workers with the same `root` (and `url`) on one page now share a single Worker, different roots get different Workers.
