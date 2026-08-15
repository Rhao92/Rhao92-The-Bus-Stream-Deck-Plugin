import streamDeck, { type SingletonAction } from "@elgato/streamdeck";

export type ManagedAction = SingletonAction & {
  dispose(): void;
};

export type ActionConstructor<TAction extends ManagedAction = ManagedAction> =
  new () => TAction;

/**
 * Zentrale Registry aller Plugin-Actions.
 *
 * Seit Sprint 2.6 muss jede registrierbare Action den gemeinsamen
 * BaseContextAction-Lifecycle und damit ein idempotentes dispose() anbieten.
 * Neue Sonder-Actions koennen dadurch nicht mehr versehentlich ohne
 * kontrollierbares Cleanup in den Plugin-Katalog aufgenommen werden.
 */
export class ActionRegistry {
  private readonly instances: ManagedAction[] = [];
  private readonly constructors = new Set<ActionConstructor>();
  private disposed = false;

  get size(): number {
    return this.instances.length;
  }

  register<TAction extends ManagedAction>(
    ActionType: ActionConstructor<TAction>
  ): TAction {
    if (this.disposed) {
      throw new Error(
        "In eine bereits entsorgte ActionRegistry kann nicht registriert werden."
      );
    }

    if (this.constructors.has(ActionType)) {
      throw new Error(`Action \"${ActionType.name}\" ist bereits registriert.`);
    }

    const instance = new ActionType();
    streamDeck.actions.registerAction(instance);

    this.constructors.add(ActionType);
    this.instances.push(instance);
    return instance;
  }

  registerAll(actionTypes: readonly ActionConstructor[]): void {
    for (const ActionType of actionTypes) {
      this.register(ActionType);
    }
  }

  /**
   * Gibt alle Action-Ressourcen in umgekehrter Registrierungsreihenfolge frei.
   * Das SDK benoetigt diesen Hook aktuell nicht beim normalen Prozessende; die
   * Registry ist damit aber fuer Tests und einen spaeteren kontrollierten
   * Shutdown vorbereitet.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    for (const instance of [...this.instances].reverse()) {
      try {
        instance.dispose();
      } catch (error) {
        streamDeck.logger.error(
          `[ActionRegistry] Fehler beim Freigeben von ${instance.constructor.name}.`,
          error
        );
      }
    }

    this.instances.length = 0;
    this.constructors.clear();
  }
}
