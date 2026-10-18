# Account-deletion recovery evidence

- [Implementation, local results and updated rollout assessment](rollout.md)
- [Inspected commands and reproduction](commands.md)
- [Forward migration rehearsal](reproduce-forward.sh)

Recovery runs through the real API lifespan and uses a private atomic tombstone job,
bounded provider attempts, expiring claims and persistent backoff. It is locally
verified; hosted/provider/runtime acceptance remains unperformed. Target/device
inventory and owner decisions for unsatisfiable observation queues remain open.
