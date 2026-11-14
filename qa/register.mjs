/**
 * QA-only module resolver.
 *
 * Lets plain Node import the app's TypeScript modules by:
 *  - mapping the `@/` alias to `src/`
 *  - swapping AsyncStorage for an in-memory stub (it normally needs a native host)
 *  - swapping react-native for a tiny stub, because some shared modules import it
 *
 * Nothing here is bundled into the app.
 */
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const qaDir = import.meta.dirname;
const projectRoot = path.resolve(qaDir, '..');
const srcRoot = path.join(projectRoot, 'src');

const asyncStorageStub = pathToFileURL(path.join(qaDir, 'stubs', 'async-storage.mjs')).href;
const reactNativeStub = pathToFileURL(path.join(qaDir, 'stubs', 'react-native.mjs')).href;

function resolveFile(basePath) {
  const candidates = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx'];
  for (const suffix of candidates) {
    const candidate = `${basePath}${suffix}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const resolved = resolveFile(path.join(srcRoot, specifier.slice(2)));
      if (resolved) return { url: resolved, shortCircuit: true };
    }
    if (specifier === '@react-native-async-storage/async-storage') {
      return { url: asyncStorageStub, shortCircuit: true };
    }
    if (specifier === 'react-native') {
      return { url: reactNativeStub, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    // The app imports its seed catalogue as JSON without import attributes;
    // Node needs it turned into an ES module explicitly.
    if (url.endsWith('.json')) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      return {
        format: 'module',
        source: `export default ${source};`,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
