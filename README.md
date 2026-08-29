# Rhao92's The Bus Stream Deck Plugin

Release: `2.16.0` · Installer build: `2.16.0.21`

**Rhao92's The Bus Stream Deck Plugin** is a free, independent community-made
Elgato Stream Deck plugin for **The Bus by TML Studios**. It uses official local
game telemetry for vehicle controls, dynamic status feedback, timetable
displays, full panels, and experimental navigation. It supports physical Stream
Deck hardware and Stream Deck Mobile on iPhone and iPad.

This project is not an official product of, affiliated with, or endorsed by TML
Studios or Elgato.

![Rhao92's The Bus Stream Deck Plugin showing live vehicle telemetry, timetable controls and navigation on Stream Deck](https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases/download/v2.16.0/Preview.jpg)

[Deutsch](#deutsch) · [English](#english)

---

## Deutsch

### Download

- Installer: https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases/download/v2.16.0/Rhao92-The-Bus-Stream-Deck-Plugin-2.16.0.21.zip
- Release-Beschreibung: https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases/tag/v2.16.0
- Fehler melden: https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/issues/new?template=bug_report.md
- Idee vorschlagen: https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/issues/new?template=feature_request.md

### Voraussetzungen

- Windows 10 oder neuer
- Elgato Stream Deck Software 7.2 oder neuer
- The Bus mit erreichbarer lokaler Telemetrie auf `127.0.0.1:37337`
- physisches Stream Deck oder Stream Deck Mobile auf iPhone beziehungsweise iPad
- Stream Deck + für Regler und Fullpanels

### Installation

1. Den Installer über den oben angegebenen Downloadlink laden.
2. Die Datei mit der Endung `.streamDeckPlugin` doppelt anklicken.
3. Installation oder Update in der Stream-Deck-Software bestätigen.
4. The Bus starten und einen Bus vollständig laden.
5. Gewünschte Actions auf das Stream Deck ziehen und konfigurierbare Actions im
   Property Inspector einstellen.

### Sprache

Deutsch und Englisch sind in derselben Installation enthalten. Aktionsnamen,
Beschreibungen, Property Inspectors und dynamische Anzeigen folgen automatisch
der Sprache der Stream-Deck-Software. Deutsch dient als Rückfall für derzeit
nicht unterstützte Sprachen. Der Sprachwechsel verändert keine UUIDs,
Profilzuordnungen oder gespeicherten Auswahlen.

### Funktionsübersicht

| Bereich | Funktionen |
| --- | --- |
| Navigation | Manöver, Manöverdistanz, nächster Halt, Linienlänge, Reststrecke, Linienfortschritt, ETA, Prognose-Abweichung und Prognosesicherheit |
| Fahrplan | Haltestelle, Ankunft, Abfahrt, Abweichung, Ingame-Zeit mit Sekunden, Status und Haltewunsch auf Tasten, Einzelpanel und Fullpanel |
| Fahrzeug | Geschwindigkeit, Tempolimit, Leistung oder Fahrtverbrauch, Akkustand, Gang, Zündung, Feststellbremse, Blinker und Warnblinker |
| Türen und Einstieg | Einzeltüren, Door All, Türfreigabe, automatisches Türschließen, Kneeling, Auto-Kneeling und Rollstuhlrampe |
| Klima | Klima Ein/Aus, Heizen/Kühlen, hintere Klima, Umluft, vordere Umluft, automatische Ventilation, Temperatur und Luftverteilung |
| Licht und Fahrt | Außenbeleuchtung, Fahrgastraumlicht, Scheibenwischer, Retarder und Sonnenblende |
| Laufzeitstatus | `OFFLINE`, `NO_BUS`, `BUS_NOT_READY`, `BUS_READY` und `MISSION_READY` |

Anzeigen ändern sich nur nach bestätigter Rückmeldung aus dem Spiel. Unbekannte
oder unsichere Zustände bleiben neutral.

### Navigation

Die experimentelle Navigation wertet bestätigte zusammenhängende Routenpfade
aus und kann Manöver, Entfernung, nächsten Halt, Reststrecke,
Linienfortschritt, ETA und Prognosewerte darstellen. Missionsmerkmale
unterscheiden reguläre Halte, Endhalte und betriebliche Pausenpunkte. Bei
widersprüchlicher oder unvollständiger Geometrie bleibt die Anzeige neutral,
anstatt eine Richtung zu raten.

### Akku, Leistung und Fahrtverbrauch

Der Akkustand wird mit einer Nachkommastelle dargestellt. Ein vorhandenes
`Powermeter` bleibt die maßgebliche Leistungsquelle. Fehlt es bei einem
bestätigten Elektrobus, kann nach mindestens 200 gefahrenen Metern ein mit `Ø`
gekennzeichneter Fahrtverbrauch in `kWh/100 km` erscheinen. Grundlage sind die
bestätigte Energieänderung, offizielle Geschwindigkeit und fortlaufende
Spielzeit.

Der Durchschnitt läuft ab Pluginstart über Halte, Stillstand und
Stream-Deck-Seitenwechsel hinweg weiter. Ein Druck auf die bestehende
Leistungs-/Verbrauchstaste startet nur diese lokale Messung neu und sendet
keinen Spielbefehl.

### Fullpanels und Stream Deck Mobile

Fahrzeug-, Fahrplan- und Navigations-Fullpanels nutzen alle vier Reglersegmente
des Stream Deck + als zusammenhängende Ansicht. Normale Keypad-Actions sind auf
passenden Stream-Deck-Modellen sowie über Stream Deck Mobile verfügbar. Nicht
jede Action ist für jeden Controller-Typ vorgesehen; die Stream-Deck-Software
zeigt den benötigten Controller an.

### Navigation diagnostizieren

Die sichtbare Action **„Navigation · Debug speichern“** sichert nach Tastendruck
die vorherigen rund 60 Sekunden als TXT. Der Ringpuffer läuft ausschließlich im
Arbeitsspeicher; ohne Tastendruck wird keine Datei geschrieben.

Windows-Zielordner:
`Dokumente\Projekte\The Bus\NaviDebug`

Bei einem Navigationsproblem bitte Busmodell, Linie/Route, Haltestelle oder
Straßenabschnitt sowie die manuell erzeugte TXT im GitHub-Fehlerbericht nennen.
Private Angaben vor dem Anhängen entfernen.

### Kompatibilität und Grenzen

- Vollständig bestätigte Fahrzeugabdeckung besteht für den viertürigen
  MB eCitaro / MB eCityBus 18 m.
- Andere Fahrzeuge können abweichende Telemetrie-, Tasten- oder Zustandsnamen
  verwenden; fehlende Werte bleiben neutral.
- Navigation bleibt experimentell und kann bei unbekannter oder unvollständiger
  Routengeometrie Werte bewusst ausblenden.
- Lüftergeschwindigkeit ist am bestätigten Fahrzeug nur lesbar. Bedienung wird
  nur aktiviert, wenn ein Bus echte passende Steuerevents liefert.
- Ticketart, Preis, Zahlung, Rückgeld und Belegstatus sind nicht verfügbar,
  solange `BusLogic.Sales` keine echten Werte liefert.
- Ein statischer Linien-, Kurs- oder Umlaufkatalog ist nicht enthalten.

### Update-Kompatibilität

Die stabile Plugin-UUID lautet `de.rhao92.thebus-telemetry-interface`. Updates
ab `2.15.0.17-beta` verwenden dieselbe technische Identität und behalten
bestehende Belegungen und Einstellungen. Beim Wechsel von `2.14.1` oder älter
müssen Actions wegen der damals verwendeten früheren Identität einmalig neu
zugewiesen werden.

---

## English

### Download

- Installer: https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases/download/v2.16.0/Rhao92-The-Bus-Stream-Deck-Plugin-2.16.0.21.zip
- Release notes: https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/releases/tag/v2.16.0
- Report a bug: https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/issues/new?template=bug_report.md
- Suggest a feature: https://github.com/Rhao92/Rhao92-The-Bus-Stream-Deck-Plugin/issues/new?template=feature_request.md

### Requirements

- Windows 10 or later
- Elgato Stream Deck software 7.2 or later
- The Bus with local telemetry available at `127.0.0.1:37337`
- physical Stream Deck hardware or Stream Deck Mobile on iPhone or iPad
- Stream Deck + for dials and full panels

### Installation

1. Download the installer from the link above.
2. Double-click the `.streamDeckPlugin` file.
3. Confirm installation or update in the Stream Deck application.
4. Start The Bus and load a bus completely.
5. Add the required actions to Stream Deck and configure adjustable actions in
   the Property Inspector.

### Language

German and English are included in the same installation. Action names,
descriptions, Property Inspectors, and dynamic displays automatically follow
the Stream Deck application language. German is the fallback for languages
that are not currently supported. Changing language does not alter UUIDs,
profile assignments, or saved selections.

### Feature overview

| Area | Features |
| --- | --- |
| Navigation | Maneuver, maneuver distance, next stop, line length, remaining distance, line progress, ETA, predicted schedule delta, and prediction confidence |
| Timetable | Stop, arrival, departure, schedule delta, in-game time with seconds, status, and stop request on keys, a single panel, and the Fullpanel |
| Vehicle | Speed, speed limit, power or trip consumption, battery, gear, ignition, parking brake, indicators, and hazard lights |
| Doors and access | Individual doors, Door All, door clearance, automatic door closing, kneeling, automatic kneeling, and wheelchair ramp |
| Climate | Climate on/off, heating/cooling, rear climate, circulation, front circulation, automatic ventilation, temperature, and airflow |
| Lighting and driving | Exterior lighting, passenger lighting, wipers, retarder, and sun blind |
| Runtime status | `OFFLINE`, `NO_BUS`, `BUS_NOT_READY`, `BUS_READY`, and `MISSION_READY` |

Displays change only after confirmed game feedback. Unknown or uncertain states
remain neutral.

### Navigation

Experimental navigation evaluates confirmed connected route paths and can show
maneuver, distance, next stop, remaining route, line progress, ETA, and
prediction values. Mission characteristics distinguish regular stops, final
destinations, and operational pause points. Contradictory or incomplete
geometry remains neutral instead of producing a guessed direction.

### Battery, power, and trip consumption

Battery level is shown with one decimal place. A real `Powermeter` remains the
authoritative power source. If it is absent on a confirmed electric bus, a
clearly marked average trip consumption (`Ø`) in `kWh/100 km` can appear after
at least 200 metres. It uses confirmed energy change, official speed, and
advancing game time.

The average continues from plugin startup across stops, standstill, and Stream
Deck page changes. Pressing the existing power/consumption key restarts only
this local measurement and sends no game command.

### Full panels and Stream Deck Mobile

Vehicle, timetable, and Navigation Fullpanels use all four Stream Deck + dial
segments as one continuous view. Regular keypad actions are available on
matching Stream Deck models and through Stream Deck Mobile. Not every action is
available on every controller type; the Stream Deck application identifies the
required controller.

### Navigation diagnostics

Pressing the visible **Navigation · Debug speichern** action saves the previous
roughly 60 seconds as a TXT file. The ring buffer remains memory-only and no
file is written without the key press.

Windows destination:
`Documents\Projekte\The Bus\NaviDebug`

For a navigation issue, include the bus model, line/route, stop or road section,
and the manually created TXT in the GitHub issue. Remove private information
before attaching it.

### Compatibility and limitations

- Fully confirmed vehicle coverage currently applies to the four-door
  18-metre MB eCitaro / MB eCityBus.
- Other vehicles may use different telemetry, button, or state names; missing
  values remain neutral.
- Navigation remains experimental and may deliberately hide values when route
  geometry is unknown or incomplete.
- Fan speed is read-only on the confirmed vehicle. Control is enabled only when
  a bus provides real matching control events.
- Ticket type, price, payment, change, and receipt status are unavailable while
  `BusLogic.Sales` provides no genuine values.
- No static line, course, or duty catalogue is included.

### Update compatibility

The stable plugin UUID is `de.rhao92.thebus-telemetry-interface`. Updates from
`2.15.0.17-beta` onward use the same technical identity and retain existing
assignments and settings. Users upgrading from `2.14.1` or older must assign
actions once because those versions used an earlier identity.
