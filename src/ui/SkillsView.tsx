import { matches } from '../core/diff.ts';
import type { BuildDiff, Gem } from '../core/types.ts';

const gem = (g: Gem) => `${g.name}${g.support ? ' (support)' : ''}, level ${g.level}${g.quality ? `, ${g.quality}% quality` : ''}`;

export function SkillsView({ gems, filter }: { gems: BuildDiff['gems']; filter: string }) {
  const f = (g: Gem) => matches(filter, g.name);
  const skills = gems.bySkill.filter((s) => [s.skill, ...s.supportsOnlyA, ...s.supportsOnlyB, ...s.supportsBoth].some((t) => matches(filter, t)))
    .filter((s) => s.supportsOnlyA.length || s.supportsOnlyB.length || !s.inA || !s.inB);
  const changed = gems.changed.filter((c) => f(c.a));
  return (
    <div class="skills">
      <section class="b"><h3><span class="sw b" /> They have, you don't</h3><List items={gems.onlyB.filter(f).map(gem)} /></section>
      <section class="a"><h3><span class="sw a" /> You have, they don't</h3><List items={gems.onlyA.filter(f).map(gem)} /></section>
      <section class="changed"><h3><span class="sw changed" /> Different level or quality</h3>
        <List items={changed.map((c) => `${c.a.name}: you ${c.a.level}/${c.a.quality}%, them ${c.b.level}/${c.b.quality}%`)} />
      </section>
      <section>
        <h3>Supports per active skill</h3>
        {skills.length === 0 ? <p class="empty">No differences.</p> : (
          <table>
            <thead><tr><th scope="col">Skill</th><th scope="col" class="b">Only they link</th><th scope="col" class="a">Only you link</th><th scope="col">Both</th></tr></thead>
            <tbody>
              {skills.map((s) => (
                <tr>
                  <td>{s.skill}{!s.inA ? ' (you don\'t use it)' : !s.inB ? ' (they don\'t use it)' : ''}</td>
                  <td class="b">{s.supportsOnlyB.join(', ')}</td>
                  <td class="a">{s.supportsOnlyA.join(', ')}</td>
                  <td>{s.supportsBoth.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const List = ({ items }: { items: string[] }) => items.length ? <ul>{items.map((t) => <li>{t}</li>)}</ul> : <p class="empty">Nothing.</p>;
