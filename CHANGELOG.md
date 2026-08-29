# Changelog

All notable public changes to Rhao92's The Bus Stream Deck Plugin are listed
in this file.

## [2.16.0] - 2026-08-29

- Added seconds to the real in-game clock on timetable keys, single panels and
  the timetable Fullpanel. Scheduled arrival and departure times remain in
  their genuine minute-based format.
- Updated the visible version footer across current keys and full panels from
  the obsolete `2.15 BETA` label to the actual `2.16` release line.
- Made the locally calculated trip consumption independent of visible Stream
  Deck pages. Its shared telemetry evaluation now starts with the plugin and
  continues while no Fullpanel or vehicle display is visible, so page changes
  no longer leave gaps in the accumulated trip distance.
- Fixed the remaining live trip-consumption reset at stops and `0 km/h`.
  Brief incomplete vehicle or energy samples and temporary display
  unsubscribe/resubscribe cycles now retain the last confirmed trip average;
  confirmed bus exit, vehicle change, direct `Powermeter`, manual reset and
  implausible measurements remain deliberate reset conditions.
- Added a manual reset for the locally calculated trip consumption. Pressing
  the existing vehicle power/consumption key clears only this average and
  starts a fresh 200-metre learning distance; no additional action or invented
  vehicle command is introduced, and a real `Powermeter` remains unaffected.
- Fixed the English manifest localization structure so Stream Deck now
  translates the plugin action list, action tooltips and all three encoder
  trigger descriptions instead of translating only the Property Inspectors
  and runtime displays.
- Fixed the `CONS-01` trip-average lifecycle. Once the minimum learning
  distance has produced a confirmed `Ø kWh/100 km` value, normal stops and
  paused game time retain that trip average instead of clearing the display or
  beginning again at zero. A real vehicle change, direct `Powermeter`, invalid
  electric-energy relation or implausible result still resets it safely.
- Added automatic German/English localization in one installer. Stream Deck's
  application language selects English when it begins with `en`; German is the
  documented fallback for German and currently unsupported locales.
- Added complete English names and tooltips for all 50 manifest actions, plus
  translated Property Inspectors for timetable, navigation, climate and the
  shared vehicle-control configuration. Stable action UUIDs and saved setting
  values remain unchanged.
- Localized runtime labels across timetable, navigation, vehicle, climate,
  full panels, extended controls and navigation diagnostics. Numeric telemetry
  uses the matching decimal separator without changing its source value.
- Added `NAV-28` from the reported navigation capture. Fullpanel timetable
  resolution now matches
  the real `CurrentStop`, `NextStop` and `LastStopReached` objects before
  consulting numeric indices; The Bus 1.2 can report
  `LastStopReachedIndex` as the following stop.
- Fullpanel stop-phase matching now accepts the live mission
  `{X: longitude, Y: latitude}` location form. The captured Stedingerweg
  state consequently resolves the correct stop and `−1:21` timetable delta
  instead of using the following stop.
- Navigation diagnostics now record the game date/time plus the real
  `IsAtStop` and passenger-door signals, making future ANK/ABF/delta traces
  independently replayable.
- Added `NAV-27` compatibility for The Bus `1.2.100790` (Steam build
  `24925807`). The real `NextStop` and `LastStopReached` mission objects now
  determine the active stop before numeric indices are considered; the new
  game build can report those indices with a different base and previously
  caused navigation to skip one stop.
- Mission-stop locations from this build are accepted in the observed
  `{X: longitude, Y: latitude}` object form as well as the older coordinate
  pair. The original trace can therefore be replayed without reshaping its
  mission data.
- Added the observed The Bus timestamp format `YYYY.MM.DD-HH.MM.SS` to the
  timetable and navigation parsers. `ANK`, `ABF`, timetable delta, ETA and
  predicted delta can therefore use the current mission schedule again.
