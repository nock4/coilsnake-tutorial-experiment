import { describe, expect, it } from "vitest";
import type { ItemData } from "@eb/schemas";
import { PartyState } from "../src/partyState";

describe("PartyState", () => {
  it("tracks wallet deltas without going below zero", () => {
    const state = new PartyState();

    state.money(30);
    state.applyMoney("take", 12);
    state.money(-99);

    expect(state.wallet).toBe(0);
    expect(state.counts()).toMatchObject({ wallet: 0 });
  });

  it("keeps inventory arrays by character id", () => {
    const state = new PartyState();

    state.give(1, 10);
    state.give(1, 11);
    state.give(2, 12);

    expect(state.inventory(1)).toEqual([10, 11]);
    expect(state.inventory(2)).toEqual([12]);
    expect(state.counts()).toMatchObject({ inventoryChars: 2, inventoryItems: 3 });

    expect(state.take(1, 10)).toBe(true);
    expect(state.take(1, 99)).toBe(false);

    expect(state.inventory(1)).toEqual([11]);
    expect(state.counts()).toMatchObject({ inventoryChars: 2, inventoryItems: 2 });
  });

  it("adds and removes party ids as a set", () => {
    const state = new PartyState();

    state.partyOp("add", 3);
    state.partyOp("add", 1);
    state.partyOp("add", 3);
    state.partyOp("remove", 3);

    expect(state.party()).toEqual([1]);
    expect(state.counts()).toMatchObject({ partyCount: 1 });
  });

  it("uses a consumable item to roll HP upward and remove inventory", () => {
    const state = new PartyState();
    const item = itemData(10, { action: 0x1e02, argument: 30, consumable: true });
    state.give(1, item.id);

    const result = state.useItem({
      ownerChar: 1,
      targetChar: 1,
      item,
      targetVitals: { hp: 20, maxHp: 40, pp: 3, maxPp: 12, hpRatePerSec: 100 }
    });

    expect(result).toMatchObject({ ok: true, previousValue: 20, nextValue: 40 });
    expect(state.inventory(1)).toEqual([]);
    expect(state.vitals(1)?.hp).toMatchObject({ displayed: 20, target: 40, isRolling: true });

    state.tickMeters(1000);
    expect(state.vitals(1)?.hp).toMatchObject({ displayed: 40, target: 40, isRolling: false });
  });

  it("uses a consumable item to recover PP and remove inventory", () => {
    const state = new PartyState();
    const item = itemData(11, { action: 0x1e06, argument: 5, consumable: true });
    state.give(1, item.id);

    const result = state.useItem({
      ownerChar: 1,
      targetChar: 1,
      item,
      targetVitals: { hp: 20, maxHp: 40, pp: 3, maxPp: 7 }
    });

    expect(result).toMatchObject({ ok: true, previousValue: 3, nextValue: 7 });
    expect(state.inventory(1)).toEqual([]);
    expect(state.vitals(1)?.pp).toBe(7);
  });

  it("rejects non-consumable and unknown consumable item effects without removing inventory", () => {
    const state = new PartyState();
    const nonConsumable = itemData(12, { action: 0x1e02, argument: 10, consumable: false });
    const unknown = itemData(13, { action: 999, argument: 10, consumable: true });
    state.give(1, nonConsumable.id);
    state.give(1, unknown.id);

    expect(state.useItem({
      ownerChar: 1,
      targetChar: 1,
      item: nonConsumable,
      targetVitals: { hp: 10, maxHp: 40, pp: 0, maxPp: 0 }
    })).toMatchObject({ ok: false, reason: "notConsumable" });
    expect(state.useItem({
      ownerChar: 1,
      targetChar: 1,
      item: unknown,
      targetVitals: { hp: 10, maxHp: 40, pp: 0, maxPp: 0 }
    })).toMatchObject({ ok: false, reason: "unknownEffect" });
    expect(state.inventory(1)).toEqual([12, 13]);
  });

  it("sets, replaces, and toggles equipment slots by item type", () => {
    const state = new PartyState();
    const firstWeapon = itemData(20, { type: 0x10 });
    const secondWeapon = itemData(21, { type: 0x10 });
    const body = itemData(22, { type: 0x14 });

    expect(state.equip(1, firstWeapon)).toMatchObject({ ok: true, slot: "weapon", equipped: true });
    expect(state.equipped(1)).toEqual({ weapon: 20 });

    expect(state.equip(1, secondWeapon)).toMatchObject({
      ok: true,
      slot: "weapon",
      equipped: true,
      previousItemId: 20
    });
    expect(state.equip(1, body)).toMatchObject({ ok: true, slot: "body", equipped: true });
    expect(state.equipped(1)).toEqual({ weapon: 21, body: 22 });

    expect(state.equip(1, secondWeapon)).toMatchObject({ ok: true, slot: "weapon", equipped: false });
    expect(state.equipped(1)).toEqual({ body: 22 });
  });

  it("rejects non-equipment types for equip", () => {
    const state = new PartyState();

    expect(state.equip(1, itemData(30, { type: 0x20 }))).toMatchObject({
      ok: false,
      reason: "notEquippable"
    });
  });
});

function itemData(id: number, options: {
  type?: number;
  action?: number;
  argument?: number;
  consumable?: boolean;
} = {}): ItemData {
  return {
    id,
    name: `[item ${id}]`,
    type: options.type ?? 0x30,
    cost: 0,
    action: options.action ?? 0,
    argument: options.argument ?? 0,
    equippable: (options.type ?? 0x30) >= 0x10 && (options.type ?? 0x30) <= 0x1f,
    miscFlags: options.consumable ? ["item disappears when used"] : []
  };
}
