import streamDeck from "@elgato/streamdeck";
import { registerPluginActions } from "./actions/register-actions";
import { setDisplayLanguage } from "./core/localization";
import { FullpanelViewModelHub } from "./fullpanel/view-model-hub";
import { NavigationDebugRecorder } from "./navigation/navigation-debug-recorder";

streamDeck.logger.setLevel("info");
setDisplayLanguage(streamDeck.info.application.language);
streamDeck.logger.info("Rhao92's The Bus Stream Deck Plugin startet.");

// Nur im Dev-Zweig: permanenter RAM-Ringpuffer, keinerlei Disk-I/O bis zum
// ausdruecklichen Druck auf die Navigation-Debug-Taste.
NavigationDebugRecorder.instance.start();

// Fahrtbezogene Auswertungen laufen ab Pluginstart weiter, auch wenn der
// Nutzer auf eine Stream-Deck-Seite ohne sichtbares Fullpanel wechselt.
FullpanelViewModelHub.instance.start();

const actionRegistry = registerPluginActions();
streamDeck.logger.info(`${actionRegistry.size} Actions registriert.`);

streamDeck.connect();
