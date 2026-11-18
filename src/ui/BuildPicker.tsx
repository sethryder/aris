import { useState } from 'preact/hooks';
import { ApiError, getCharacters, type CharacterSummary } from '../api.ts';
import { PobError } from '../core/pob.ts';
import { LoadError, parseInput, type Loaded, type Source } from './load.ts';

export interface Side { input: string; src?: Source; loading?: boolean; error?: string; loaded?: Loaded; chars?: CharacterSummary[] }

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'private_or_missing':
        return 'That profile is private or does not exist. Its owner can make the Characters tab public under Privacy Settings on pathofexile.com, or you can paste a Path of Building code instead.';
      case 'rate_limited':
        return `Path of Exile's servers are rate limiting us. Try again in ${Math.ceil((e.retryAfter ?? 60) / 60)} min, or paste a Path of Building code.`;
      case 'too_many_requests':
        return `Too many lookups from your connection. Try again in ${e.retryAfter ?? 60} s, or paste a Path of Building code.`;
      case 'unreachable':
        return 'The lookup service is unreachable. Pasted Path of Building codes still work.';
      case 'unsupported_link':
        return 'That build link is not supported. Use pobb.in, poe.ninja, maxroll, pastebin, pob.codes, rentry or poedb, or paste the code itself.';
      case 'not_found':
        return 'That build link was not found.';
      case 'bad_account':
        return 'Account names look like Name#1234.';
    }
    return `Lookup failed (${e.code}).`;
  }
  if (e instanceof PobError) return "That doesn't look like a Path of Building code, build link, or account name (Name#1234).";
  if (e instanceof LoadError) return e.message;
  console.error(e);
  return 'Something went wrong reading that build.';
}

interface Props {
  id: string;
  label: string;
  side: Side;
  onChange: (patch: Partial<Side>) => void;
  onLoad: (src: Source) => void;
}

export function BuildPicker({ id, label, side, onChange, onLoad }: Props) {
  const [listing, setListing] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!side.input.trim()) return;
    const src = parseInput(side.input);
    if (src.kind !== 'acct' || src.name) return onLoad(src);
    setListing(true);
    onChange({ error: undefined, chars: undefined, src });
    try {
      const chars = await getCharacters(src.account);
      chars.sort((x, y) => (y.lastLoginTime ?? 0) - (x.lastLoginTime ?? 0));
      onChange({ chars });
    } catch (err) {
      onChange({ error: errorText(err) });
    } finally {
      setListing(false);
    }
  };

  const acct = side.src?.kind === 'acct' ? side.src : null;
  return (
    <form class="picker" onSubmit={submit}>
      <label for={`${id}-in`}>{label}</label>
      <div class="row">
        <input id={`${id}-in`} value={side.input} placeholder="Name#1234, build link, or Path of Building code" spellcheck={false} autocomplete="off"
          onInput={(e) => onChange({ input: (e.target as HTMLInputElement).value })} />
        <button type="submit" disabled={listing || side.loading}>Load</button>
      </div>
      {side.chars && acct && (
        <select aria-label={`${label}: character`} value={acct.name ?? ''}
          onChange={(e) => onLoad({ ...acct, name: (e.target as HTMLSelectElement).value })}>
          <option value="" disabled>Choose a character ({side.chars.length})</option>
          {side.chars.map((c) => <option value={c.name}>{c.name}: level {c.level} {c.class}, {c.league}</option>)}
        </select>
      )}
      <div class="status" role="status">
        {(listing || side.loading) && 'Loading…'}
        {side.error && <span class="error">{side.error}</span>}
        {!side.loading && side.loaded && <span>{side.loaded.build.label}: level {side.loaded.build.level} {side.loaded.build.ascendancy ?? side.loaded.build.className}</span>}
        {!side.loading && side.loaded?.warning && <span class="warn">{side.loaded.warning}</span>}
      </div>
    </form>
  );
}
