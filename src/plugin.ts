import streamDeck from "@elgato/streamdeck";
import { registerPluginActions } from "./actions/register-actions";
import { NavigationDebugRecorder } from "./navigation/navigation-debug-recorder";

streamDeck.logger.setLevel("info");
streamDeck.logger.info("Rhao92’s The Bus Telemetry Interface startet.");

// Nur im Dev-Zweig: permanenter RAM-Ringpuffer, keinerlei Disk-I/O bis zum
// ausdruecklichen Druck auf die Navigation-Debug-Taste.
NavigationDebugRecorder.instance.start();

const actionRegistry = registerPluginActions();
streamDeck.logger.info(`${actionRegistry.size} Actions registriert.`);

streamDeck.connect();
