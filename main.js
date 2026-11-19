// @ts-check

const API = "https://api.bgm.tv/v0";
const DEFAULT_CONFIG = {
  search_limit: 5,
  filter_number: 10,
  tag_user_count: 5,
  tag_count: 10,
};
const HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "User-Agent": "io.github.youxikong.bangumi/0.0.1",
};

/**
 * @param {keyof typeof DEFAULT_CONFIG} key
 */
function settingNumber(key) {
  const raw = dalibre.settings[key];
  if (raw === undefined || raw.trim() === "") return DEFAULT_CONFIG[key];

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw dalibre.error(
      "invalid",
      `Plugin setting "${key}" must be a non-negative integer.`,
    );
  }
  return value;
}

/**
 * @param {string} path
 * @param {RequestInit} [options]
 */
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...HEADERS, ...options.headers },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw dalibre.error("unavailable", `Could not reach Bangumi: ${message}`);
  }

  if (response.status === 429) throw dalibre.error("rateLimited");
  if (response.status === 404) throw dalibre.error("notFound");
  if (!response.ok) {
    throw dalibre.error(
      "unavailable",
      `Bangumi answered HTTP ${response.status}`,
    );
  }
  return response.json();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {any[]} infobox
 * @param {string[]} keys
 * @returns {string[]}
 */
function infoboxValues(infobox, keys) {
  const values = [];
  for (const key of keys) {
    for (const entry of infobox) {
      if (entry?.key !== key) continue;
      const value = entry.value;
      if (Array.isArray(value)) {
        for (const item of value) {
          const parsed = text(item?.v);
          if (parsed) values.push(parsed);
        }
      } else {
        const parsed = text(value);
        if (parsed) values.push(parsed);
      }
    }
  }
  return values;
}

/**
 * @param {any[]} infobox
 * @param {string[]} keys
 * @returns {string}
 */
function firstInfoboxValue(infobox, keys) {
  return infoboxValues(infobox, keys)[0] ?? "";
}

/**
 * @param {any} subject
 * @returns {Dalibre.Candidate}
 */
function toCandidate(subject) {
  const infobox = Array.isArray(subject.infobox) ? subject.infobox : [];
  const authors = infoboxValues(infobox, ["作者", "原作", "作画", "插图", "插画"]);
  const isbn = firstInfoboxValue(infobox, ["ISBN"]);
  const publisher = firstInfoboxValue(infobox, ["出版社"]);
  const infoboxDate = firstInfoboxValue(infobox, ["发售日"]);
  const rawDate = text(subject.date) || infoboxDate;
  const pubdate = /^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(rawDate)
    ? rawDate
    : undefined;
  const minimumTagUsers = settingNumber("tag_user_count");
  const maximumTags = settingNumber("tag_count");
  /** @type {{name?: string, count?: number}[]} */
  const bangumiTags = Array.isArray(subject.tags) ? subject.tags : [];
  const tags = bangumiTags
    .filter(
      (tag) => typeof tag.count === "number" && tag.count >= minimumTagUsers,
    )
    .slice(0, maximumTags)
    .map((tag) => text(tag.name))
    .filter(Boolean);
  const image = text(subject.images?.large);
  const cover = safeBangumiImage(image);
  const score = Number(subject.rating?.score);
  const fields = [];

  if (Number.isFinite(score) && score > 0) {
    fields.push({ label: "Bangumi rating", value: `${score} / 10` });
  }
  if (isbn) fields.push({ label: "ISBN", value: isbn });
  fields.push({ label: "Bangumi ID", value: String(subject.id) });

  return {
    id: String(subject.id),
    title: text(subject.name_cn) || text(subject.name) || `Bangumi ${subject.id}`,
    authors,
    description: text(subject.summary) || undefined,
    publisher: publisher || undefined,
    pubdate,
    tags,
    identifiers: {
      bgm: String(subject.id),
      ...(isbn ? { isbn: isbn } : {}),
    },
    ...(cover ? { cover } : {}),
    url: `https://bangumi.tv/subject/${encodeURIComponent(String(subject.id))}`,
    fields: fields.slice(0, 12),
  };
}

