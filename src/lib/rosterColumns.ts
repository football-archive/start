import type { Column } from "../components/RosterView.astro";
import { toInt, toYM, calcAge, toYMD } from "./rosterFormat";

export type ClubRow = {
  season?: string;
  league?: string;
  club?: string;

  club_shirt_no?: string;
  position_primary?: string;

  name_en?: string;
  name_ja?: string;

  birth_date?: string;
  height_cm?: string;
  snapshot_date?: string;

  nationality?: string;
  foot?: string;

  join_date?: string;
  prev_club?: string;
  contract_until?: string;
  source?: string;
  notes?: string;

  // 将来stats
  apps?: string;
  goals?: string;
  assists?: string;
};

export type NtRow = {
  competition?: string;
  edition?: string;
  confederation?: string;
  country?: string;

  nt_shirt_no?: string;
  position_primary?: string;

  name_en?: string;
  name_ja?: string;

  birth_date?: string;
  height_cm?: string;

  current_club?: string;
  national_debut?: string;

  snapshot_date?: string;
  source?: string;
  notes?: string;

  apps?: string;
  goals?: string;
  assists?: string;
};

const esc = (s: string) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

// ✅ 日本語/英語2段表示（HTML文字列）
const name2Html = (ja?: string, en?: string) => {
  const j = (ja ?? "").trim();
  const e = (en ?? "").trim();
  if (!j && !e) return "";
  if (!j) return esc(e);
  if (!e) return esc(j);
  if (j === e) return esc(j);

  return `<div class="name2">
    <div class="name2-ja">${esc(j)}</div>
    <div class="name2-en">${esc(e)}</div>
  </div>`;
};

const rep2Html = (team: string, links: { label: string; href: string }[]) => {
  const t = (team ?? "").trim();
  if (!t) return ""; // ✅ 空は非表示

  const linkHtml = (links ?? [])
    .map((x) => `<a class="rep2-ed" href="${esc(x.href)}">${esc(x.label)}</a>`)
    .join(`<span class="rep2-sep">/</span>`);

  return `<div class="rep2">
    <div class="rep2-team">${esc(t)}代表</div>
    ${linkHtml ? `<div class="rep2-links">${linkHtml}</div>` : ``}
  </div>`;
};

// 大会（edition）リンクだけをコンパクトに表示
const editionLinksHtml = (
  links: { label: string; href: string }[],
  max = 6,
) => {
  if (!links?.length) return "";

  const labelsAll = links.map((x) => x.label).join(" / ");

  // 末尾側（最近）を残す
  const sliced = links.length > max ? links.slice(-max) : links;
  const prefix = links.length > max ? "… " : "";

  const body = sliced
    .map((x) => `<a href="${x.href}">${toYY(x.label)}</a>`)
    .join(" / ");

  return `<span title="${esc(labelsAll)}">${prefix}${body}</span>`;
};

function toYY(edition: string) {
  const y = String(edition ?? "").trim();
  if (!/^\d{4}$/.test(y)) return y; // 念のため
  return y.slice(2); // "2022" -> "22"
}

const club2Html = (clubName?: string, href?: string) => {
  const c = (clubName ?? "").trim();
  if (!c) return "";
  const h = (href ?? "").trim();

  // 見つからない場合は文字だけ（リンク無し）
  if (!h) return esc(c);

  return `<a class="club-link" href="${h}">${esc(c)}</a>`;
};

type BuildClubColumnsArgs = {
  isLatestView: boolean;
  repLabel: (row: { name_en?: string; birth_date?: string }) => string;
  repLinks: (row: {
    name_en?: string;
    birth_date?: string;
  }) => { label: string; href: string }[];
  tournamentLinks?: (row: ClubRow) => { label: string; href: string }[];
  showStats?: boolean;
};

