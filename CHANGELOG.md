# Changelog

All notable public changes to Rhao92's The Bus Stream Deck Plugin are listed
in this file.

## [Unreleased] - 2026-08-24

- Adopted the permanent public name `Rhao92's The Bus Stream Deck Plugin` and
  added German and English descriptions covering live telemetry, intelligent
  vehicle controls, dynamic feedback and Stream Deck Mobile.
- Renamed the public GitHub repository to
  `Rhao92-The-Bus-Stream-Deck-Plugin` and updated all controllable links while
  retaining GitHub's redirects for historical URLs.
- Kept the plugin UUID, all 50 action UUIDs, package identity, settings,
  profiles, tags and update paths unchanged during the branding update.
## [2.15.0.18-beta] - 2026-08-15

- Renamed the configurable action from `Navigation · Pfeil + Entfernung` to
  `Navigation` because its dropdown also provides stops, route distance, ETA
  and prediction views.
- Fixed navigation dropdown settings not persisting after the Property
  Inspector was closed or reopened. The inspector now requests stored settings,
  includes the action context while saving and handles confirmations without
  allowing a delayed old value to overwrite a new selection.
- Added a Property Inspector regression covering load, change, save,
  confirmation and reopen behavior.

## [2.15.0.17-beta] - 2026-08-15

- Prepared the verified `2.15.0.17-dev` runtime as a beta candidate without
  changing its navigation behavior.
- Replaced the former personal UUID namespace with
  `de.rhao92.thebus-telemetry-interface` across the plugin, all 50 actions,
  layouts, property inspectors, build scripts and QA fixtures.
- Removed machine-specific paths. The navigation capture now resolves the
  current Windows home directory at runtime and writes below
  `Documents\Projekte\The Bus\NaviDebug`.
- Audited source, package contents, archive paths, filenames and image metadata
  for personal names, private email addresses, machine-specific folders and
  credentials before packaging.

- Further live testing across bus models and routes.
- Development build `2.15.0.17-dev` separates two strong, compact opposing
  turns instead of reducing their combined heading to straight. In the
  captured U Siemensdamm to Quellweg geometry, the approximately 90-degree
  left turn followed by a 90-degree right turn now starts with a left arrow at
  about 18 metres instead of a straight arrow anchored 325 metres away.
- The exact twelve-lane geometry is covered by `NAV-18`; a complete replay
  replaces all 499 formerly straight samples with the pending left maneuver.
  The length guards preserve the long counter-curve behavior covered by
  `NAV-17`.
- Development build `2.15.0.16-dev` anchors an S-shaped route instruction to
  the constituent curve that matches the displayed direction. On the captured
  Goerdelerdamm to U Jakob-Kaiser-Platz approach, the upcoming right-turn anchor
  now remains about 205 m along the active route instead of jumping back to
  41 m at a route-lane update; the right arrow therefore counts down normally
  and no longer remains latched at 0 m through the preceding counter-curve.
- The exact nine-lane geometry and reported approach positions are covered by
  `NAV-17`. The complete 60-second blackbox was additionally replayed against
  the corrected engine without a single right-at-0-m sample.
- Development build `2.15.0.15-dev` recognizes parallel three-lane groups
  with up to seven metres between their outer route traces when no explicit
  lane-change metadata exists. This removes the artificial out-and-back loops
  and 69.9-metre discontinuity captured from S Beusselstr. to Berliner
  Grossmarkt; the exact 13-lane case is covered by `NAV-16`.
- A confirmed stop change now resets the old ETA smoothing while retaining up
  to 90 seconds of recent driving samples as a cold start for the next
  section. ETA and predicted schedule delta therefore no longer remain empty
  when the bus stops immediately after the target changes.
- Development build `2.15.0.14-dev` keeps navigation active on verified,
  continuous straight sections up to 750 metres. This fixes the empty arrow
  captured between Buchholzweg and Gedenkstaette Ploetzensee at 585--624 m,
  while the existing 1.3-km uncertainty guard remains intact.
- The exact seven-lane geometry and vehicle position from the reported
  60-second capture are covered by the new `NAV-15` regression.
