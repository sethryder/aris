import type { Game } from '../../core/types.ts';
import { fromAccount } from './fromApi.ts';
import { fromPob } from './fromPob.ts';
import { slotOrder } from './slots.ts';

const latestTreeVersion = '3_30';

export const poe1: Game = {
  id: 'poe1',
  latestTreeVersion,
  treeVersions: ['3_30', '3_29', '3_28'], // keep in step with POE1_TAGS in scripts/build-tree.ts
  slotOrder,
  fromPob,
  fromAccount: (raw, tree) => fromAccount(raw, tree, latestTreeVersion),
};
