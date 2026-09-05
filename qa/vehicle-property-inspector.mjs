import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(
  new URL("../de.rhao92.thebus-telemetry-interface.sdPlugin/property-inspector/vehicle.html", import.meta.url),
  "utf8",
);
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "Vehicle Property Inspector enthält kein Script");

class FakeWebSocket {
  static OPEN = 1;

  constructor() {
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

const kinds = ["speed", "limit", "power", "battery"];
const radios = kinds.map((value) => ({
  value,
  checked: false,
  listeners: new Map(),
  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  },
}));
const sockets = [];
class HarnessSocket extends FakeWebSocket {
  constructor() {
    super();
    sockets.push(this);
  }
}
const context = vm.createContext({
  TheBusI18n: { setLanguage() {} },
  document: {
    querySelectorAll() { return radios; },
    querySelector(selector) {
      const value = selector.match(/value="([^"]+)"/)?.[1];
      return radios.find((radio) => radio.value === value) ?? null;
    },
  },
  WebSocket: HarnessSocket,
});
vm.runInContext(script, context);
context.connectElgatoStreamDeckSocket(
  12345,
  "property-inspector-context",
  "registerPropertyInspector",
  "{}",
  JSON.stringify({
    action: "de.rhao92.thebus-telemetry-interface.vehicle-speed",
    context: "action-context",
    payload: { settings: { kind: "battery" } },
  }),
);
const socket = sockets.at(-1);
assert.ok(socket);
socket.emit("open");
assert.equal(radios.find((radio) => radio.value === "battery")?.checked, true);
assert.ok(socket.sent.some((message) =>
  message.event === "getSettings"
  && message.action === "de.rhao92.thebus-telemetry-interface.vehicle-speed"
  && message.context === "action-context"
));

const power = radios.find((radio) => radio.value === "power");
power.checked = true;
power.listeners.get("change")?.();
assert.ok(socket.sent.some((message) =>
  message.event === "setSettings"
  && message.action === "de.rhao92.thebus-telemetry-interface.vehicle-speed"
  && message.context === "action-context"
  && message.payload?.kind === "power"
));

socket.emit("message", {
  event: "didReceiveSettings",
  context: "action-context",
  payload: { settings: { kind: "battery" } },
});
assert.equal(power.checked, true, "Verspätete alte Settings dürfen die neue Auswahl nicht zurücksetzen");

socket.emit("message", {
  event: "didReceiveSettings",
  context: "action-context",
  payload: { settings: { kind: "power" } },
});
assert.equal(power.checked, true);

console.log("Vehicle property-inspector regression passed");
