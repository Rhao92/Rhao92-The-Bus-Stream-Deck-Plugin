# Rhao92's The Bus Stream Deck Plugin

**Rhao92's The Bus Stream Deck Plugin** is a free community-made Elgato Stream
Deck plugin for **The Bus by TML Studios**. It uses live game telemetry for
vehicle controls, dynamic status feedback, timetable displays, full panels and
experimental navigation. It works with physical Stream Deck hardware and
Stream Deck Mobile on iPhone and iPad.

**Deutsch:** Rhao92's The Bus Stream Deck Plugin ist ein kostenloses
Community-Plugin für **The Bus von TML Studios**. Es verbindet echte
Live-Telemetrie mit Fahrzeugsteuerung, dynamischen Zustandsanzeigen,
Fahrplaninformationen, Fullpanels und experimenteller Navigation für Elgato
Stream Deck und Stream Deck Mobile.

> **Public Beta `2.15.0.18`**
> The current public beta is available on GitHub. Newer local changes remain
> test-only until their practical checks and separate release approval.

[Download Public Beta 2.15.0.18 (ZIP)](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases/download/v2.15.0.18-beta/Rhao92-The-Bus-Telemetry-Interface-2.15.0.18-beta.zip)
· [Release notes](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases/tag/v2.15.0.18-beta)
· [Report a bug](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/issues/new?template=bug_report.md)

