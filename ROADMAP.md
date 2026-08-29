# Rhao92's The Bus Stream Deck Plugin – Product Roadmap

This roadmap accompanies the stable `2.16.0` release (installer build
`2.16.0.21`). Availability, planned work, long-term ideas, dependencies and
blocked areas are deliberately kept separate.

---

## Deutsch

### Statusbegriffe

- **Verfügbar:** im aktuellen Entwicklungsstand vorhanden.
- **Aktueller Schwerpunkt:** für den nächsten stabilen Stand vorgesehen.
- **Geplant:** beschlossen, aber noch nicht vollständig umgesetzt.
- **Langfristig:** Teil der Produktvision ohne zugesagten Termin.
- **Blockiert:** benötigt noch echte Spieldaten, Ereignisse oder eine externe
  Freigabe.
- **Nicht vorgesehen:** widerspricht den technischen oder qualitativen
  Grundsätzen des Projekts.

### Aktueller Schwerpunkt – stabiler 2.16.0-Release

Der nächste stabile Produktstand ist für GitHub und den Elgato Marketplace
vorgesehen. Beide Wege behalten dieselbe Plugin- und Action-Identität. GitHub
bleibt zusätzlich die zentrale Stelle für Dokumentation, Downloads, Feedback
und Fehlerberichte.

Für `2.16.0` verfügbar:

- automatische deutsche und englische Oberfläche in einer Installation,
  einschließlich Action-Liste, Beschreibungen, Einstellungsfenstern,
  Laufzeitanzeigen, Fullpanels und sprachabhängiger Zahlenformatierung
- vollständige Mehrpfad-Navigation über zusammenhängende, bestätigte
  Routenabschnitte mit Reststrecke, Linienfortschritt, ETA,
  Prognose-Abweichung und Prognosesicherheit
- missionsgeführte Unterscheidung zwischen regulärem Halt, Endhalt und
  bestätigtem betrieblichen Pausenpunkt
- stabilere Pfeile bei parallelen Fahrspuren, engen Gegenabbiegern,
  gekürzten Routenpräfixen, langen Kurven und vorzeitigen Missionswechseln
- übersichtlicheres Navigations-Fullpanel mit größeren Werten und ohne den
  früheren, zu kleinen NAV-STATUS-Bereich
- echte STOP-Rückmeldung ohne Demo-Zustände im produktiven Fullpanel
- Akkustand mit einer Nachkommastelle und durchgehend gefüllter Anzeige
- echtes Powermeter, sofern das Fahrzeug es liefert; andernfalls beim
  bestätigten Elektrobus ein klar gekennzeichneter Fahrtverbrauch in
  `kWh/100 km` aus offizieller Telemetrie
- kumulierter Fahrtverbrauch über Halte, Stillstand und Stream-Deck-
  Seitenwechsel hinweg sowie manueller Neustart über die vorhandene
  Leistungs-/Verbrauchstaste
- größenkorrigierte farbige Plugin-, Kategorie- und Action-Listenicons für den
  GitHub-/Quellstand
- stabile UUIDs, gespeicherte Einstellungen und Profilzuordnungen

Vor der Veröffentlichung noch erforderlich:

- endgültiger Funktionsumfang und vierteilige Installer-Version festlegen
- markenneutrale, monochrome Marketplace-Icons und Produktgrafiken fertigstellen
- GitHub- und Marketplace-Metadaten, Screenshots und Links finalisieren
- Veröffentlichungspaket, Datenschutzprüfung und Release-Freigaben abschließen
- Marketplace-Einreichung mit deaktivierter automatischer Veröffentlichung;
  der spätere Go-live benötigt eine eigene Freigabe

### Nächste Ausbaustufen

#### Fahrzeugzustands-Fullpanel

- allgemeine moderne Bus-Silhouette im bestehenden Modern-Glow-Stil
- Türanzahl ausschließlich aus der echten Fahrzeugtelemetrie ableiten
- geschlossene, bewegte und offene Türen dynamisch darstellen
- Klima, Kühlung, Solltemperatur, Lüfter, Umluft und Heckklima nur anzeigen,
  wenn der jeweilige Bus diese Zustände tatsächlich liefert
