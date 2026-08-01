export type LiveDataEnvironmentLabel = {
  environment: '운영 DB';
  writeMode: '실제 쓰기';
};

export function getLiveDataEnvironmentLabel(
  marker: string | undefined,
): LiveDataEnvironmentLabel | undefined {
  return marker === 'production-live'
    ? { environment: '운영 DB', writeMode: '실제 쓰기' }
    : undefined;
}
