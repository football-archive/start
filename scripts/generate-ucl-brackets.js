import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCHEDULE_PATH = path.resolve(
  ROOT,
  "src/data/competition_schedule_and_results.csv",
);

const OUTPUT_DIR = path.resolve(ROOT, "public/images/brackets");

const TARGETS = [
  { competition: "UCL", edition: "2024-25" },
  { competition: "UCL", edition: "2025-26" },
];

const COLORS = {
  background: "#ffffff",
  theme: "#0a1f44",
  line: "#222222",
  separator: "#e6e1e3",
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cur = "";
    } else {
      cur += ch;
    }
  }
  row.push(cur.replace(/\r$/, ""));
  rows.push(row);

  const cleaned = rows.filter((r) =>
    r.some((v) => String(v ?? "").trim() !== ""),
  );
  if (!cleaned.length) return [];
  const header = cleaned[0].map((v) => String(v ?? "").trim());
  return cleaned.slice(1).map((values) => {
    const out = {};
    header.forEach((key, i) => {
      out[key] = String(values[i] ?? "").trim();
    });
    return out;
  });
}

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const normStage = (stage) => {
  const s = String(stage ?? "")
    .toLowerCase()
    .replaceAll("_", "-")
    .replaceAll(" ", "-");
  if (["round32", "round-32", "round-of-32"].includes(s)) return "R32";
  if (["round16", "round-16", "round-of-16"].includes(s)) return "R16";
  if (
    [
      "quarter-finals",
      "quarter-final",
      "quarterfinal",
      "quarterfinals",
    ].includes(s)
  )
    return "QF";
  if (["semi-finals", "semi-final", "semifinal", "semifinals"].includes(s))
    return "SF";
  if (s === "final") return "F";

  if (
    [
      "third-place",
      "third-place-match",
      "thirdplace",
      "3rd-place",
      "3rd-place-match",
    ].includes(s)
  ) {
    return "TP";
  }

  return "";
};

const STAGE_ORDER = ["R32", "R16", "QF", "SF", "F"];
const STAGE_LABEL = {
  R32: "ラウンド32",
  R16: "ラウンド16",
  QF: "準々決勝",
  SF: "準決勝",
  F: "決勝",
};

function winner(match) {
  // 2戦制を集約したtieなら、事前計算した勝者を使う
  if (match._winner) return match._winner;

  const hs = Number(match.home_score);
  const as = Number(match.away_score);

  if (hs > as) return match.home;
  if (as > hs) return match.away;

  const hp = Number(match.home_score_pk);
  const ap = Number(match.away_score_pk);

  if (Number.isFinite(hp) && Number.isFinite(ap) && hp !== ap) {
    return hp > ap ? match.home : match.away;
  }

  throw new Error(
    `勝者を判定できません: ${match["match-id"]} ${match.home} vs ${match.away}`,
  );
}

function winnerKey(match) {
  // 2戦制を集約したtieなら、事前計算したclub_keyを使う
  if (match._winnerKey) return match._winnerKey;

  const winnerName = winner(match);

  if (winnerName === match.home) {
    return String(match.home_key ?? "").trim();
  }

  if (winnerName === match.away) {
    return String(match.away_key ?? "").trim();
  }

  return "";
}

function scoreFor(match, side) {
  // 2戦制の集約カード
  if (side === "home" && match._homeScoreText) {
    return match._homeScoreText;
  }

  if (side === "away" && match._awayScoreText) {
    return match._awayScoreText;
  }

  // 決勝など1試合制
  const score = side === "home" ? match.home_score : match.away_score;

  const pk = side === "home" ? match.home_score_pk : match.away_score_pk;

  return pk ? `${score} PK${pk}` : score;
}

