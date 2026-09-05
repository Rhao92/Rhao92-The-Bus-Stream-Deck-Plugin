# Vehicle telemetry fixtures

This directory contains normalized, read-only observations from the official
local telemetry API of The Bus. A fixture describes one actual bus model and
is regression input, not runtime telemetry and not a release asset.

- Capture with `npm run telemetry:capture -- --watch` while manually operating
  the selected bus in the game.
- A structurally unchanged repeat capture does not modify the fixture.
- A structural difference creates `*.candidate.json`; it never overwrites the
  accepted baseline automatically.
- Bus variants that share one `InputIdentifier` but report different actor
  classes are stored separately instead of being treated as an update.
- Candidate files must be reviewed against a deliberate TML telemetry change
  before the baseline, mappings or compatibility documentation are updated.
- Do not fabricate missing values or infer a state from a sent command.
