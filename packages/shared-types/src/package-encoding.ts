import type { ReconstructionPackage } from './index';

/** Lossless wire encoding: repeated computed style maps are stored once. */
export function stringifyPackage(pkg: ReconstructionPackage): string {
  const styleTable: unknown[] = [];
  const ids = new Map<string, number>();
  const screens = JSON.stringify(pkg.screens, (key, value: unknown) => {
    if (key !== 'styles' || !value || typeof value !== 'object' || Array.isArray(value))
      return value;
    const signature = JSON.stringify(value);
    let id = ids.get(signature);
    if (id === undefined) {
      id = styleTable.length;
      ids.set(signature, id);
      styleTable.push(value);
    }
    return id;
  });
  const fields = Object.entries(pkg)
    .filter(([key]) => key !== 'screens')
    .map(([key, value]) => JSON.stringify(key) + ':' + JSON.stringify(value));
  return (
    '{' +
    fields.join(',') +
    ',"encoding":"styles-v1","styleTable":' +
    JSON.stringify(styleTable) +
    ',"screens":' +
    screens +
    '}'
  );
}
