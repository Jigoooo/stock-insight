function readProfileMotionValue(name: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) throw new Error(`Missing design-profile motion token: ${name}`);
  return value;
}

export function readProfileMotionNumber(name: string) {
  const value = Number.parseFloat(readProfileMotionValue(name));
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric motion token: ${name}`);
  return value;
}

export function readProfileMotionSeconds(name: string) {
  const source = readProfileMotionValue(name);
  const value = Number.parseFloat(source);
  if (!Number.isFinite(value)) throw new Error(`Invalid duration motion token: ${name}`);
  return source.endsWith('ms') ? value / 1000 : value;
}

export { readProfileMotionValue };
