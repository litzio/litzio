export function artifactDigest(directory: string, include?: (file: string) => boolean): string;
export function artifactDigestAsync(directory: string, include?: (file: string) => boolean): Promise<string>;
