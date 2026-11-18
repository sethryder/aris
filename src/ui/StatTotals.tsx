import { matches } from '../core/diff.ts';
import type { StatDelta } from '../core/types.ts';

const num = (v: number) => String(Math.round(v * 100) / 100);

export function StatTotals({ stats, filter }: { stats: StatDelta[]; filter: string }) {
  const rows = stats.filter((s) => matches(filter, s.template));
  return (
    <section class="stattotals">
      <h3>Tree stat totals</h3>
      <p class="note">Every stat line summed over each side's allocated passives, masteries and tattoos. Cluster jewel passives are not included. For real numbers (block chance, DPS), use Path of Building's Compare tab.</p>
      {rows.length === 0 ? <p class="empty">No differences{filter.trim() ? ' match the filter' : ''}.</p> : (
        <table>
          <thead><tr><th scope="col">Stat</th><th scope="col" class="a">You</th><th scope="col" class="b">Them</th><th scope="col">Them − you</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr>
                <td>{s.template}</td>
                <td class="a">{s.a.map(num).join(' / ')}</td>
                <td class="b">{s.b.map(num).join(' / ')}</td>
                <td>{s.b.map((v, i) => { const d = v - (s.a[i] ?? 0); return d > 0 ? `+${num(d)}` : num(d); }).join(' / ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
