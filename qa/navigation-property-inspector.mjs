import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(
  new URL("../de.rhao92.thebus-telemetry-interface.sdPlugin/property-inspector/navigation.html", import.meta.url),
  "utf8"
);
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "Navigation-Property-Inspector enthält kein Script");

class FakeWebSocket {
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.listeners = new Map();
    this.sent = [];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  send(message) {
    this.sent.push(JSON.parse(message));
  }

  emit(type, data = undefined) {
    this.listeners.get(type)?.(data === undefined ? {} : { data: JSON.stringify(data) });
  }
}

function element() {
  return {
    value: "",
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }
  };
}

function createHarness(initialKind) {
  const kindSelect = element();
  const socketInstances = [];
  class HarnessSocket extends FakeWebSocket {
    constructor(url) {
      super(url);
      socketInstances.push(this);
    }
  }
  const context = vm.createContext({
    document: {
      getElementById(id) {
        if (id === "kind") return kindSelect;
        throw new Error(`Unbekanntes Element ${id}`);
      }
    },
    WebSocket: HarnessSocket
  });
  vm.runInContext(script, context);
  context.connectElgatoStreamDeckSocket(
    12345,
    "property-inspector-context",
    "registerPropertyInspector",
    "{}",
    JSON.stringify({
      action: "de.rhao92.thebus-telemetry-interface.navigation-maneuver",
      context: "action-context",
      payload: { settings: { kind: initialKind } }
    })
  );
  const socket = socketInstances.at(-1);
  assert.ok(socket);
  socket.emit("open");
  return { context, kindSelect, socket };
}

const navigation = createHarness("next-stop");
assert.equal(navigation.kindSelect.value, "next-stop", "Gespeicherte Auswahl wird angezeigt");
assert.ok(
  navigation.socket.sent.some((message) =>
    message.event === "getSettings"
    && message.action === "de.rhao92.thebus-telemetry-interface.navigation-maneuver"
    && message.context === "action-context"
  ),
  "Persistierte Navigationseinstellungen werden beim Öffnen angefordert"
);

navigation.kindSelect.value = "eta";
navigation.kindSelect.listeners.get("change")?.();
const savedSettings = navigation.socket.sent.filter((message) => message.event === "setSettings");
assert.ok(savedSettings.length > 0, "Auswahlwechsel sendet setSettings");
assert.ok(
  savedSettings.every((message) =>
    message.action === "de.rhao92.thebus-telemetry-interface.navigation-maneuver"
    && message.payload?.kind === "eta"
  ),
  "setSettings enthält Action-UUID und gewählte Navigationsanzeige"
);

navigation.socket.emit("message", {
  event: "didReceiveSettings",
  context: "action-context",
  payload: { settings: { kind: "next-stop" } }
});
assert.equal(navigation.kindSelect.value, "eta", "Eine verspätete alte Antwort darf die neue Auswahl nicht zurücksetzen");

navigation.socket.emit("message", {
  event: "didReceiveSettings",
  context: "action-context",
  payload: { settings: { kind: "eta" } }
});
assert.equal(navigation.kindSelect.value, "eta", "Bestätigte Auswahl bleibt sichtbar");

const reopened = createHarness("remaining-distance");
assert.equal(reopened.kindSelect.value, "remaining-distance", "Gespeicherte Auswahl wird nach erneutem Öffnen geladen");

console.log("Navigation property-inspector regression passed");