function buildTwoLegTies(matches) {
  const byStageAndPair = new Map();

  for (const m of matches) {
    const stage = normStage(m.stage);

    // UCLブラケットはR16/QF/SFのみ2戦制
    if (!["R16", "QF", "SF"].includes(stage)) continue;

    const homeKey = String(m.home_key ?? "").trim();
    const awayKey = String(m.away_key ?? "").trim();

    if (!homeKey || !awayKey) {
      throw new Error(`club_key不足: ${m["match-id"]} ${m.home} vs ${m.away}`);
    }

    // H/Aが逆転しても同じ対戦として扱う
    const pairKey = [homeKey, awayKey].sort().join("|||");
    const key = `${stage}|||${pairKey}`;

    if (!byStageAndPair.has(key)) {
      byStageAndPair.set(key, []);
    }

    byStageAndPair.get(key).push({
      ...m,
      _stage: stage,
    });
  }

  const ties = [];

  for (const [key, legs] of byStageAndPair.entries()) {
    if (legs.length !== 2) {
      throw new Error(`2試合揃っていません: ${key} (${legs.length}試合)`);
    }

    // secの "1st leg" / "2nd leg" を使って明示的に判定する
    const leg1 = legs.find((m) =>
      String(m.sec ?? "")
        .toLowerCase()
        .includes("1st leg"),
    );

    const leg2 = legs.find((m) =>
      String(m.sec ?? "")
        .toLowerCase()
        .includes("2nd leg"),
    );

    if (!leg1 || !leg2) {
      throw new Error(`1st/2nd legを特定できません: ${key}`);
    }

    /*
      カード上の上下は1st leg基準に固定。
      例：
      1st: レバークーゼン 1-1 アーセナル
      2nd: アーセナル 2-0 レバークーゼン

      ↓

      レバークーゼン 1+0=1
      アーセナル     1+2=3
    */
    const teamA = leg1.home;
    const teamAKey = leg1.home_key;
    const teamB = leg1.away;
    const teamBKey = leg1.away_key;

    const getScore = (leg, teamKey) => {
      if (leg.home_key === teamKey) {
        return Number(leg.home_score);
      }

      if (leg.away_key === teamKey) {
        return Number(leg.away_score);
      }

      throw new Error(`対戦チーム不整合: ${leg["match-id"]} / ${teamKey}`);
    };

    const a1 = getScore(leg1, teamAKey);
    const a2 = getScore(leg2, teamAKey);
    const b1 = getScore(leg1, teamBKey);
    const b2 = getScore(leg2, teamBKey);

    const aggA = a1 + a2;
    const aggB = b1 + b2;

    let winnerName = "";
    let winnerTeamKey = "";

    if (aggA > aggB) {
      winnerName = teamA;
      winnerTeamKey = teamAKey;
    } else if (aggB > aggA) {
      winnerName = teamB;
      winnerTeamKey = teamBKey;
    } else {
      /*
        合計同点の場合、PKは通常2nd leg側に入る想定。
        PKスコアは2nd legのhome/away基準なのでteam_keyで対応させる。
      */
      const homePk = String(leg2.home_score_pk ?? "").trim();
      const awayPk = String(leg2.away_score_pk ?? "").trim();

      if (homePk === "" || awayPk === "") {
        throw new Error(`合計同点ですがPKがありません: ${teamA} vs ${teamB}`);
      }

      const homePkNum = Number(homePk);
      const awayPkNum = Number(awayPk);

      winnerTeamKey = homePkNum > awayPkNum ? leg2.home_key : leg2.away_key;

      winnerName = winnerTeamKey === teamAKey ? teamA : teamB;
    }

    const pkTextFor = (teamKey) => {
      if (aggA !== aggB) return "";

      if (leg2.home_key === teamKey) {
        return ` PK${leg2.home_score_pk}`;
      }

      if (leg2.away_key === teamKey) {
        return ` PK${leg2.away_score_pk}`;
      }

      return "";
    };

    ties.push({
      "match-id": `${leg1["match-id"]}+${leg2["match-id"]}`,

      competition: leg1.competition,
      edition: leg1.edition,

      _stage: leg1._stage,

      home: teamA,
      home_key: teamAKey,

      away: teamB,
      away_key: teamBKey,

      _homeScoreText: `(1st) ${a1} ＋ (2nd) ${a2} ＝ ${aggA}${pkTextFor(teamAKey)}`,

      _awayScoreText: `(1st) ${b1} ＋ (2nd) ${b2} ＝ ${aggB}${pkTextFor(teamBKey)}`,

      _winner: winnerName,
      _winnerKey: winnerTeamKey,

      // 通常scoreはwinner()のfallback用として一応保持
      home_score: String(aggA),
      away_score: String(aggB),

      _legs: [leg1, leg2],
    });
  }

  return ties;
}

function buildTree(finalMatch, matchesByStage, stageIndex) {
  const node = { match: finalMatch, children: [] };
  if (stageIndex <= 0) return node;

  const previousStage = STAGE_ORDER[stageIndex - 1];
  const candidates = matchesByStage.get(previousStage) ?? [];

  for (const team of [finalMatch.home, finalMatch.away]) {
    const previous = candidates.find((m) => winner(m) === team);
    if (!previous) {
      throw new Error(
        `${previousStage}で「${team}」が勝者の試合を特定できません。`,
      );
    }
    node.children.push(buildTree(previous, matchesByStage, stageIndex - 1));
  }
  return node;
}

