export interface ServerConfig {
  attended: boolean;
  headlessOverride?: boolean;
}

export function parseArgs(argv: string[]): ServerConfig {
  return {
    attended: argv.includes("--attended"),
  };
}
