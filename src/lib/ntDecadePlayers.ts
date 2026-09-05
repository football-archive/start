import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csvSimple";

export type NtDecadePlayerRow = {
  country: string;
  decade: string;
  player1: string;
  player2: string;
  player3: string;
  player4: string;
  player5: string;
  player6: string;
  player7: string;
};

let cache: NtDecadePlayerRow[] | null = null;

export function loadNtDecadePlayers(): NtDecadePlayerRow[] {
  if (cache !== null) return cache;

  const filePath = path.join(
    process.cwd(),
    "src",
    "data",
    "nt_decade_players.csv",
  );

  if (!fs.existsSync(filePath)) {
    cache = [];
    return cache;
  }

  cache = parseCsv(fs.readFileSync(filePath, "utf-8")) as NtDecadePlayerRow[];

  return cache;
}
