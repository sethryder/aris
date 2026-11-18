// Canonical slot names are PoB's. Abyssal sockets follow as "<slot> Abyssal Socket N".
export const slotOrder = [
  'Weapon 1', 'Weapon 2', 'Helmet', 'Body Armour', 'Gloves', 'Boots', 'Amulet', 'Ring 1', 'Ring 2', 'Ring 3', 'Belt',
  'Flask 1', 'Flask 2', 'Flask 3', 'Flask 4', 'Flask 5', 'Graft 1', 'Graft 2',
];

const API_SLOTS: Record<string, string> = {
  Weapon: 'Weapon 1', Offhand: 'Weapon 2', Helm: 'Helmet', BodyArmour: 'Body Armour', Gloves: 'Gloves', Boots: 'Boots',
  Amulet: 'Amulet', Ring: 'Ring 1', Ring2: 'Ring 2', Ring3: 'Ring 3', Belt: 'Belt',
};

/** GGG API inventoryId (+ x for flasks) → PoB slot name. Unknown ids pass through unchanged. */
export const apiSlot = (inventoryId: string, x = 0): string =>
  inventoryId === 'Flask' ? `Flask ${x + 1}` : API_SLOTS[inventoryId] ?? inventoryId;