/**
 * Only allow image URLs on Bangumi's own HTTPS domains.
 * @param {string} value
 * @returns {string | undefined}
 */
function safeBangumiImage(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      (url.hostname === "bgm.tv" || url.hostname.endsWith(".bgm.tv"))
    ) {
      return url.href;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * @param {string | number} id
 */
async function getSubject(id) {
  return request(`/subjects/${encodeURIComponent(String(id))}`);
}

/**
 * @param {string | number} id
 * @returns {Promise<string[]>}
 */
async function getRelatedBookIds(id) {
  const relations = await request(
    `/subjects/${encodeURIComponent(String(id))}/subjects`,
  );
  return Array.isArray(relations)
    ? relations
        .filter((item) => item?.type === 1 && item.id != null)
        .map((item) => String(item.id))
    : [];
}

/**
 * @param {string} title
 */
async function searchSubjectIds(title) {
  const data = await request(
    `/search/subjects?limit=${settingNumber("search_limit")}`,
    {
      method: "POST",
      body: JSON.stringify({
        keyword: title,
        filter: { type: [1], nsfw: true },
      }),
    },
  );
  /** @type {{id?: string | number}[]} */
  const items = Array.isArray(data?.data) ? data.data : [];
  return items.filter((item) => item.id != null).map((item) => String(item.id));
}

/**
 * @param {string} title
 * @param {string} candidateTitle
 */
function titleScore(title, candidateTitle) {
  const normalizedTitle = title.toLocaleLowerCase();
  const normalizedCandidate = candidateTitle.toLocaleLowerCase();
  const tokens = normalizedTitle.split(/\s+/).filter(Boolean);
  const matched = tokens.filter((token) => normalizedCandidate.includes(token)).length;
  const tokenScore = tokens.length ? matched / tokens.length : 0;
  const exactScore =
    normalizedTitle && normalizedCandidate.includes(normalizedTitle) ? 1 : 0;
  return tokenScore * 10 + exactScore;
}

/**
 * Finds Bangumi entries matching a library book.
 * @param {Dalibre.Book} book
 * @returns {Promise<Dalibre.Candidate[]>}
 */
export async function identify(book) {
  const bangumiId = book.identifiers.bgm;
  if (bangumiId) {
    return [toCandidate(await getSubject(bangumiId))];
  }

  const title = text(book.title);
  if (!title) return [];

  const subjectIds = await searchSubjectIds(title);
  if (!subjectIds.length) return [];

  const subjects = await Promise.all(subjectIds.map(getSubject));
  const subjectById = new Map(
    subjects.map((subject) => [String(subject.id), subject]),
  );
  const relatedByChild = new Map();
  const relatedIds = await Promise.all(subjectIds.map(getRelatedBookIds));
  relatedIds.forEach((ids, index) => {
    for (const id of ids) {
      if (!subjectById.has(id)) relatedByChild.set(id, subjectIds[index]);
    }
  });

  const childIds = [...relatedByChild.keys()];
  const children = await Promise.all(childIds.map(getSubject));
  for (const child of children) subjectById.set(String(child.id), child);

  return [...subjectById.values()]
    .map((subject) => {
      const parentId = relatedByChild.get(String(subject.id));
      const parent = parentId ? subjectById.get(parentId) : undefined;
      const titleFilter = [
        text(subject.name_cn) || (parent ? text(parent.name_cn) : ""),
        text(subject.name),
      ]
        .filter(Boolean)
        .join(" ");
      return {
        subject,
        score: titleScore(title, titleFilter || text(subject.name)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, settingNumber("filter_number"))
    .map(({ subject }) => toCandidate(subject));
}