export const buildClubColumns = ({
  isLatestView,
  repLabel,
  repLinks,
  tournamentLinks,
  showStats = false,
}: BuildClubColumnsArgs): Column<ClubRow>[] => {
  return [
    {
      key: "no",
      header: "#",
      align: "center",
      render: (r) => toInt(r.club_shirt_no),
    },
    {
      key: "pos",
      header: "Pos",
      align: "center",
      render: (r) => (r.position_primary ?? "").trim(),
    },
    {
      key: "name",
      header: "選手名",
      html: true, // ✅ 追加
      render: (r) => name2Html(r.name_ja, r.name_en),
    },

    // 加入日
    {
      key: "joined",
      header: "加入日",
      align: "center",
      render: (r) => toYM(r.join_date),
    },

    {
      key: "editions",
      header: "招集歴",
      align: "center",
      html: true,
      render: (r) =>
        tournamentLinks ? editionLinksHtml(tournamentLinks(r) ?? []) : "",
    },

    // ✅ 国籍（ここが消えていたらこの差し替えで復活）
    {
      key: "nat",
      header: "国籍",
      align: "center",
      render: (r) => (r.nationality ?? "").trim(),
    },

    {
      key: "nt",
      header: "代表",
      html: true,
      align: "center",
      render: (r) => rep2Html(repLabel(r), repLinks(r)),
    },

    {
      key: "birth",
      header: "生年月日",
      align: "center",
      render: (r) => toYMD(r.birth_date),
    },
    {
      key: "age",
      header: "年齢",
      align: "center",
      show: isLatestView,
      render: (r) => calcAge(r.birth_date, r.snapshot_date),
    },
    {
      key: "height",
      header: "身長",
      align: "center",
      render: (r) => toInt(r.height_cm),
    },
    {
      key: "note",
      header: "備考",
      align: "left",
      html: true,
      render: (r) => {
        const v = String(r.notes ?? "").trim();
        if (!v) return "";
        return `<span class="note-red">${esc(v)}</span>`;
      },
    },

    // ---- Stats（後付け）----
    {
      key: "apps",
      header: "Apps",
      align: "center",
      show: showStats,
      render: (r) => toInt(r.apps),
    },
    {
      key: "g",
      header: "G",
      align: "center",
      show: showStats,
      render: (r) => toInt(r.goals),
    },
    {
      key: "a",
      header: "A",
      align: "center",
      show: showStats,
      render: (r) => toInt(r.assists),
    },
  ];
};

type BuildNtColumnsArgs = {
  isLatestView: boolean;
  showStats?: boolean;
  // current_club文字列からクラブ詳細URLを返す（見つからなければ空文字でOK）
  clubHref?: (clubName: string) => string;

  // ★追加：current_club文字列から表示名（日本語）を返す
  clubLabel?: (clubName: string) => string;

  // ★追加：その選手が招集された大会（edition）リンクを返す（例：WC 2014/2018/2022…）
  tournamentLinks?: (r: NtRow) => { label: string; href: string }[];
};

export const buildNtColumns = ({
  isLatestView,
  showStats = false,
  clubHref,
  clubLabel, // ★追加
  tournamentLinks, // ★追加
}: BuildNtColumnsArgs): Column<NtRow>[] => {
  // ※ 代表側はあなたの現状運用に合わせて必要な列だけにしてOK
  return [
    {
      key: "no",
      header: "#",
      align: "center",
      render: (r) => toInt(r.nt_shirt_no),
    },
    {
      key: "pos",
      header: "Pos",
      align: "center",
      render: (r) => (r.position_primary ?? "").trim(),
    },
    {
      key: "name",
      header: "選手名",
      html: true,
      render: (r) => name2Html(r.name_ja, r.name_en),
    },
    {
      key: "nt_debut_date",
      header: "代表デビュー",
      align: "center",
      render: (r) => toYM(r.national_debut),
    },
    {
      key: "editions",
      header: "招集歴",
      align: "center",
      html: true,
      render: (r) => editionLinksHtml(tournamentLinks(r) ?? []),
    },
    {
      key: "club",
      header: "所属クラブ",
      html: true,
      align: "center",
      render: (r) => {
        const raw = String(r.current_club ?? "").trim();
        if (!raw) return "";

        const label = clubLabel ? clubLabel(raw) : raw;
        const href = clubHref ? clubHref(raw) : "";

        // リンク作れるならリンク、無理なら文字だけ
        return href ? `<a href="${href}">${label}</a>` : label;
      },
    },
    {
      key: "birth",
      header: "生年月日",
      align: "center",
      render: (r) => toYMD(r.birth_date),
    },
    {
      key: "age",
      header: "年齢",
      align: "center",
      show: isLatestView,
      render: (r) => calcAge(r.birth_date, r.snapshot_date),
    },
    {
      key: "height",
      header: "身長",
      align: "center",
      render: (r) => toInt(r.height_cm),
    },
    {
      key: "note",
      header: "備考",
      align: "left",
      html: true,
      render: (r) => {
        const v = String(r.notes ?? "").trim();
        if (!v) return "";
        return `<span class="note-red">${esc(v)}</span>`;
      },
    },

    {
      key: "apps",
      header: "Apps",
      align: "center",
      show: showStats,
      render: (r) => toInt(r.apps),
    },
    {
      key: "g",
      header: "G",
      align: "center",
      show: showStats,
      render: (r) => toInt(r.goals),
    },
    {
      key: "a",
      header: "A",
      align: "center",
      show: showStats,
      render: (r) => toInt(r.assists),
    },
  ];
};