- Added a target-aware multi-path fallback. If a later unknown stop prevents
  complete remaining-line confirmation, the fallback extends across delivered
  path blocks only until both player and the real current mission target are
  confirmed on the same geometry; a short residual first path no longer
  strands the active stop without a distance.
- Added the corrected `CONS-01` fallback for the eBus 2.2 on The Bus
  `1.2.0.100996`.
  A valid direct `Powermeter` remains authoritative. If it is absent, a
  clearly marked trip average in `kWh/100 km` is calculated only after
  `CurrentFuel / MaxFuel` confirms `DisplayFuel` on an identified electric
  bus and at least 200 metres have actually been travelled. The travelled
  distance is integrated from official speed and advancing game time.
  Game-time pauses, vehicle/time jumps and implausible values remain neutral;
  a negative net value appears only after a real increase in the reported
  energy store.
- Normalized the colored GitHub/source icon assets without changing plugin or
  action UUIDs. All 27 visible actions now reference 25 dedicated action-list
  icon pairs in `20×20` and `40×40`; their colored key-state images remain
  separate and unchanged.
- Redrew the existing colored BUS/RHAO92 plugin artwork from a native
  `512×512` master, then generated the plugin icon at `256×256`/`512×512` and
  the category icon at `28×28`/`56×56` without the blur of upscaling the old
  `144×144` source.
- Began the `2.16` functional development line with `NAV-24`. Navigation now
  evaluates every non-empty `Paths` block delivered by `/routelaneids` instead
  of discarding all blocks after the next-stop segment.
- Connected path blocks are combined only when their geometry is continuous
  and all remaining mission stops project onto it in the correct order.
  Disconnected, alternative or otherwise uncertain blocks retain the proven
  next-segment behavior rather than producing guessed guidance.
- The confirmed remaining-line geometry now supplies exact remaining distance,
  line progress and future segment distances while maneuver selection remains
  bounded by the current target stop.
- Navigation diagnostics now report path counts, lane counts, geometry scope
  and projection start for connected and disconnected multi-path routes.
- Added `NAV-25` mission target roles. Navigation now distinguishes regular
  stops, the final destination and confirmed operational start/terminal pairs
  from the real mission sequence before selecting their target symbol.
- The Bus represents operational line starts as two consecutive mission points
  with exactly matching arrival and departure times. This structure is
  confirmed by captures from Hertzallee, Flughafen Tegel, U Leopoldplatz and
  Alexanderplatz and is evaluated without a place-name list.
- Both points of such a confirmed start/terminal pair now use a dedicated pause
  symbol inside the 300-m target area. The mission target remains stable while
  The Bus inserts or removes terminal lane prefixes; ordinary stops and road
  maneuvers retain their existing geometry-based behavior.
- The next-target key and Navigation Fullpanel label the confirmed operational
  target as `PAUSENPUNKT`; a final destination remains `ENDHALT`, and all other
  mission targets remain `NÄCHSTER HALT`.
- Reduced and width-adjusted the value font on the dedicated line-length and
  remaining-distance keys so values such as `≈11,3 km` stay inside the
  144×144 key frame.
- Navigation diagnostics preserve the real mission start/destination flags in
  route contexts and report the resolved mission target role.
- Added `NAV-26` after the reported Hertzallee case exposed an incorrect
  visible distance of approximately 187 m to
  the second internal terminal point. Once real mission progress confirms the
  first member of a valid terminal pair as reached, the shared pause target and
  maneuver distance now display `0 m`.
- The raw projection to the second point remains available to route geometry
  and diagnostics; regular stops, destinations and turn guidance are unchanged.
  Diagnostics record both distances plus the real mission-confirmed reached
  state.

- Adopted the permanent public name `Rhao92's The Bus Stream Deck Plugin` and
  added German and English descriptions covering live telemetry, intelligent
  vehicle controls, dynamic feedback and Stream Deck Mobile.
- Renamed the public GitHub repository to
  `Rhao92-The-Bus-Stream-Deck-Plugin` and updated all controllable links while
  retaining GitHub's redirects for historical URLs.
