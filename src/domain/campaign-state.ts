export function isCampaignActive(setupConfirmed: boolean, lastTurnNumber: number): boolean {
  return setupConfirmed || lastTurnNumber > 0;
}
