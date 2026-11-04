# The run record

Every crank run prints one JSON object (the run record) to stdout, and the Actions job summary is
rendered from it. This file is its shape, for anything that wants to visualise or audit runs.

## 1. Run records

When `CRANK_STATE_DIR` is set, `scripts/crank.mjs` appends one JSON object per line to
`$CRANK_STATE_DIR/runs.ndjson`. It is append-only; nothing rewrites earlier lines.

```jsonc
{
  "runId": "2026-09-17T14:03:11.204Z-a91f",
  "startedAt": "2026-09-17T14:03:11.204Z",
  "finishedAt": "2026-09-17T14:03:12.016Z",
  "durationMs": 812,
  "network": "devnet",
  "chainId": 3141592,
  "epoch": 1234,
  "cranker": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "balanceFil": "9999.981",
  "paused": false,
  "pauseReason": null,
  "actions": [
    {
      "call": "submitShares",           // "submitShares" | "quarterlyGateCheck"
      "quarter": 5,                      // target quarter; null when not applicable
      "decision": "sent",                // "sent" | "skipped" | "failed" | "dry-run"
      "outcome": "landed",               // "landed" | "not-due" | "already-done" | "gate-closed" | "missed-window" | "error"
      "reason": "NotBound(5)",           // decoded custom error, or null
      "txHash": "0x…",                   // null when nothing was broadcast
      "gasUsed": "84213",
      "severity": "info",                // "info" | "warn" | "critical"
      "message": "human-readable one-liner"
    }
  ],
  "schedule": {
    "currentQuarter": 5,
    "phase": "bound",                    // "pre-activation" | "posting" | "verification" | "bound"
    "submitDueQuarter": 5,               // the LATEST BOUND quarter -- see "Which quarter is due" below
    "submitDueAtEpoch": 1360,            // bindingEpoch(5) = 1200 + 120 + 40
    "submitDeadlineEpoch": 1600,         // bindingEpoch(6) = 1440 + 160, exclusive
    "gateDueQuarter": 5,
    "gateDueAtEpoch": 1360,
    "chainAgreesWithConfig": true,
    "divergence": null
  },
  "exitCode": 0
}
```

## 2. Number formats

Values that can exceed `Number.MAX_SAFE_INTEGER` or that need exact decimal representation
are decimal **strings**: token and USD amounts, and `gasUsed`. Everything else -- epochs,
quarters, block numbers, counts -- is a JSON number.

## 3. Rules

- The record is append-only; nothing rewrites earlier lines.
- The cranker never imports anything from `devnet/`.
- Field names and the `decision` / `outcome` / `severity` vocabularies are an interface: anything
  that visualises runs reads them, and `test/errors.test.mjs` / `test/integration/crank.test.mjs`
  pin them. Add values; do not rename them.
