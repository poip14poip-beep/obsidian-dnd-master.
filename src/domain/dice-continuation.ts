export interface PendingDiceRoll {
  label: string;
  formula: string;
}
export function buildDiceContinuationAction(
  playerAction: string,
  pendingRolls: PendingDiceRoll[],
  answers: Record<number, string>,
): string {
  if (!playerAction.trim() || pendingRolls.length === 0) throw new Error("Нет действия игрока или ожидающих бросков.");
  const results = pendingRolls.map((roll, index) => {
    const answer = answers[index]?.trim();
    if (!answer) throw new Error(`Не введён результат броска «${roll.label}».`);
    return `${roll.label} (${roll.formula}): ${answer}`;
  });
  return [
    playerAction.trim(),
    "",
    "Результаты бросков, которые игрок выполнил самостоятельно:",
    ...results,
    "Используй результаты точно как предоставлены. Не перебрасывай и не заменяй их.",
  ].join(String.fromCharCode(10));
}