- später optional Kneeling, Rampe und Türfreigabe ergänzen
- bei fehlender Türliste eine neutrale Silhouette statt einer erfundenen
  Standardkonfiguration anzeigen

#### Akku-Prognose für den aktuellen Linienlauf

- auf dem vorhandenen kumulierten Fahrtverbrauch aufbauen
- aktuellen Akkustand, gefahrene Strecke und bestätigte Reststrecke verbinden
- erwarteten Restakku als Bereich mit niedriger, mittlerer oder hoher
  Vertrauensstufe darstellen, nicht als garantierten Einzelwert
- Hin- und Rückrichtung sowie unterschiedliche Fahrzeuge getrennt lernen
- Außentemperatur, Klima, Verkehr, Fahrstil und Rekuperation später in die
  Unsicherheitsbreite einbeziehen
- Lerndaten ausschließlich lokal und ohne private Inhalte speichern

#### Weitere Fahrzeuge und Bedienbereiche

- reale Telemetrie- und Ereignisabweichungen weiterer Busmodelle dokumentieren
- fehlende Zustände neutral behandeln und Unterstützung niemals pauschal
  behaupten
- bestehende Action-Familien in übersichtlichen Property Inspectors bündeln
- zusätzliche Licht-, Klima-, ATRON- und Fahrzeugfunktionen nur bei belegten
  Spielereignissen freischalten

#### Navigation auf weiteren Karten

- allgemeine Regeln für Berlin, Hamburg und zukünftige Karten weiter ausbauen
- vollständige Liniengeometrie, Haltestellenfolge und Missionsfortschritt aus
  derselben bestätigten Quelle ableiten
- komplexe Parallelstraßen, Wenden, enge Gegenabbieger und unvollständige
  Geometrien weiterhin neutral absichern
- die manuelle 60-Sekunden-Diagnose als datenschutzfreundliche Grundlage für
  neue allgemeine Navigationsverbesserungen beibehalten

### Mittelfristige Ziele

#### Mehrere Linienläufe und vollständige Umläufe

- Prognosen über mehrere Wiederholungen erst nach belastbarer Einzellauf-
  Prognose ergänzen
- sichtbare Kursnummer gegen `tour.name` auf mehreren Linien und Tagesarten
  eindeutig bestätigen
- konkrete Fahrtfolgen statt einer pauschalen Multiplikation der Linienlänge
  berücksichtigen
- bei unbekannter Wiederholungszahl nur ehrliche Szenarien wie „nach 1/2/3
  weiteren Läufen“ oder eine bewusst gewählte Anzahl anbieten

#### Optionaler statischer Routenkatalog

- nur als minimaler, versionsgebundener lokaler Datenbestand erwägen
- Spielversion, Karte, Betriebsplan und Herkunft eindeutig kennzeichnen
- veraltete oder unbekannte Daten erkennen und sicher auf Live-Telemetrie
  zurückfallen
- keine Spielassets oder abgeleiteten Routendaten ohne belastbare rechtliche
  Freigabe verteilen
- geschützte Container oder Zugriffsbeschränkungen niemals umgehen

#### Smartpanel Light

- optionale kontextabhängige Panelwahl mit Hysterese und Mindestanzeigedauer
- manuelle Auswahl und bestehende Reglerumschaltung respektieren
- Ticketkontext erst verwenden, wenn echte Verkaufsdaten verfügbar sind
- unsichere Kontexte nicht erraten

### Langfristige Produktvision

- robuste, datengetriebene Navigation für weitere DLCs und Karten
- zentrale RouteProgress-, Manöver-, Distanz- und Confidence-Architektur
- lokales Lernen aus bestätigten Fahrten ohne private oder inoffizielle
  Laufzeitdaten
- Theme- und Preset-System erst nach Funktions- und Stabilitätsabschluss
- optionale Presets wie Modern Glow, Minimal, High Contrast und ein begrenztes
  realistisches Design
