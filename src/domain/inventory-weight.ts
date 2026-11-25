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
  encumbranceStatus: "UNKNOWN" | "ABSTRACT" | "UNENCUMBERED" | "ENCUMBERED" | "HEAVILY_ENCUMBERED" | "OVER_CAPACITY";
}
export function calculatePlayerInventoryWeight(character: PlayerCharacterState, mode: "UNSET" | "STANDARD" | "VARIANT" | "ABSTRACT" = "UNSET"): PlayerInventoryWeight {
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
  const carryingCapacityLb = (mode === "STANDARD" || mode === "VARIANT") && typeof strength === "number" ? strength * 15 : null;
  const complete = typeof strength === "number" && currencyWeightLb !== null && unknownCarriedItems.length === 0;
  let encumbranceStatus: PlayerInventoryWeight["encumbranceStatus"] = "UNKNOWN";
  if (mode === "ABSTRACT") encumbranceStatus = "ABSTRACT";
  else if (complete && carryingCapacityLb !== null) {
    if (totalKnownLoadLb > carryingCapacityLb) encumbranceStatus = "OVER_CAPACITY";
    else if (mode === "VARIANT" && totalKnownLoadLb > strength! * 10) encumbranceStatus = "HEAVILY_ENCUMBERED";
    else if (mode === "VARIANT" && totalKnownLoadLb > strength! * 5) encumbranceStatus = "ENCUMBERED";
    else encumbranceStatus = "UNENCUMBERED";
  }
  const overCapacity = encumbranceStatus === "UNKNOWN" || encumbranceStatus === "ABSTRACT" ? null : encumbranceStatus === "OVER_CAPACITY";
  return { knownCarriedWeightLb, unknownCarriedItems, storedWeightLb, droppedWeightLb,
    currencyWeightLb, totalKnownLoadLb, carryingCapacityLb, overCapacity, encumbranceStatus };
}
