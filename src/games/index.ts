import type { Game, GameId } from '../core/types.ts';
import { poe1 } from './poe1/index.ts';

export const games: Partial<Record<GameId, Game>> = { poe1 };