![Rhao92's The Bus Stream Deck Plugin showing live vehicle telemetry, timetable controls and navigation on Stream Deck](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases/download/v2.15.0.18-beta/Preview.jpg)

This is an independent community project by Rhao92. It is not an official
product of, affiliated with or endorsed by TML Studios or Elgato.

[Deutsch](#deutsch) · [English](#english)

## Deutsch

### Status und Kompatibilität

Diese Version ist eine veröffentlichte öffentliche Beta mit 50
telemetriebasierten Actions. Anzeigen ändern sich grundsätzlich
erst nach bestätigter Rückmeldung aus dem Spiel; das Plugin simuliert keine
Fahrzeugzustände.

**Aktuell getestet wurde ausschließlich der MB eCitaro / MB eCityBus 18 Meter
4-Türer.** Andere Busmodelle können funktionieren, sind bisher aber nicht
offiziell getestet. Abweichende Telemetrie-, Tasten- oder Zustandsnamen können
einzelne Anzeigen und Bedienfunktionen beeinflussen.

### Voraussetzungen

- Windows 10 oder neuer
- Elgato Stream Deck Software `7.2` oder neuer
- The Bus mit erreichbarer lokaler Telemetrie auf `127.0.0.1:37337`
- Optional ein physisches Stream Deck; alternativ Stream Deck Mobile auf
  iPhone oder iPad
- Für Regler und Fullpanel ein Stream Deck +

### Download und Installation

1. Die geprüfte
   [Public Beta 2.15.0.18 als ZIP herunterladen](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases/download/v2.15.0.18-beta/Rhao92-The-Bus-Telemetry-Interface-2.15.0.18-beta.zip).
2. Das ZIP entpacken und die enthaltene Datei mit der Endung
   `.streamDeckPlugin` doppelt anklicken.
3. Installation oder Update in der Stream-Deck-Software bestätigen.
4. The Bus starten und einen Bus vollständig laden.
5. Die gewünschten Actions auf das Stream Deck ziehen. Konfigurierbare
   Actions werden im Property Inspector eingestellt.

Das ZIP enthält außerdem `README.md`, `PATCHLOG.txt` und `ROADMAP.txt`. Die
vollständige Beschreibung der Beta steht in den
[Release Notes](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases/tag/v2.15.0.18-beta).

Diese Beta verwendet die stabile Plugin-UUID
`de.rhao92.thebus-telemetry-interface`. Beim Wechsel von `2.14.1` oder älter
müssen Actions wegen der früheren Identität einmalig neu zugewiesen werden.
Updates ab `2.15.0.17-beta` verwenden dieselbe Identität und verhalten sich wie
normale Updates.

### Live-Telemetrie und Fahrzeuganzeigen

Geschwindigkeit, Tempolimit, Leistung, Akkustand, Gang, Zündung,
Feststellbremse, Blinker und Warnblinker werden aus verfügbaren Spieldaten
dargestellt. Die gemeinsame Statuslogik unterscheidet `OFFLINE`, `NO_BUS`,
`BUS_NOT_READY`, `BUS_READY` und `MISSION_READY`.

### Fahrzeugsteuerung

Das The Bus Stream Deck Plugin bündelt unter anderem Gangwahl, Zündung,
Feststellbremse, Blinker, Warnblinker, Scheibenwischer, Retarder,
Sonnenblende, Außenbeleuchtung und Fahrgastraumlicht. Ein Tastendruck allein
beweist keinen Zustand; die sichtbare Rückmeldung kommt aus dem Spiel.

### Türen und Kneeling

Enthalten sind Einzeltüren, Door All, Türfreigabe, automatisches Türschließen,
Kneeling, Auto-Kneeling und Rollstuhlrampe. Door All unterscheidet geschlossen,
offen, gemischt und Bewegung. Das normale Kneeling-Symbol folgt dem echten
mechanischen Zustand.

### Navigation

Die experimentelle Navigation bietet Manöver, Manöverdistanz, nächsten Halt,
Gesamt- und Reststrecke, Linienfortschritt, ETA, Prognose-Delta und
Prognosesicherheit. Unsichere Routenzuordnungen oder Manöver bleiben neutral,
anstatt eine Richtung zu raten.

### Fullpanels und Statusanzeigen

Fahrzeug-, Fahrplan- und Navigations-Fullpanels nutzen die vier
Reglersegmente des Stream Deck + als zusammenhängende Ansicht. Ergänzend gibt
es Keypad-Anzeigen und einzelne Regler für unterstützte Funktionen.

### Funktionsübersicht

| Bereich | Enthaltene Funktionen |
| --- | --- |
| Navigation | Manöver, Manöverdistanz, nächster Halt, Gesamt-/Reststrecke, Linienfortschritt, ETA, Prognose-Delta und Prognosesicherheit in einer Dropdown-Action |
| Fahrplan | Haltestelle, Ankunft, Abfahrt, Abweichung, Ingame-Zeit, Status und Haltewunsch für Keypad, Einzelpanel und Fullpanel |
| Fahrzeug | Geschwindigkeit, Tempolimit, Leistung, durchgehende Akkuanzeige, Gang, Zündung, Feststellbremse, Blinker und Warnblinker |
| Türen und Einstieg | Einzeltüren, Door-All, Türfreigabe, automatisches Türschließen, Kneeling, Auto-Kneeling und Rollstuhlrampe |
| Klima | Klima Ein/Aus, Heizen/Kühlen, hintere Klima, Umluft, vordere Umluft, automatische Ventilation, Temperatur und Luftverteilung |
| Licht | Fahrgastraumlicht Ein/Aus, dunkler und heller |
| Laufzeitstatus | Zentrale Zustände `OFFLINE`, `NO_BUS`, `BUS_NOT_READY`, `BUS_READY` und `MISSION_READY` |

Die zentrale Statuslogik zeigt `OFFLINE` nur bei nicht erreichbarer
Telemetrie. Ohne bestätigten Bus werden neutral graue `---`-/`--`-Zustände
beziehungsweise „Nicht im Bus“ angezeigt. Auto-Kneeling erhält seinen
Ready-Zustand erst nach vollständig bestätigtem Buskontext. Door-All
unterscheidet geschlossen, offen und gemischt. Die Akkuanzeige füllt sich
durchgehend statt in groben Segmenten.

#### Navigationsdiagnose (`2.15.0.18-beta`)

Die sichtbare Action **„Navigation · Debug speichern“** sichert beim Drücken
die zurückliegenden 60 Sekunden der Navigation als TXT. Der Ringpuffer läuft
ab Pluginstart ausschließlich im Arbeitsspeicher; vorher wird nichts auf die
Festplatte geschrieben. Die Datei enthält Telemetrie,
Projektionskandidaten, Auswahl-/Verwerfungsgründe sowie nur die zu diesem
Zeitfenster gehörenden Lane- und Polyline-Geometrien.

Zielordner unter Windows:
`Dokumente\Projekte\The Bus\NaviDebug`

Nach dem verifizierten Export zeigt die Taste `PATH 60S`. Es gibt bewusst
keinen stillen OneDrive- oder Pluginordner-Fallback. Kann genau
dieser Ordner nicht beschrieben werden, zeigt die Taste stattdessen einen
roten Pfad-/Schreibfehler.

### Unterstützte Stream-Deck-Bereiche

- **Keypad:** Fahrzeug-, Tür-, Klima-, Fahrplan- und Navigationstasten auf
  Stream-Deck-Modellen mit normalen LCD-Tasten.
- **Stream Deck +:** Zusätzliche Einzelregler und Touchanzeige für Fahrplan,
  Temperatur, Luftverteilung und – sofern der Bus Steuerevents liefert –
  Lüftergeschwindigkeit.
- **Stream Deck Mobile:** Keypad-Actions auf iPhone und iPad ohne zusätzliches
  physisches Stream-Deck-Gerät.
- **Fullpanel:** Vollbreitenansicht über alle vier Reglersegmente des Stream
  Deck +.

Nicht jede Funktion ist auf jedem Controller-Typ verfügbar. Der jeweilige
Action-Eintrag in der Stream-Deck-Software gibt den benötigten Controller vor.

### Bekannte Einschränkungen

- Navigation ist durch 18 gezielte Regressionsgruppen und die bisher erfassten
  Live-Traces abgesichert, benötigt als Beta aber weitere Fahrten auf anderen
  Linien, Karten und Busmodellen.
- Gesamt- und Reststrecke können mit `≈` gekennzeichnet werden, wenn keine
  vollständige Liniengeometrie vorliegt und bestätigte Haltestellenabschnitte
  als Fallback verwendet werden.
- Klima, Temperatur, Luftverteilung und die sichtbaren Klimatasten wurden am
  getesteten eCityBus bestätigt. Die Lüftergeschwindigkeit ist dort über die
  aktuelle Telemetrieschnittstelle nur lesbar und wird als `NUR ANZEIGE`
  dargestellt. Steuerung wird nur aktiviert, wenn ein Bus echte FanSpeed-
  Events meldet.
- Die automatische Ventilation ist als eindeutiges `AUS`/`EIN` umgesetzt; der
  abschließende Live-Retest der binären Schaltfolge steht noch aus.
- Die Elgato-Validierung meldet keine Fehler. 111 geerbte Hinweise betreffen
  fehlende `@2x`-Varianten älterer Icons und blockieren diese Beta nicht.

### Feedback und 60-Sekunden-Navigationsdiagnose

Bitte für Fehler den
[Bug-Report](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/issues/new?template=bug_report.md)
und für neue Ideen den
[Feature-Request](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/issues/new?template=feature_request.md)
verwenden. Plugin-Version, Busmodell, Linie/Route, Haltestelle oder
Straßenabschnitt und Stream-Deck-Modell helfen bei der Einordnung. Bei
Navigationsproblemen kann die manuell erstellte 60-Sekunden-TXT angehängt
werden; private Daten sollten vorher entfernt werden.

### Aus dem Quellcode bauen

Vorausgesetzt werden Node.js 20 und npm.

```bash
npm ci
npm run build
npm run pack
```

Das erzeugte Installationspaket ist für Entwicklungstests gedacht. Für normale
Nutzer ist der geprüfte Installer unter den
[GitHub Releases](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases)
der bevorzugte Download.

## English

### Status and compatibility

This release is a published public beta with 50 telemetry-based actions.
Displays only change after confirmed in-game feedback; the plugin does not
simulate vehicle states.

**Testing currently covers only the MB eCitaro / MB eCityBus 18-metre,
four-door model.** Other bus models may work but have not been officially
tested. Different telemetry, button or state names may affect individual
displays and controls.

### Requirements

- Windows 10 or later
- Elgato Stream Deck software `7.2` or later
- The Bus with local telemetry available at `127.0.0.1:37337`
- Optional physical Stream Deck hardware or Stream Deck Mobile on iPhone and
  iPad; Stream Deck + is required for dials and the full panel

### Download and installation

1. Download the verified
   [Public Beta 2.15.0.18 ZIP](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases/download/v2.15.0.18-beta/Rhao92-The-Bus-Telemetry-Interface-2.15.0.18-beta.zip).
2. Extract the ZIP and double-click the included `.streamDeckPlugin` file.
3. Confirm installation or update in the Stream Deck application.
4. Start The Bus and load a bus completely.
5. Add the required actions to your Stream Deck. Configure dropdown actions in
   the Property Inspector.

The ZIP also contains `README.md`, `PATCHLOG.txt` and `ROADMAP.txt`. See the
[complete release notes](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases/tag/v2.15.0.18-beta)
for the verified beta scope.

This beta uses the stable plugin UUID
`de.rhao92.thebus-telemetry-interface`. Users upgrading from `2.14.1` or older
must assign their actions once because those versions used a previous
identity. Updates from `2.15.0.17-beta` onward use the same identity and behave
as normal updates.

### Live telemetry and vehicle displays

Speed, speed limit, power, battery, gear, ignition, parking brake, indicators
and hazard lights are shown from available game data. The shared runtime state
distinguishes `OFFLINE`, `NO_BUS`, `BUS_NOT_READY`, `BUS_READY` and
`MISSION_READY`.

### Vehicle controls

The Bus Stream Deck Plugin includes gear selection, ignition, parking brake,
indicators, hazard lights, wipers, retarder, sun blind, exterior lighting and
passenger lighting. A key press alone does not prove a state; visible feedback
comes from the game.

### Doors and kneeling

Available actions include individual doors, Door All, door clearance,
automatic door closing, kneeling, automatic kneeling and wheelchair ramp.
Door All distinguishes closed, open, mixed and moving doors. The regular
kneeling icon follows the real mechanical state.

### Navigation

Experimental navigation provides maneuver, maneuver distance, next stop,
total and remaining distance, line progress, ETA, predicted schedule delta and
confidence. Uncertain route matches or maneuvers remain neutral instead of
guessing a direction.

### Full panels and status displays

Vehicle, timetable and navigation full panels use all four Stream Deck + dial
segments as one continuous view. Keypad displays and individual dials are also
available for supported functions.

### Feature overview

| Area | Included features |
| --- | --- |
| Navigation | Maneuver, maneuver distance, next stop, total/remaining distance, line progress, ETA, predicted delta and confidence in one dropdown action |
| Timetable | Stop, arrival, departure, schedule delta, in-game time, status and stop request on keys, single panels and the full panel |
| Vehicle | Speed, speed limit, power, continuously filled battery, gear, ignition, parking brake, indicators and hazard lights |
| Doors and access | Individual doors, Door All, door clearance, automatic door closing, kneeling, automatic kneeling and wheelchair ramp |
| Climate | Climate on/off, heating/cooling, rear climate, circulation, front circulation, automatic ventilation, temperature and airflow |
| Lighting | Passenger lighting toggle, dim and bright controls |
| Runtime status | Central `OFFLINE`, `NO_BUS`, `BUS_NOT_READY`, `BUS_READY` and `MISSION_READY` states |

The central runtime state shows `OFFLINE` only when telemetry is unavailable.
Without a confirmed bus, actions use neutral grey `---`/`--` states or “Not in
bus”. Automatic kneeling exposes a ready state only after the bus context is
fully confirmed. Door All distinguishes closed, open and mixed door states.
The battery display fills continuously rather than in coarse segments.

#### Navigation capture (`2.15.0.18-beta`)

Pressing the visible **Navigation · Debug speichern** action exports the
preceding 60 seconds of navigation to a TXT file. The ring buffer starts with
the plugin and stays in memory; no file is written
before the button is pressed. The capture includes telemetry, projection
candidates, selection/rejection reasons and only the lane/polyline geometry
referenced by that time window.

Windows destination folder:
`Documents\Projekte\The Bus\NaviDebug`

After a verified export the key shows `PATH 60S`. There is deliberately no
silent OneDrive or plugin-folder fallback. If this exact folder
cannot be written, the key shows a red path/write error instead.

### Supported Stream Deck areas

- **Keypad:** Vehicle, door, climate, timetable and navigation actions on
  Stream Deck models with regular LCD keys.
- **Stream Deck +:** Additional dials and touch display for timetable,
  temperature, airflow and – where the bus reports control events – fan speed.
- **Stream Deck Mobile:** Keypad actions on iPhone and iPad without separate
  physical Stream Deck hardware.
- **Full panel:** Full-width view across all four Stream Deck + dial segments.

Not every action is available on every controller type. The Stream Deck action
entry identifies whether it requires a key or encoder.

### Known limitations

- Navigation is protected by 18 targeted regression groups and all captured
  live traces to date, but beta testing on additional lines, maps and bus
  models is still required.
- Total and remaining distance can be marked with `≈` when complete line
  geometry is unavailable and confirmed stop sections are used as a fallback.
- Climate, temperature, airflow and the visible climate keys were confirmed on
  the tested eCityBus. Its fan-speed telemetry is read-only and is shown as
  `DISPLAY ONLY`. Control is enabled only when a bus reports real FanSpeed
  events.
- Automatic ventilation is implemented as a clear `OFF`/`ON` toggle; the final
  live retest of the binary sequence is still pending.
- Elgato validation reports no errors. The 111 inherited notices concern
  missing `@2x` variants of older icons and do not block this beta.

### Feedback and 60-second navigation diagnostics

Use the
[bug report](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/issues/new?template=bug_report.md)
for defects and the
[feature request](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/issues/new?template=feature_request.md)
for new ideas. Include the plugin version, bus model, line/route, stop or road
section and Stream Deck model. For navigation problems, attach the manually
created 60-second TXT after removing any private information.

### Building from source

Node.js 20 and npm are required.

```bash
npm ci
npm run build
npm run pack
```

The resulting package is intended for development tests. Regular users should
prefer the verified installer under
[GitHub Releases](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases).

Rhao92's The Bus Stream Deck Plugin is an independent community project and is
not an official TML Studios or Elgato product.
