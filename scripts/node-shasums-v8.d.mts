export function sha256File(file: string): string;
export function expectedNodeHash(shasums: string, version: string, entry: string): string;
export function checkNodeExe(options: { exe: string; version: string; arch: string; shasumsFile?: string; ci: boolean }): { entry: string; sha256: string; check: string };