function collectLevels(root, depth = 0, levels = []) {
  if (!levels[depth]) levels[depth] = [];
  levels[depth].push(root);
  for (const child of root.children) collectLevels(child, depth + 1, levels);
  return levels;
}

function flattenLeaves(node) {
  if (!node.children.length) return [node];
  return node.children.flatMap(flattenLeaves);
}

function renderBracket({ competition, edition, matches }) {
  const twoLegTies = buildTwoLegTies(matches);

  const finalMatches = matches
    .map((m) => ({
      ...m,
      _stage: normStage(m.stage),
    }))
    .filter((m) => m._stage === "F");

  if (finalMatches.length !== 1) {
    throw new Error(
      `${competition} ${edition}: 決勝が${finalMatches.length}試合あります。`,
    );
  }

  const knockout = [...twoLegTies, ...finalMatches];
  const thirdPlaceMatch = knockout.find((m) => m._stage === "TP") ?? null;

  const presentStages = STAGE_ORDER.filter((stage) =>
    knockout.some((m) => m._stage === stage),
  );
  if (!presentStages.includes("F"))
    throw new Error(`${competition} ${edition}: 決勝がありません。`);

  const firstStage = presentStages[0];
  const finalMatch = knockout.find((m) => m._stage === "F");
  const matchesByStage = new Map(
    presentStages.map((stage) => [
      stage,
      knockout.filter((m) => m._stage === stage),
    ]),
  );

  const finalStageIndex = STAGE_ORDER.indexOf("F");
  const firstStageIndex = STAGE_ORDER.indexOf(firstStage);

  // Missing earlier stages are skipped by building from the first stage available.
  const activeOrder = STAGE_ORDER.slice(firstStageIndex, finalStageIndex + 1);
  const localIndex = activeOrder.length - 1;

  function buildActiveTree(match, index) {
    const node = { match, children: [] };
    if (index <= 0) return node;
    const prevStage = activeOrder[index - 1];
    const candidates = matchesByStage.get(prevStage) ?? [];
    const teams = [
      {
        name: match.home,
        key: String(match.home_key ?? "").trim(),
      },
      {
        name: match.away,
        key: String(match.away_key ?? "").trim(),
      },
    ];

    for (const team of teams) {
      const prior = candidates.find((m) => winnerKey(m) === team.key);

      if (!prior) {
        throw new Error(
          `${competition} ${edition}: ${prevStage}で${team.name} (${team.key}) の勝ち上がり元が見つかりません。`,
        );
      }

      node.children.push(buildActiveTree(prior, index - 1));
    }
    return node;
  }

  const root = buildActiveTree(finalMatch, localIndex);
  const leaves = flattenLeaves(root);
  const leftLeaves = flattenLeaves(root.children[0]);
  const rightLeaves = flattenLeaves(root.children[1]);

  const cardW = 290;
  const cardH = 128;
  const colGap = 55;
  const sideCols = activeOrder.length - 1;
  const marginX = 40;
  const headerY = 118;
  const headerH = 54;
  const top = 205;

  const rowGap = firstStage === "R32" ? 54 : firstStage === "R16" ? 82 : 60;

  const leafCount = Math.max(leftLeaves.length, rightLeaves.length);
  const baseHeight = Math.max(
    920,
    top + leafCount * cardH + (leafCount - 1) * rowGap + 70,
  );
  const width =
    marginX * 2 + cardW * (sideCols * 2 + 1) + colGap * (sideCols * 2);
  const centerX = marginX + sideCols * (cardW + colGap);

  const leftXs = Array.from(
    { length: sideCols },
    (_, i) => marginX + i * (cardW + colGap),
  );
  const rightXs = Array.from(
    { length: sideCols },
    (_, i) => width - marginX - cardW - i * (cardW + colGap),
  );

  const leafCenters = Array.from(
    { length: leafCount },
    (_, i) => top + cardH / 2 + i * (cardH + rowGap),
  );

  const nodePositions = new Map();
  function assignSide(node, side, depth, leafCursor) {
    if (!node.children.length) {
      const y = leafCenters[leafCursor.value++];
      const x = side === "left" ? leftXs[0] : rightXs[0];
      nodePositions.set(node, { x, y });
      return y;
    }
    const ys = node.children.map((child) =>
      assignSide(child, side, depth - 1, leafCursor),
    );
    const y = (ys[0] + ys[1]) / 2;
    const stageFromLeaf = activeOrder.indexOf(node.match._stage);
    const xIndex = stageFromLeaf;
    const x = side === "left" ? leftXs[xIndex] : rightXs[xIndex];
    nodePositions.set(node, { x, y });
    return y;
  }

  assignSide(root.children[0], "left", sideCols - 1, { value: 0 });
  assignSide(root.children[1], "right", sideCols - 1, { value: 0 });
  const finalY =
    (nodePositions.get(root.children[0]).y +
      nodePositions.get(root.children[1]).y) /
    2;
  nodePositions.set(root, { x: centerX, y: finalY });
  const thirdPlaceY = finalY + cardH / 2 + 225;
  const height = thirdPlaceMatch
    ? Math.max(baseHeight, thirdPlaceY + cardH / 2 + 70)
    : baseHeight;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">`,
  );
  parts.push(
    `<title id="title">${esc(edition)} UEFAチャンピオンズリーグ 決勝トーナメント</title>`,
  );
  parts.push(
    `<desc id="desc">試合データから自動生成した決勝トーナメント表</desc>`,
  );
  parts.push(`<rect width="100%" height="100%" fill="${COLORS.background}"/>`);
  parts.push(`<style>
    .title{font:700 58px 'Noto Sans JP','Yu Gothic',sans-serif;fill:${COLORS.theme}}
    .round{font:700 40px 'Noto Sans JP','Yu Gothic',sans-serif;fill:#fff}
.team{font:700 29px 'Noto Sans JP','Yu Gothic',sans-serif;fill: ${COLORS.theme};}
.rank{font:400 25px 'Noto Sans JP','Yu Gothic',sans-serif;}
.score{font:700 25px 'Noto Sans JP','Yu Gothic',sans-serif;}
    .champ{font:700 48px 'Noto Sans JP','Yu Gothic',sans-serif;fill:${COLORS.theme}}
    .third-title{font:700 38px 'Noto Sans JP','Yu Gothic',sans-serif;fill:#fff}
    .legend{font:400 22px 'Noto Sans JP','Yu Gothic',sans-serif;fill:#666;}
  </style>`);

  const title = `${edition} UEFAチャンピオンズリーグ　決勝トーナメント`;
  parts.push(
    `<text class="title" x="${width / 2}" y="64" text-anchor="middle">${esc(title)}</text>`,
  );
  parts.push(
    `<text
    class="legend"
    x="${width / 2}"
    y="102"
    text-anchor="middle"
  >R16～準決勝：1st leg + 2nd leg = 2戦合計</text>`,
  );

  function roundHeader(x, label) {
    parts.push(
      `<rect
      x="${x}"
      y="${headerY}"
      width="${cardW}"
      height="${headerH}"
      rx="4"
      fill="${COLORS.theme}"
    />`,
    );

    parts.push(
      `<text
      class="round"
      x="${x + cardW / 2}"
      y="${headerY + headerH / 2}"
      text-anchor="middle"
      dominant-baseline="middle"
    >${esc(label)}</text>`,
    );
  }

  for (let i = 0; i < sideCols; i++) {
    roundHeader(leftXs[i], STAGE_LABEL[activeOrder[i]]);
    roundHeader(rightXs[i], STAGE_LABEL[activeOrder[i]]);
  }
  roundHeader(centerX, STAGE_LABEL.F);

  function drawConnections(node, side) {
    const target = nodePositions.get(node);
    for (const child of node.children) {
      const source = nodePositions.get(child);
      const sx = side === "left" ? source.x + cardW : source.x;
      const tx = side === "left" ? target.x : target.x + cardW;
      const mx = (sx + tx) / 2;
      parts.push(
        `<path d="M ${sx} ${source.y} H ${mx} V ${target.y} H ${tx}" fill="none" stroke="${COLORS.line}" stroke-width="3"/>`,
      );
      drawConnections(child, side);
    }
  }
  drawConnections(root.children[0], "left");
  drawConnections(root.children[1], "right");

  // semifinal to final connectors
  for (const [child, side] of [
    [root.children[0], "left"],
    [root.children[1], "right"],
  ]) {
    const source = nodePositions.get(child);
    const target = nodePositions.get(root);
    const sx = side === "left" ? source.x + cardW : source.x;
    const tx = side === "left" ? target.x : target.x + cardW;
    const mx = (sx + tx) / 2;
    parts.push(
      `<path d="M ${sx} ${source.y} H ${mx} V ${target.y} H ${tx}" fill="none" stroke="${COLORS.line}" stroke-width="3"/>`,
    );
  }

  function drawCard(node) {
    const { x, y } = nodePositions.get(node);
    const m = node.match;
    const topY = y - cardH / 2;
    const isFinal = m._stage === "F";
    parts.push(
      `<rect x="${x}" y="${topY}" width="${cardW}" height="${cardH}" rx="5" fill="#fff" stroke="${isFinal ? COLORS.theme : COLORS.line}" stroke-width="${isFinal ? 3 : 2}"/>`,
    );
    parts.push(
      `<line x1="${x}" y1="${y}" x2="${x + cardW}" y2="${y}" stroke="${COLORS.separator}" stroke-width="2"/>`,
    );

    const rows = [
      { team: m.home, score: scoreFor(m, "home"), rowTop: topY },
      { team: m.away, score: scoreFor(m, "away"), rowTop: y },
    ];
    for (const row of rows) {
      // クラブ名：上段
      parts.push(
        `<text class="team" x="${x + 12}" y="${row.rowTop + 24}">${esc(row.team)}</text>`,
      );

      // スコア：下段
      parts.push(
        `<text class="score" x="${x + 12}" y="${row.rowTop + 49}">${esc(row.score)}</text>`,
      );
    }
  }

  function drawAll(node) {
    for (const child of node.children) drawAll(child);
    drawCard(node);
  }
  drawAll(root.children[0]);
  drawAll(root.children[1]);
  drawCard(root);

  const champion = winner(finalMatch);
  parts.push(
    `<text class="champ" x="${centerX + cardW / 2}" y="${finalY - cardH / 2 - 25}" text-anchor="middle">優勝</text>`,
  );
  parts.push(
    `<text class="champ" x="${centerX + cardW / 2}" y="${finalY + cardH / 2 + 45}" text-anchor="middle">${esc(champion)}</text>`,
  );
  if (thirdPlaceMatch) {
    const thirdX = centerX;
    const thirdTop = thirdPlaceY - cardH / 2;
    const thirdHeaderH = 54;
    const thirdHeaderY = thirdTop - thirdHeaderH - 10;

    // 見出し
    parts.push(
      `<rect
    x="${thirdX}"
    y="${thirdHeaderY}"
    width="${cardW}"
    height="${thirdHeaderH}"
    rx="4"
    fill="${COLORS.theme}"
  />`,
    );

    parts.push(
      `<text
    class="third-title"
    x="${thirdX + cardW / 2}"
    y="${thirdHeaderY + thirdHeaderH / 2}"
    text-anchor="middle"
    dominant-baseline="middle"
  >3位決定戦</text>`,
    );

    // 試合カード
    parts.push(
      `<rect
      x="${thirdX}"
      y="${thirdTop}"
      width="${cardW}"
      height="${cardH}"
      rx="5"
      fill="#fff"
      stroke="${COLORS.line}"
      stroke-width="2"
    />`,
    );

    parts.push(
      `<line
      x1="${thirdX}"
      y1="${thirdPlaceY}"
      x2="${thirdX + cardW}"
      y2="${thirdPlaceY}"
      stroke="${COLORS.separator}"
      stroke-width="2"
    />`,
    );

    // ホーム国
    parts.push(
      `<text
      class="team"
      x="${thirdX + 12}"
      y="${thirdTop + 35}"
    >${esc(thirdPlaceMatch.home)}</text>`,
    );

    parts.push(
      `<text
      class="score"
      x="${thirdX + cardW - 12}"
      y="${thirdTop + 37}"
      text-anchor="end"
    >${esc(scoreFor(thirdPlaceMatch, "home"))}</text>`,
    );

    // アウェー国
    parts.push(
      `<text
      class="team"
      x="${thirdX + 12}"
      y="${thirdPlaceY + 35}"
    >${esc(thirdPlaceMatch.away)}</text>`,
    );

    parts.push(
      `<text
      class="score"
      x="${thirdX + cardW - 12}"
      y="${thirdPlaceY + 37}"
      text-anchor="end"
    >${esc(scoreFor(thirdPlaceMatch, "away"))}</text>`,
    );
  }
  parts.push(`</svg>`);

  return parts.join("\n");
}

function main() {
  if (!fs.existsSync(SCHEDULE_PATH))
    throw new Error(`試合CSVが見つかりません: ${SCHEDULE_PATH}`);

  const schedule = parseCsv(fs.readFileSync(SCHEDULE_PATH, "utf8"));
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const target of TARGETS) {
    const matches = schedule.filter(
      (r) =>
        r.competition.toUpperCase() === target.competition.toUpperCase() &&
        r.edition === target.edition,
    );

    const svg = renderBracket({ ...target, matches });
    const filename = `${target.competition.toLowerCase()}-${target.edition}.svg`;
    const outputPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outputPath, svg, "utf8");
    console.log(`generated: ${path.relative(ROOT, outputPath)}`);
  }
}

main();
