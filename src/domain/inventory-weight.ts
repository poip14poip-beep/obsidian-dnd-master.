import type { PlayerCharacterState } from "./types";
export interface PlayerInventoryWeight {
  knownCarriedWeightLb: number;
  unknownCarriedItems: string[];
  unknownLocationItems: string[];
  storedWeightLb: number;
  droppedWeightLb: number;
  currencyWeightLb: number | null;
  totalKnownLoadLb: number;
  carryingCapacityLb: number | null;
  encumberedAtLb: number | null;
  heavilyEncumberedAtLb: number | null;
  overCapacity: boolean | null;
  encumbranceStatus: "UNKNOWN" | "ABSTRACT" | "UNENCUMBERED" | "ENCUMBERED" | "HEAVILY_ENCUMBERED" | "OVER_CAPACITY";
}
const SIZE_MULTIPLIER: Record<Exclude<NonNullable<PlayerCharacterState["size"]>, "UNKNOWN">, number> = {
  TINY: 0.5, SMALL: 1, MEDIUM: 1, LARGE: 2, HUGE: 4, GARGANTUAN: 8,
};
export function calculatePlayerInventoryWeight(character: PlayerCharacterState, mode: "UNSET" | "STANDARD" | "VARIANT" | "ABSTRACT" = "UNSET"): PlayerInventoryWeight {
  let knownCarriedWeightLb = 0, storedWeightLb = 0, droppedWeightLb = 0;
  const unknownCarriedItems: string[] = [], unknownLocationItems: string[] = [];
  for (const item of character.inventory) {
    const location = item.location ?? "UNKNOWN";
    if (location === "UNKNOWN" || location === "OTHER") { unknownLocationItems.push(item.name); continue; }
    const weight = item.unitWeightLb;
    if (weight === null || weight === undefined || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(item.quantity) || item.quantity < 0) {
      if (location === "CARRIED" || location === "WORN") unknownCarriedItems.push(item.name);
      continue;
    }
    const total = weight * item.quantity;
    if (location === "CARRIED" || location === "WORN") knownCarriedWeightLb += total;
    else if (location === "STORED") storedWeightLb += total;
    else if (location === "DROPPED") droppedWeightLb += total;
  }
  const currency = character.currency;
  const currencyValid = !!currency && Object.values(currency).every(amount => Number.isInteger(amount) && amount >= 0);
  const currencyWeightLb = currencyValid ? Object.values(currency!).reduce((sum, amount) => sum + amount, 0) / 50 : null;
  const totalKnownLoadLb = knownCarriedWeightLb + (currencyWeightLb ?? 0);
  const strength = character.abilityScores?.strength;
  const size = character.size;
  const multiplier = size && size !== "UNKNOWN" ? SIZE_MULTIPLIER[size] : null;
  const carryingCapacityLb = (mode === "STANDARD" || mode === "VARIANT") && typeof strength === "number" && multiplier !== null ? strength * 15 * multiplier : null;
  const encumberedAtLb = mode === "VARIANT" && typeof strength === "number" && multiplier !== null ? strength * 5 * multiplier : null;
  const heavilyEncumberedAtLb = mode === "VARIANT" && typeof strength === "number" && multiplier !== null ? strength * 10 * multiplier : null;
  const complete = typeof strength === "number" && multiplier !== null && currencyWeightLb !== null && unknownCarriedItems.length === 0 && unknownLocationItems.length === 0;
  let encumbranceStatus: PlayerInventoryWeight["encumbranceStatus"] = "UNKNOWN";
  if (mode === "ABSTRACT") encumbranceStatus = "ABSTRACT";
  else if (complete && carryingCapacityLb !== null) {
    if (totalKnownLoadLb > carryingCapacityLb) encumbranceStatus = "OVER_CAPACITY";
    else if (mode === "VARIANT" && totalKnownLoadLb > heavilyEncumberedAtLb!) encumbranceStatus = "HEAVILY_ENCUMBERED";
    else if (mode === "VARIANT" && totalKnownLoadLb > encumberedAtLb!) encumbranceStatus = "ENCUMBERED";
    else encumbranceStatus = "UNENCUMBERED";
  }
  const overCapacity = encumbranceStatus === "UNKNOWN" || encumbranceStatus === "ABSTRACT" ? null : encumbranceStatus === "OVER_CAPACITY";
  return { knownCarriedWeightLb, unknownCarriedItems, unknownLocationItems, storedWeightLb, droppedWeightLb, currencyWeightLb,
    totalKnownLoadLb, carryingCapacityLb, encumberedAtLb, heavilyEncumberedAtLb, overCapacity, encumbranceStatus };
}
