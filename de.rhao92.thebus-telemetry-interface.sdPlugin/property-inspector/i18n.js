(function () {
  "use strict";

  const EN = Object.freeze({
    "Action konfigurieren": "Configure action",
    "Funktion": "Function",
    "Funktion auswählen": "Select function",
    "Die Auswahl wird automatisch für diese Taste gespeichert.": "The selection is saved automatically for this key.",
    "Gespeichert": "Saved",
    "Speichere …": "Saving…",
    "Keine Konfiguration verfügbar": "No configuration available",
    "Alle Türen": "All doors",
    "Tür 1": "Door 1",
    "Tür 2": "Door 2",
    "Tür 3": "Door 3",
    "Tür 4": "Door 4",
    "Türfreigabe": "Door clearance",
    "Automatisches Türschließen": "Automatic door closing",
    "Gang D": "Gear D",
    "Gang N": "Gear N",
    "Gang R": "Gear R",
    "Gangwahl · D": "Gear selection · D",
    "Gangwahl · N": "Gear selection · N",
    "Gangwahl · R": "Gear selection · R",
    "Blinker · links": "Indicators · left",
    "Blinker · rechts": "Indicators · right",
    "Blinker · Warnblinker": "Indicators · hazard lights",
    "Bremsen · Feststellbremse": "Brakes · parking brake",
    "Bremsen · Haltestellenbremse": "Brakes · stop brake",
    "Retarder · Stufe höher": "Retarder · level up",
    "Retarder · Stufe niedriger": "Retarder · level down",
    "Retarder · Aus": "Retarder · off",
    "Retarder · Direkt auf Stufe 1": "Retarder · go directly to level 1",
    "Retarder · Direkt auf Stufe 2": "Retarder · go directly to level 2",
    "Retarder · Direkt auf Stufe 3": "Retarder · go directly to level 3",
    "Retarder · Direkt auf Stufe 4": "Retarder · go directly to level 4",
    "Retarder · Direkt auf Stufe 5": "Retarder · go directly to level 5",
    "Scheibenwischer · Stufe höher": "Windshield wiper · level up",
    "Scheibenwischer · Stufe niedriger": "Windshield wiper · level down",
    "Blinker links": "Left indicator",
    "Blinker rechts": "Right indicator",
    "Warnblinker": "Hazard lights",
    "Feststellbremse": "Parking brake",
    "Haltestellenbremse": "Stop brake",
    "Stufe höher": "Level up",
    "Stufe niedriger": "Level down",
    "Retarder aus": "Retarder off",
    "Direkt auf Stufe 1": "Go directly to level 1",
    "Direkt auf Stufe 2": "Go directly to level 2",
    "Direkt auf Stufe 3": "Go directly to level 3",
    "Direkt auf Stufe 4": "Go directly to level 4",
    "Direkt auf Stufe 5": "Go directly to level 5",
    "Wischerstufe höher": "Wiper level up",
    "Wischerstufe niedriger": "Wiper level down",
    "Kneeling manuell": "Manual kneeling",
    "Automatisches Kneeling": "Automatic kneeling",
    "Ein / Aus": "On / Off",
    "Ein / Aus / nächste Lichtstufe": "On / off / next light level",
    "Aus": "Off",
    "Ein": "On",
    "Gedimmt": "Dimmed",
    "Hell": "Bright",
    "Dunkler": "Dimmer",
    "Dunkler (wenn separat vorhanden)": "Dimmer (when available separately)",
    "Heller": "Brighter",
    "Heller (wenn separat vorhanden)": "Brighter (when available separately)",
    "Lichtschalter: Position höher": "Light switch: position up",
    "Lichtschalter: Position niedriger": "Light switch: position down",
    "Tagfahrlicht (nur Anzeige)": "Daytime lights (display only)",
    "Standlicht (nur Anzeige)": "Parking lights (display only)",
    "Abblendlicht (nur Anzeige)": "Headlights (display only)",
    "Fernlicht umschalten": "Toggle high beam",
    "Nebellicht vorne (nur Anzeige)": "Front fog light (display only)",
    "Nebelschlusslicht (nur Anzeige)": "Rear fog light (display only)",
    "ATRON/Bordcomputer auswählen": "Select ATRON/on-board computer",
    "Münztaste 0,05 €": "Coin key €0.05",
    "Münztaste 0,10 €": "Coin key €0.10",
    "Münztaste 0,15 €": "Coin key €0.15",
    "Münztaste 0,20 €": "Coin key €0.20",
    "Münztaste 0,30 €": "Coin key €0.30",
    "Münztaste 0,50 €": "Coin key €0.50",
    "Münztaste 0,60 €": "Coin key €0.60",
    "Münztaste 1,00 €": "Coin key €1.00",
    "Münztaste 2,00 €": "Coin key €2.00",
    "Münztaste 4,00 €": "Coin key €4.00",
    "Münztaste 6,00 €": "Coin key €6.00",
    "Münztaste 8,00 €": "Coin key €8.00",
    "Klima": "Climate",
    "Wähle aus, welche Klimafunktion diese Taste übernimmt.": "Choose which climate function this key controls.",
    "Wähle aus, welchen Klimaregler der Stream-Deck-Plus-Drehknopf übernimmt.": "Choose which climate control the Stream Deck + dial operates.",
    "Klimaanlage Ein/Aus + Temperatur": "Climate on/off + temperature",
    "Heizen / Kühlen": "Heating / cooling",
    "Hintere Klimaanlage": "Rear climate",
    "Luftzirkulation": "Air recirculation",
    "Vordere Luftzirkulation": "Front air recirculation",
    "Automatische Ventilation": "Automatic ventilation",
    "Temperatur +1 °C": "Temperature +1 °C",
    "Temperatur −1 °C": "Temperature −1 °C",
    "Lüfter schneller": "Fan faster",
    "Lüfter langsamer": "Fan slower",
    "Luftverteilung nach links": "Airflow left",
    "Luftverteilung nach rechts": "Airflow right",
    "Bedienfeld-Tasten": "Control panel keys",
    "Regler als Taste": "Dial as key",
    "Temperaturregler": "Temperature control",
    "Lüftergeschwindigkeit": "Fan speed",
    "Luftverteilung": "Airflow",
    "Wähle aus, was diese Taste anzeigen soll.": "Choose what this key should display.",
    "Anzeige": "Display",
    "Pfeil + Entfernung": "Arrow + distance",
    "Legacy · nur Entfernung": "Legacy · distance only",
    "Nächster Halt": "Next stop",
    "Linienlänge": "Route length",
    "Reststrecke": "Remaining distance",
    "Linienfortschritt": "Route progress",
    "Prognose-Delta": "Predicted delta",
    "Prognosesicherheit": "Prediction confidence",
    "Fahrplan-Anzeige": "Timetable display",
    "Wähle aus, was dieser Regler oder diese Taste anzeigen soll.": "Choose what this dial or key should display.",
    "Haltestelle": "Stop",
    "Ankunft": "Arrival",
    "Abfahrt": "Departure",
    "Abweichung": "Deviation",
    "Ingame-Zeit": "In-game time",
    "Status": "Status",
    "Haltewunsch": "Stop request",
    "Fahrzeug-Anzeige": "Vehicle display",
    "Wähle aus, welchen Fahrzeugwert diese Taste anzeigen soll.": "Choose which vehicle value this key should display.",
    "Geschwindigkeit": "Speed",
    "Tempolimit": "Speed limit",
    "Leistung / Verbrauch": "Power / consumption",
    "Akkustand": "Battery level"
  });

  let language = "de";

  function parseInfo(info) {
    try {
      return typeof info === "string" ? JSON.parse(info) : (info || {});
    } catch {
      return {};
    }
  }

  function text(value) {
    return language === "en" ? (EN[value] || value) : value;
  }

  function apply() {
    document.documentElement.lang = language;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = text(element.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
      element.setAttribute("aria-label", text(element.dataset.i18nAria));
    });
    if (document.body?.dataset.titleSuffix) {
      document.title = `Rhao92's The Bus Stream Deck Plugin – ${text(document.body.dataset.titleSuffix)}`;
    }
  }

  function setLanguage(info) {
    const parsed = parseInfo(info);
    language = String(parsed?.application?.language || "de").toLowerCase().startsWith("en") ? "en" : "de";
    apply();
    return language;
  }

  window.TheBusI18n = Object.freeze({ apply, setLanguage, text, get language() { return language; } });
})();