- Bereichs-Presets für Türen, Klima, Licht, Navigation, Fahrzeug und Panels
- anpassbare Modern-Glow-Akzentfarben über zentrale Design-Tokens statt
  einzeln verdrahteter Rendererfarben
- klare Dokumentation, Privacy by Default und langfristige Kompatibilität mit
  Stream Deck Mobile

### Blockiert oder abhängig

- **Lüftergeschwindigkeit:** am bestätigten eBus nur lesbar; Steuerung benötigt
  echte passende Fahrzeugereignisse.
- **Ticket- und Verkaufsanzeigen:** `BusLogic.Sales` liefert keine belastbaren
  Werte für Ticketart, Preis, Zahlung, Rückgeld, Beleg oder Druckstatus.
- **Ticket-Fullpanel:** bleibt ohne echte Sales-Daten blockiert.
- **Mehrlauf-Prognose:** benötigt eine eindeutig bestätigte Kurszuordnung und
  vollständige verbleibende Fahrtfolge.
- **Statischer Routenkatalog:** benötigt Rechtsklärung; für Berlin fehlt eine
  gleichwertige normal lesbare Datenbasis.
- **Marketplace-Veröffentlichung:** benötigt eigenständige markenneutrale
  Medien, vollständige Metadaten und die Freigabe nach dem Elgato-Review.

### Bewusst nicht vorgesehen

- erfundene Fahrzeug-, Ticket-, Klima- oder Navigationszustände
- Speicheranalyse, DLL-Injection, Netzwerk-Mitschnitt oder andere
  inoffizielle Runtime-Datenquellen
- ein Ticket-Fullpanel mit simulierten Verkaufsdaten
- aggressive Navigationsraterei aus Luftlinie oder nächstem Geometriepunkt
- eine reine Hotkey-/Makro-Sammlung ohne echte Telemetrie und Rückmeldung
- ein kurzfristig eingebautes Theme-System, das Profile oder Rendererstruktur
  gefährdet

---

## English

### Status terms

- **Available:** present in the current development state.
- **Current focus:** intended for the next stable release.
- **Planned:** agreed direction, not fully implemented yet.
- **Long-term:** part of the product vision without a promised date.
- **Blocked:** requires real game data, events, or external clearance.
- **Not planned:** conflicts with the project's technical or quality rules.

### Current focus – stable 2.16.0 release

The next stable product version is intended for GitHub and the Elgato
Marketplace. Both channels retain the same plugin and action identities.
GitHub also remains the central location for documentation, downloads,
feedback, and issue reports.

Available for `2.16.0`:

- automatic German and English UI in one installation, covering the action
  list, descriptions, Property Inspectors, runtime displays, full panels, and
  locale-aware number formatting
- complete multi-path navigation across connected, confirmed route sections,
  including remaining distance, line progress, ETA, predicted schedule delta,
  and prediction confidence
- mission-guided distinction between regular stops, final destinations, and
  confirmed operational pause points
- more stable arrows around parallel lanes, close opposing turns, trimmed
  route prefixes, sustained curves, and premature mission changes
- a clearer Navigation Fullpanel with larger values and without the former
  cramped NAV STATUS area
- genuine STOP feedback without demonstration states in the production panel
- battery level with one decimal place and a continuously filled gauge
- a real power meter whenever the vehicle provides it; otherwise a clearly
  marked trip consumption in `kWh/100 km` for a confirmed electric bus using
  official telemetry
- cumulative trip consumption retained across stops, standstill, and Stream
  Deck page changes, plus a manual restart through the existing
  power/consumption key
- correctly sized colored plugin, category, and action-list icons for the
  GitHub/source version
- stable UUIDs, saved settings, and profile assignments

Still required before publication:

- freeze the final feature scope and four-part installer version
- complete brand-neutral monochrome Marketplace icons and product artwork
- finalize GitHub and Marketplace metadata, screenshots, and links
- complete the publication package, privacy review, and release approvals
- submit to the Marketplace with automatic publication disabled; the later
  go-live requires separate approval

