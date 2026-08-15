# Rhao92’s The Bus Telemetry Interface

Stream Deck plugin for **The Bus** with telemetry-based vehicle controls, live
vehicle status, timetable data, navigation and Stream Deck + panels.

> **Beta candidate `2.15.0.18`**
> This package is prepared for beta testing and has not yet been published on GitHub.

[Deutsch](#deutsch) · [English](#english)

## Deutsch

### Status und Kompatibilität

Diese Version ist ein Beta-Kandidat. Anzeigen ändern sich grundsätzlich
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
- Ein Stream-Deck-Gerät mit Tasten; für Regler und Fullpanel ein Stream Deck +

### Installation

1. Unter **Releases** die Datei mit der Endung `.streamDeckPlugin`
   herunterladen.
2. Die Datei doppelt anklicken.
3. Installation oder Update in der Stream-Deck-Software bestätigen.
4. The Bus starten und einen Bus vollständig laden.
5. Die gewünschten Actions auf das Stream Deck ziehen. Konfigurierbare
   Actions werden im Property Inspector eingestellt.

Diese Beta verwendet die vollständig anonymisierte UUID-Familie
`de.rhao92.thebus-telemetry-interface`. Sie wird von Stream Deck als neues
Plugin behandelt; bestehende Profile älterer Versionen müssen einmalig neu
belegt werden.

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

### Feedback und Fehler melden

Bitte für Fehler den
[Bug-Report](https://github.com/Rhao92/The-Bus-Telemetry-Interface/issues/new?template=bug_report.md)
und für neue Ideen den
[Feature-Request](https://github.com/Rhao92/The-Bus-Telemetry-Interface/issues/new?template=feature_request.md)
verwenden. Busmodell, Linie/Route, Stream-Deck-Modell und Plugin-Version helfen
bei der Einordnung erheblich.

### Aus dem Quellcode bauen

Vorausgesetzt werden Node.js 20 und npm.

```bash
npm ci
npm run build
npm run pack
```

Das erzeugte Installationspaket ist für Tests gedacht. Für normale Nutzer ist
der vorbereitete Installer unter **Releases** der bevorzugte Download.

## English

### Status and compatibility

This release is a beta candidate. Displays only change after confirmed in-game
feedback; the plugin does not simulate vehicle states.

**Testing currently covers only the MB eCitaro / MB eCityBus 18-metre,
four-door model.** Other bus models may work but have not been officially
tested. Different telemetry, button or state names may affect individual
displays and controls.

### Requirements

- Windows 10 or later
- Elgato Stream Deck software `7.2` or later
- The Bus with local telemetry available at `127.0.0.1:37337`
- A key-based Stream Deck; Stream Deck + for dials and the full panel

### Installation

1. Download the `.streamDeckPlugin` file from **Releases**.
2. Double-click the downloaded file.
3. Confirm installation or update in the Stream Deck application.
4. Start The Bus and load a bus completely.
5. Add the required actions to your Stream Deck. Configure dropdown actions in
   the Property Inspector.

This beta uses the fully anonymized UUID family
`de.rhao92.thebus-telemetry-interface`. Stream Deck therefore treats it as a
new plugin, and profiles from older releases must be configured once again.

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

### Feedback and bug reports

Use the
[bug report](https://github.com/Rhao92/The-Bus-Telemetry-Interface/issues/new?template=bug_report.md)
for defects and the
[feature request](https://github.com/Rhao92/The-Bus-Telemetry-Interface/issues/new?template=feature_request.md)
for new ideas. Plugin version, bus model, line/route and Stream Deck model make
reports much easier to evaluate.

### Building from source

Node.js 20 and npm are required.

```bash
npm ci
npm run build
npm run pack
```

The resulting package is intended for development tests. Regular users should
prefer the prepared installer under **Releases**.
