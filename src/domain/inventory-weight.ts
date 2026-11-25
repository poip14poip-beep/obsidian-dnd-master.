import type { PlayerCharacterState } from "./types";
export interface PlayerInventoryWeight {
  knownCarriedWeightLb: number;
  unknownCarriedItems: string[];
  storedWeightLb: number;
  droppedWeightLb: number;
  currencyWeightLb: number | null;
  totalKnownLoadLb: number;
  carryingCapacityLb: number | null;
  overCapacity: boolean | null;
}
export function calculatePlayerInventoryWeight(character: PlayerCharacterState): PlayerInventoryWeight {
  let knownCarriedWeightLb = 0;
  let storedWeightLb = 0;
  let droppedWeightLb = 0;
  const unknownCarriedItems: string[] = [];
  for (const item of character.inventory) {
    const location = item.location ?? "CARRIED";
    const weight = item.unitWeightLb;
    if (weight === null || weight === undefined || !Number.isFinite(weight) || weight < 0) {
      if (location === "CARRIED" || location === "WORN") unknownCarriedItems.push(item.name);
      continue;
    }
    const total = weight * item.quantity;
    if (location === "CARRIED" || location === "WORN") knownCarriedWeightLb += total;
    else if (location === "STORED") storedWeightLb += total;
    else if (location === "DROPPED") droppedWeightLb += total;
  }
  const currency = character.currency;
  const currencyWeightLb = currency
    ? Object.values(currency).reduce((sum, amount) => sum + amount, 0) / 50
    : null;
  const totalKnownLoadLb = knownCarriedWeightLb + (currencyWeightLb ?? 0);
  const strength = character.abilityScores?.strength;
  const carryingCapacityLb = typeof strength === "number" ? strength * 15 : null;
  const overCapacity = carryingCapacityLb === null || unknownCarriedItems.length > 0
    ? null : totalKnownLoadLb > carryingCapacityLb;
  return { knownCarriedWeightLb, unknownCarriedItems, storedWeightLb, droppedWeightLb,
    currencyWeightLb, totalKnownLoadLb, carryingCapacityLb, overCapacity };
}