### Next development stages

#### Vehicle-status Fullpanel

- general modern bus silhouette in the existing Modern Glow style
- derive the number of doors exclusively from real vehicle telemetry
- dynamically show closed, moving, and open doors
- show climate, cooling, target temperature, fan, circulation, and rear climate
  only when the vehicle actually provides those states
- optionally add kneeling, ramp, and door clearance later
- show a neutral silhouette instead of inventing a standard configuration when
  the door list is unavailable

#### Battery forecast for the current line run

- build on the existing cumulative trip consumption
- combine current battery, travelled distance, and confirmed remaining route
- show expected remaining battery as a range with low, medium, or high
  confidence instead of a guaranteed single value
- learn outbound/inbound directions and different vehicles separately
- later include outside temperature, climate use, traffic, driving style, and
  recuperation in the uncertainty range
- store learning data locally only and without private information

#### More vehicles and control areas

- document real telemetry and event differences for additional bus models
- keep missing states neutral and never claim blanket support
- consolidate existing action families into clear Property Inspectors
- enable additional lighting, climate, ATRON, and vehicle functions only when
  confirmed game events exist

#### Navigation across more maps

- continue building general rules for Berlin, Hamburg, and future maps
- derive complete line geometry, stop order, and mission progress from the same
  confirmed source
- keep complex parallel roads, U-turns, close opposing turns, and incomplete
  geometry safely neutral when uncertain
- retain the manual 60-second diagnostic as a privacy-conscious basis for new
  general navigation improvements

### Mid-term goals

#### Multiple line runs and complete duties

- add forecasts across repeated runs only after a reliable single-run forecast
- confirm the visible course number against `tour.name` across several lines
  and day categories
- process concrete trip sequences instead of multiplying one line distance
- when the repetition count is unknown, offer only honest scenarios such as
  “after 1/2/3 more runs” or an explicitly selected number

#### Optional static route catalogue

- consider only a minimal, version-bound local dataset
- identify game version, map, operating plan, and provenance clearly
- detect stale or unknown data and safely fall back to live telemetry
- never distribute game assets or derived route data without reliable legal
  clearance
- never bypass protected containers or access restrictions

#### Smartpanel Light

- optional context-sensitive panel selection with hysteresis and minimum display
  duration
- respect manual selection and the existing dial switch
- use ticket context only after genuine sales data becomes available
- never guess uncertain contexts

### Long-term product vision

- robust, data-driven navigation for additional DLCs and maps
- central RouteProgress, maneuver, distance, and confidence architecture
- local learning from confirmed drives without private or unofficial runtime
  data
- theme and preset system only after functional and stability work is complete
- optional presets such as Modern Glow, Minimal, High Contrast, and a limited
  realistic design
- per-area presets for doors, climate, lighting, navigation, vehicle, and panels
- customizable Modern Glow accent colors through central design tokens instead
  of individually hard-coded renderer colors
- clear documentation, privacy by default, and long-term Stream Deck Mobile
  compatibility

### Blocked or dependent

- **Fan speed:** read-only on the confirmed electric bus; control requires real
  matching vehicle events.
- **Ticket and sales displays:** `BusLogic.Sales` provides no reliable ticket
  type, price, payment, change, receipt, or printing state.
- **Ticket Fullpanel:** remains blocked without genuine sales data.
- **Multi-run forecast:** requires a clearly confirmed course mapping and the
  complete remaining trip sequence.
- **Static route catalogue:** requires legal clearance; an equivalent normally
  readable source for Berlin has not been identified.
- **Marketplace publication:** requires independent brand-neutral media,
  complete metadata, and approval after Elgato review.

### Deliberately not planned

- invented vehicle, ticket, climate, or navigation states
- memory analysis, DLL injection, network capture, or other unofficial runtime
  data sources
- a ticket Fullpanel with simulated sales data
- aggressive navigation guesses based only on air distance or the nearest
  geometry point
- a pure hotkey/macro collection without real telemetry and feedback
- a rushed theme system that risks profiles or renderer structure
