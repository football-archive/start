import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csvSimple";

export type ClubDecadePlayerRow = {
  club_key: string;
  decade: string;
  player1: string;
  player2: string;
  player3: string;
  player4: string;
  player5: string;
};

let cache: ClubDecadePlayerRow[] | null = null;

export function loadClubDecadePlayers(): ClubDecadePlayerRow[] {
  if (cache !== null) return cache;

  const filePath = path.join(
    process.cwd(),
    "src",
    "data",
    "club_decade_players.csv",
  );

  if (!fs.existsSync(filePath)) {
    cache = [];
    return cache;
  }

  cache = parseCsv(fs.readFileSync(filePath, "utf-8")) as ClubDecadePlayerRow[];

  return cache;
}
