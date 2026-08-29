import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(
  new URL("../de.rhao92.thebus-telemetry-interface.sdPlugin/property-inspector/hvac.html", import.meta.url),
  "utf8"
);
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "HVAC-Property-Inspector enthält kein Script");

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

function element(tagName = "div") {
  return {
    tagName,
    value: "",
    label: "",
    textContent: "",
    children: [],
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    },
    append(child) {
      this.children.push(child);
    },
    replaceChildren(...children) {
      this.children = children;
    }
  };
}

function createHarness(action, initialMode) {
  const modeSelect = element("select");
  const description = element("p");
  const socketInstances = [];
  class HarnessSocket extends FakeWebSocket {
    constructor(url) {
      super(url);
      socketInstances.push(this);
    }
  }
  const context = vm.createContext({
    TheBusI18n: {
      setLanguage() {},
      text(value) { return value; },
    },
    document: {
      getElementById(id) {
        if (id === "mode") return modeSelect;
        if (id === "description") return description;
        throw new Error(`Unbekanntes Element ${id}`);
      },
      createElement(tagName) {
        return element(tagName);
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
      action,
      context: "action-context",
      payload: { settings: { mode: initialMode } }
    })
  );
  const socket = socketInstances.at(-1);
  assert.ok(socket);
  socket.emit("open");
  return { context, modeSelect, description, socket };
}

const key = createHarness("de.rhao92.thebus-telemetry-interface.hvac-control", "climate");
assert.equal(key.modeSelect.value, "climate", "Gespeicherter Tastenmodus wird angezeigt");
assert.ok(
  key.socket.sent.some((message) =>
    message.event === "getSettings"
    && message.action === "de.rhao92.thebus-telemetry-interface.hvac-control"
    && message.context === "action-context"
  ),
  "Persistierte Action-Einstellungen werden beim Öffnen angefordert"
);

key.modeSelect.value = "fan";
key.modeSelect.listeners.get("change")?.();
const savedFanSettings = key.socket.sent.filter((message) => message.event === "setSettings");
assert.ok(savedFanSettings.length > 0, "Moduswechsel sendet setSettings");
assert.ok(
  savedFanSettings.every((message) =>
    message.action === "de.rhao92.thebus-telemetry-interface.hvac-control"
    && message.payload?.mode === "fan"
  ),
  "setSettings enthält Action-UUID und gewählten HVAC-Modus"
);

key.socket.emit("message", {
  event: "didReceiveSettings",
  context: "action-context",
  payload: { settings: { mode: "climate" } }
});
assert.equal(key.modeSelect.value, "fan", "Eine verspätete alte Antwort darf die neue Auswahl nicht zurücksetzen");

key.socket.emit("message", {
  event: "didReceiveSettings",
  context: "action-context",
  payload: { settings: { mode: "fan" } }
});
assert.equal(key.modeSelect.value, "fan", "Bestätigte Auswahl bleibt sichtbar");

const dial = createHarness("de.rhao92.thebus-telemetry-interface.hvac-dial", "fan-speed");
assert.equal(dial.modeSelect.value, "fan-speed", "Gespeicherter Plus-Reglermodus wird angezeigt");
dial.modeSelect.value = "airflow";
dial.modeSelect.listeners.get("change")?.();
assert.ok(
  dial.socket.sent.some((message) =>
    message.event === "setSettings"
    && message.action === "de.rhao92.thebus-telemetry-interface.hvac-dial"
    && message.payload?.mode === "airflow"
  ),
  "Plus-Reglerauswahl wird mit eigener Action-UUID gespeichert"
);

for (const mode of [
  "ac-mode", "rear", "circulation", "circulation-front", "ventilation",
  "fan-down", "airflow-left", "airflow-right", "temperature", "fan-speed", "airflow"
]) {
  assert.match(html, new RegExp(`\\[\"${mode}\"|value=\"${mode}\"`), `HVAC-Modus ${mode} fehlt`);
}

console.log("HVAC property-inspector regression passed");
