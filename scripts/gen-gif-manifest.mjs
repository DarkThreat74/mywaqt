// Regenerate src/lib/workout/exercise-gifs.ts from public/exercises/*.gif
import { readdirSync, writeFileSync } from 'fs';
const gifs = readdirSync('public/exercises').filter(f => f.endsWith('.gif')).map(f => f.slice(0, -4)).sort();
writeFileSync('src/lib/workout/exercise-gifs.ts',
  '// Auto-generated — slugs with a self-hosted technique GIF at /exercises/<slug>.gif\n' +
  'export const EXERCISE_GIFS = new Set([\n' + gifs.map(g => `  "${g}"`).join(',\n') + '\n]);\n');
console.log(`wrote ${gifs.length} gif slugs`);
