# Character and inventory engine foundation

This domain module introduces a versioned character sheet separate from world state.

- Supports generated characters and player-provided dossiers as distinct origin modes.
- Requires explicit Ekdrasil canon review before activation; no character biography is silently written into world canon.
- Keeps D&D 2024 / SRD 5.2.1 explicit in the sheet.
- Tracks ability scores, class progression, feats, proficiencies, class resources, spell data, conditions, concentration, exhaustion, death saves, hit dice, and location.
- Tracks inventory quantity, unit weight, carried/worn/stored/dropped status, equipment, attunement, charges, condition, provenance, and source rule.
- Calculates carrying capacity and push/drag/lift limit from Strength and size; coin weight is included at 50 coins per pound.
- Unknown weights are surfaced rather than silently treated as zero.

This is a domain foundation, not yet wired into the UI, cloud serializer, random character-generation wizard, or turn-resolution pipeline. The existing legacy character shape remains unchanged until a migration and UI adapter are implemented and tested.
