import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCHEDULE_PATH = path.resolve(
  ROOT,
  "src/data/competition_schedule_and_results.csv",
);
const GROUPS_PATH = path.resolve(ROOT, "src/data/tournament_groups_master.csv");
const OUTPUT_DIR = path.resolve(ROOT, "public/images/brackets");

const TARGETS = [
  { competition: "WC", edition: "2026" },
  { competition: "WC", edition: "2022" },
  { competition: "WC", edition: "2018" },
  { competition: "WC", edition: "2014" },
  { competition: "WC", edition: "2010" },
  { competition: "WC", edition: "2006" },
  { competition: "WC", edition: "2002" },
];

const COLORS = {
  background: "#ffffff",
  theme: "#7a1830",
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
  R16: "ベスト16",
  QF: "準々決勝",
  SF: "準決勝",
  F: "決勝",
};

function winner(match) {
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

function scoreFor(match, side) {
  const score = side === "home" ? match.home_score : match.away_score;
  const pk = side === "home" ? match.home_score_pk : match.away_score_pk;
  return pk ? `${score} PK${pk}` : score;
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

function renderBracket({ competition, edition, matches, groupRows }) {
  const knockout = matches
    .map((m) => ({ ...m, _stage: normStage(m.stage) }))
    .filter((m) => m._stage);
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
    for (const team of [match.home, match.away]) {
      const prior = candidates.find((m) => winner(m) === team);
      if (!prior)
        throw new Error(
          `${competition} ${edition}: ${prevStage}で${team}の勝ち上がり元が見つかりません。`,
        );
      node.children.push(buildActiveTree(prior, index - 1));
    }
    return node;
  }

  const root = buildActiveTree(finalMatch, localIndex);
  const leaves = flattenLeaves(root);
  const leftLeaves = flattenLeaves(root.children[0]);
  const rightLeaves = flattenLeaves(root.children[1]);

  const groupRank = new Map(
    groupRows.map((r) => [
      r.country_name_ja,
      `${r.group}組${r.rank || r.slot}位`,
    ]),
  );

  const cardW = 280;
  const cardH = 116;
  const colGap = 55;
  const sideCols = activeOrder.length - 1;
  const marginX = 40;
  const headerY = 84;
  const top = 170;
  const rowGap = 34;
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
    `<title id="title">${esc(edition)} FIFAワールドカップ 決勝トーナメント</title>`,
  );
  parts.push(
    `<desc id="desc">試合データから自動生成した決勝トーナメント表</desc>`,
  );
  parts.push(`<rect width="100%" height="100%" fill="${COLORS.background}"/>`);
  parts.push(`<style>
    .title{font:700 42px 'Noto Sans JP','Yu Gothic',sans-serif;fill:${COLORS.theme}}
    .round{font:700 27px 'Noto Sans JP','Yu Gothic',sans-serif;fill:#fff}
    .team{font:700 21px 'Noto Sans JP','Yu Gothic',sans-serif;fill:${COLORS.theme}}
    .rank{font:400 15px 'Noto Sans JP','Yu Gothic',sans-serif;fill:${COLORS.theme}}
    .score{font:700 23px 'Noto Sans JP','Yu Gothic',sans-serif;fill:${COLORS.theme}}
    .champ{font:700 31px 'Noto Sans JP','Yu Gothic',sans-serif;fill:${COLORS.theme}}
    .third-title{font:700 23px 'Noto Sans JP','Yu Gothic',sans-serif;fill:#fff}
  </style>`);

  const title = `${edition} FIFAワールドカップ　決勝トーナメント`;
  parts.push(
    `<text class="title" x="${width / 2}" y="52" text-anchor="middle">${esc(title)}</text>`,
  );

  function roundHeader(x, label) {
    parts.push(
      `<rect x="${x}" y="${headerY}" width="${cardW}" height="44" rx="4" fill="${COLORS.theme}"/>`,
    );
    parts.push(
      `<text class="round" x="${x + cardW / 2}" y="${headerY + 31}" text-anchor="middle">${esc(label)}</text>`,
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

    const showRank = m._stage === firstStage;
    const rows = [
      { team: m.home, score: scoreFor(m, "home"), rowTop: topY },
      { team: m.away, score: scoreFor(m, "away"), rowTop: y },
    ];
    for (const row of rows) {
      parts.push(
        `<text class="team" x="${x + 12}" y="${row.rowTop + 29}">${esc(row.team)}</text>`,
      );
      if (showRank && groupRank.has(row.team)) {
        parts.push(
          `<text class="rank" x="${x + 13}" y="${row.rowTop + 51}">${esc(groupRank.get(row.team))}</text>`,
        );
      }
      parts.push(
        `<text class="score" x="${x + cardW - 12}" y="${row.rowTop + 32}" text-anchor="end">${esc(row.score)}</text>`,
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
    const thirdHeaderY = thirdTop - 48;

    // 見出し
    parts.push(
      `<rect
      x="${thirdX}"
      y="${thirdHeaderY}"
      width="${cardW}"
      height="38"
      rx="4"
      fill="${COLORS.theme}"
    />`,
    );

    parts.push(
      `<text
      class="third-title"
      x="${thirdX + cardW / 2}"
      y="${thirdHeaderY + 27}"
      text-anchor="middle"
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
      y="${thirdTop + 29}"
    >${esc(thirdPlaceMatch.home)}</text>`,
    );

    parts.push(
      `<text
      class="score"
      x="${thirdX + cardW - 12}"
      y="${thirdTop + 32}"
      text-anchor="end"
    >${esc(scoreFor(thirdPlaceMatch, "home"))}</text>`,
    );

    // アウェー国
    parts.push(
      `<text
      class="team"
      x="${thirdX + 12}"
      y="${thirdPlaceY + 29}"
    >${esc(thirdPlaceMatch.away)}</text>`,
    );

    parts.push(
      `<text
      class="score"
      x="${thirdX + cardW - 12}"
      y="${thirdPlaceY + 32}"
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
  if (!fs.existsSync(GROUPS_PATH))
    throw new Error(`GL順位CSVが見つかりません: ${GROUPS_PATH}`);

  const schedule = parseCsv(fs.readFileSync(SCHEDULE_PATH, "utf8"));
  const groups = parseCsv(fs.readFileSync(GROUPS_PATH, "utf8"));
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const target of TARGETS) {
    const matches = schedule.filter(
      (r) =>
        r.competition.toUpperCase() === target.competition.toUpperCase() &&
        r.edition === target.edition,
    );
    const groupRows = groups.filter(
      (r) =>
        r.tournament === target.competition &&
        r.edition === target.edition &&
        r.stage === "group",
    );
    const svg = renderBracket({ ...target, matches, groupRows });
    const filename = `${target.competition.toLowerCase()}-${target.edition}.svg`;
    const outputPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outputPath, svg, "utf8");
    console.log(`generated: ${path.relative(ROOT, outputPath)}`);
  }
}

main();