- Kept the plugin UUID, all 50 action UUIDs, package identity, settings,
  profiles, tags and update paths unchanged during the branding update.
- Removed the synthetic Fullpanel dial and STOP demonstrations. STOP now comes
  exclusively from live telemetry; dial 1 and touch retain the existing
  dashboard switch while the other dials remain display-only.
- Expanded the Navigation Fullpanel with live route remainder, line progress,
  estimated arrival, predicted schedule delta and prediction confidence.
  Uncertain or stale navigation states keep these values neutral.
- Removed the cramped visible `NAV-STATUS` block from the Navigation Fullpanel
  and reassigned its space to the values that matter while driving. Remaining
  distance, ETA, route progress and prediction now use a wider two-by-two
  layout with substantially larger text.
- Split predicted schedule delta and confidence into separate lines so the
  value no longer has to fit into one unreadably small string. Internal
  navigation states and all neutral safety behavior remain unchanged.
- Fixed repeated brief straight-instruction dropouts when The Bus removes
  already-driven lane IDs from the beginning of an otherwise identical route.
  An exact remaining lane suffix on the same line and target segment now keeps
  its confirmed stability, while genuine route replacements still require the
  normal confirmation delay.
- Added `NAV-20` covering six consecutive prefix trims from the reported
  capture plus a genuine route replacement. Future debug captures identify the
  update as continuation or replacement through `routeUpdateKind`.
- Fixed the missing left-turn instruction before `S+U Brandenburger Tor`.
  When a nearby counter-curve cannot form a measurable combined S-curve, the
  first independently confirmed turn is now evaluated instead of discarding
  both curve groups.
- Fixed a 41-second navigation dropout on the final approach from
  `Spandauer Str./Marienkirche` to `S+U Alexanderplatz/Memhardstr.`. Parallel
  three-lane alternatives are no longer chained into a reversed route that
  places the destination behind the bus.
- Added the two exact reported geometries as `NAV-21A` and `NAV-21B`. Existing
  compact opposing-turn, long counter-curve, parallel-lane and prefix-trim
  protections remain green.
- Renamed the static `Gesamtstrecke` Navigation selection to `Linienlänge` so
  it is clearly distinct from the countdown shown by `Reststrecke`; the
  underlying full-line distance remains unchanged.
- Fixed a complete maneuver-arrow dropout on the roughly two-kilometre section
  from `S+U Hauptbahnhof` to `U Turmstraße`. Closely spaced minor
  counter-curves could make both the combined and standalone bearing windows
  unavailable even though a sustained right-hand curve remained ahead.
- Added a guarded sustained-curve fallback that requires at least 30 metres of
  curve length, six supporting samples and a consistent turn direction. The
  exact reported 92-point geometry is preserved as `NAV-22` and now yields a
  slight-right instruction at roughly 620 metres instead of remaining neutral.
- Kept the 750-metre straight-instruction safety limit unchanged; uncertain
  long-distance geometry is not replaced with a guessed straight arrow.
- Fixed a left-turn instruction remaining latched through `S Beusselstr.` even
  after the correctly detected stop distance reached zero. The turn remains
  visible until its real geometry anchor, then hands over to the immediately
  following stop instead of suppressing the `H` symbol.
- Limited this handover to stops no more than 25 metres away that lie inside
  the locked maneuver's completion window. Normal turns, distant stops and the
  existing exit hysteresis remain unchanged.
- Added the exact six-lane capture as `NAV-23`, covering the approaching left
  arrow, the handover to `H` and the stop symbol remaining active at the stop
  position.
- Fixed a close right-left sequence between `Turmstr./Beusselstr.` and
  `U Turmstraße` selecting the later left turn while the nearer right turn was
  still ahead. The first confirmed turn now remains the active instruction.
- Added the exact eleven-lane geometry from the two reported 60-second traces
  as `NAV-19`. The existing long counter-curve and compact opposing-turn
  protections in `NAV-17` and `NAV-18` remain covered.
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
