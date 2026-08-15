# Public Roadmap

## Current beta candidate

`2.15.0.18-beta` is prepared from the verified development build and is not yet
published on GitHub.

Implemented and technically verified:

- consolidated navigation with 18 targeted regression groups
- corrected handling of parallel and duplicate lane groups, reversed partial
  routes, compact opposing turns and maneuver locks
- central route-distance calculation
- ETA and predicted delta per confirmed stop section
- global runtime and offline states
- neutral grey state without a confirmed bus
- auto-kneeling ready state
- Door-All state logic
- continuous battery display
- climate key family plus Stream Deck + temperature and airflow dials
- anonymized `de.rhao92.thebus-telemetry-interface` UUID family
- portable navigation-diagnostic destination without a machine-specific path
- persistent navigation dropdown settings in the Property Inspector
- package validation with zero errors

Practically confirmed:

- `UI-05` and `UI-06`
- all navigation traces collected for `NAV-11` through `NAV-18`
- climate on/off, temperature control, airflow and visible climate keys on the
  MB eCitaro / MB eCityBus 18-metre, four-door model

## Next priorities

1. Test navigation on more lines and maps with parallel roads, tight turns,
   U-turns, compact opposing turns and incomplete line geometry, using the
   60-second navigation capture for every anomaly.
2. Confirm the anonymized beta installation and one-time profile setup on a
   clean Stream Deck environment.
3. Retest automatic ventilation as a binary `OFF`/`ON` control.
4. Test the full action set on additional bus models and document telemetry
   differences.
5. Enable fan-speed control only for buses that expose real direction or target
   events.
6. Continue consolidating remaining action families in Property Inspectors.

## Later

- additional navigation and route robustness based on public beta reports
- broader bus compatibility mappings backed by real telemetry captures
- remaining icon-density cleanup, including inherited `@2x` notices
- Elgato Marketplace evaluation only after the public beta is sufficiently
  tested; no Marketplace release is planned for this step