- Development build `2.15.0.13-dev` recognizes consecutive near-identical
  Lane IDs with up to a five-metre lateral offset as one road trace when no
  explicit lane-change metadata exists. This removes the artificial
  out-and-back loops captured between Habermannzeile and Weltlingerbruecke.
- The corrected route now keeps the upcoming right turn ahead of the bus,
  projects Weltlingerbruecke onto the actual route point instead of a nearby
  false segment, and retires the turn after the confirmed curve exit. The two
  reported 60-second captures are covered by the exact `NAV-14` regression.
- Development build `2.15.0.12-dev` collapses consecutive Lane IDs whose
  geometries describe the same road trace. This removes the artificial
  out-and-back segment and 20.6-m continuity gap captured between Saatwinkler
  Damm 137 and Saatwinkler Damm/Rohrdamm, restoring the otherwise isolated
  missing navigation arrow.
- The captured duplicate-lane case is covered by an exact regression that
  requires a gap-free polyline and an active maneuver while preserving
  explicit lane-change metadata.
- Development build `2.15.0.11-dev` fixes reversed active route sections by
  orienting partial `PathLanes` geometry between the confirmed previous stop
  and the current target stop. The captured Goebelplatz-to-Popitzweg geometry
  is covered by a dedicated regression alongside the Hertzallee terminal case.
- Navigation QA now preserves a failing process status even when the Stream
  Deck SDK records an uncaught assertion through its own logger.
- Development build `2.15.0.10-dev` adds an in-memory 60-second navigation
  blackbox and a manual TXT export action. Captures include the active route
  geometry, projection alternatives, maneuver candidates and exact rejection
  or selection reasons without writing anything before the button is pressed.
- The TXT export writes only to the configured navigation-diagnostic folder. It
  no longer reports success after silently choosing a different OneDrive/profile folder;
  the key reports `PATH 60S` only after the file size was verified.

## 2.14.1.0 - 2026-08-09

First public GitHub beta.

### Added

- Consolidated Navigation action with Property Inspector dropdown for
  maneuver, maneuver distance, next stop, total distance, remaining distance,
  line progress, ETA, predicted delta and prediction confidence.
- Central route-distance calculation and section-based ETA/predicted-delta
  model.
- Global runtime states: `OFFLINE`, `NO_BUS`, `BUS_NOT_READY`, `BUS_READY` and
  `MISSION_READY`.
- Full HVAC action family for climate keys, temperature, airflow and Stream
  Deck + dials.
- Stream Deck + full panel and configurable single-panel displays.

### Changed

- Navigation matching was stabilized against nearby parallel route geometry.
- The active maneuver remains locked until the geometrically confirmed curve
  exit; the final `NAV-07` live test remains pending.
- Automatic ventilation is presented as a clear `OFF`/`ON` control while the
  vehicle's three internal states remain respected.
- Fan speed stays display-only on the tested eCityBus because its telemetry
  exposes `AC 1 FanSpeed` without writable actions. Other buses are controlled
  only when they report real FanSpeed events.
- Existing Navigation UUIDs remain registered for profile compatibility while
  seven legacy entries are hidden from the action list.

### Fixed

- `UI-05` and `UI-06`: stable global offline handling and neutral grey states
  when telemetry is reachable but no confirmed bus is available. Both passed
  the practical test.
- Door All now distinguishes closed, open and mixed states and closes only
  doors that are not already closed.
- Auto-kneeling now uses a centralized ready state based on confirmed vehicle
  readiness rather than route or mission availability.
- Battery fill is continuous and remains synchronized with its value.
- Climate Property Inspector selections persist instead of reverting to the
  first option.

### Known limitations

- Tested only with the MB eCitaro / MB eCityBus 18-metre, four-door model.
- Navigation and `NAV-07` still require more live tests on different lines.
- Automatic ventilation `OFF`/`ON` requires its final live retest.
- Fan speed is display-only on the tested eCityBus.
- Elgato validation reports no errors and 111 inherited non-blocking `@2x`
  notices.
