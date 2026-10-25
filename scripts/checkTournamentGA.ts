import { loadCallups } from "../src/lib/callups";
import { checkTournamentGAMatching } from "../src/lib/tournamentPlayerStats";
import { getGoalRanking, getAssistRanking } from "../src/lib/matchEvents";

const competition = "AFC";
const edition = "2004";

const rows = loadCallups().filter(
  (r) =>
    r.competition.trim().toUpperCase() === competition &&
    r.edition.trim() === edition,
);

const teams = new Set(rows.map((r) => r.country.trim()).filter(Boolean));

let issueCount = 0;

for (const team of [...teams].sort((a, b) => a.localeCompare(b, "ja"))) {
  const teamRows = rows.filter((r) => r.country.trim() === team);

  const issues = checkTournamentGAMatching(
    teamRows,
    competition,
    edition,
    team,
  );

  for (const issue of issues) {
    issueCount++;

    console.log(
      [issue.team, issue.player, issue.stat, issue.count, issue.reason].join(
        "\t",
      ),
    );
  }
}

console.log(
  `\n${competition}${edition} GA照合チェック：${issueCount}件の問題を検出`,
);

if (issueCount > 0) {
  process.exitCode = 1;
}
