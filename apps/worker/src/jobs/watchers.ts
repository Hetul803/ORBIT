import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { queuePush, type PrismaClient } from '@orbit/db';
import type { ModelRouter } from '@orbit/llm';
import { watcherSpecSchema } from '@orbit/shared';
import { CronExpressionParser } from 'cron-parser';

const USER_AGENT =
  'ORBITWatcher/1.0 (+https://github.com/Hetul803/ORBIT; contact=security@orbit.app)';
const MAX_RESPONSE_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const HOST_INTERVAL_MS = 1_000;
const blockedHosts = new Set([
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
]);
const hostLastFetchedAt = new Map<string, number>();

interface Candidate {
  title: string;
  detail: string;
  href: string;
  stableId: string;
  priceCents?: number;
  currency?: 'USD' | 'GBP' | 'EUR';
  extraction: 'rss' | 'atom' | 'json' | 'structured_html' | 'html' | 'llm';
}

interface SearchApiConfig {
  readonly SEARCH_API_ENDPOINT: string;
  readonly SEARCH_API_KEY?: string | undefined;
}

const nextDate = (expression: string): Date => {
  try {
    return CronExpressionParser.parse(expression).next().toDate();
  } catch {
    return new Date(Date.now() + 6 * 3_600_000);
  }
};

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
export const watcherDedupeKey = (watcherId: string, targetId: string): string =>
  hash(`${watcherId}:${targetId}`);
const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const isPrivateAddress = (address: string): boolean => {
  if (address === '::1' || address === '::' || address.startsWith('fc') || address.startsWith('fd'))
    return true;
  if (address.startsWith('fe80:')) return true;
  if (isIP(address) !== 4) return false;
  const parts = address.split('.').map(Number);
  const [first = 0, second = 0] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
};

export const assertPublicWatcherUrl = async (value: string): Promise<URL> => {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only public HTTP and HTTPS watcher URLs are supported.');
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error('Authenticated URLs are not supported.');
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./u, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    [...blockedHosts].some((blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`)) ||
    /\/(?:login|signin|auth)(?:\/|$)/iu.test(url.pathname)
  ) {
    throw new Error('This host or login route is not eligible for public-web watchers.');
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Watcher URLs must resolve only to public internet addresses.');
  }
  return url;
};

const throttleHost = async (hostname: string): Promise<void> => {
  const elapsed = Date.now() - (hostLastFetchedAt.get(hostname) ?? 0);
  if (elapsed < HOST_INTERVAL_MS) await delay(HOST_INTERVAL_MS - elapsed);
  hostLastFetchedAt.set(hostname, Date.now());
};

const readBoundedBody = async (response: Response): Promise<string> => {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_RESPONSE_BYTES) throw new Error('Watcher response exceeded the 1 MB limit.');
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Watcher response exceeded the 1 MB limit.');
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};

const fetchPublic = async (
  initialUrl: URL,
): Promise<{ body: string; contentType: string; url: URL }> => {
  let current = initialUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    current = await assertPublicWatcherUrl(current.toString());
    await throttleHost(current.hostname);
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/json, text/html;q=0.9',
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location === null) throw new Error('Watcher redirect had no destination.');
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`Watcher source returned HTTP ${String(response.status)}.`);
    return {
      body: await readBoundedBody(response),
      contentType: response.headers.get('content-type')?.toLowerCase() ?? '',
      url: current,
    };
  }
  throw new Error('Watcher source redirected too many times.');
};

const robotsAllows = async (url: URL): Promise<boolean> => {
  const robotsUrl = new URL('/robots.txt', url.origin);
  try {
    const { body } = await fetchPublic(robotsUrl);
    let applies = false;
    for (const rawLine of body.split(/\r?\n/u)) {
      const line = rawLine.split('#')[0]?.trim() ?? '';
      const separator = line.indexOf(':');
      if (separator < 0) continue;
      const field = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();
      if (field === 'user-agent')
        applies = value === '*' || value.toLowerCase().includes('orbitwatcher');
      if (applies && field === 'disallow' && value.length > 0 && url.pathname.startsWith(value))
        return false;
      if (applies && field === 'allow' && value.length > 0 && url.pathname.startsWith(value))
        return true;
    }
    return true;
  } catch {
    return true;
  }
};

const decodeEntities = (value: string): string =>
  value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/\s+/gu, ' ')
    .trim();

const stripMarkup = (value: string): string => decodeEntities(value.replace(/<[^>]*>/gu, ' '));

const tag = (block: string, names: readonly string[]): string => {
  for (const name of names) {
    const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'iu').exec(block);
    if (match?.[1] !== undefined) return stripMarkup(match[1]);
  }
  return '';
};

export const parseFeed = (body: string, base: URL): Candidate[] => {
  const blocks = body.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/giu) ?? [];
  return blocks.slice(0, 50).map((block, index) => {
    const atomLink = /<link[^>]+href=["']([^"']+)["']/iu.exec(block)?.[1];
    const rawHref = (atomLink ?? tag(block, ['link'])) || base.toString();
    const href = new URL(rawHref, base).toString();
    const title = tag(block, ['title']) || `Feed result ${String(index + 1)}`;
    const detail = tag(block, ['description', 'summary', 'content']).slice(0, 1_000);
    const stable = tag(block, ['guid', 'id']) || href || title;
    return {
      title,
      detail,
      href,
      stableId: `${stable}:${hash(`${title}:${detail}`).slice(0, 16)}`,
      extraction: /<entry/iu.test(block) ? 'atom' : 'rss',
    };
  });
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const strings = (record: Record<string, unknown>, keys: readonly string[]): string | undefined => {
  for (const key of keys) if (typeof record[key] === 'string') return record[key];
  return undefined;
};

const priceFrom = (
  value: unknown,
): { priceCents: number; currency?: 'USD' | 'GBP' | 'EUR' } | undefined => {
  if (typeof value === 'number' && Number.isFinite(value))
    return { priceCents: Math.round(value * 100) };
  if (typeof value !== 'string') return undefined;
  const match = /(USD|GBP|EUR|\$|£|€)?\s*([\d,.]+)/iu.exec(value);
  const amount = match?.[2];
  if (amount === undefined) return undefined;
  const parsed = Number(amount.replaceAll(',', ''));
  if (!Number.isFinite(parsed)) return undefined;
  const marker = match?.[1]?.toUpperCase();
  const currency =
    marker === '$' || marker === 'USD'
      ? 'USD'
      : marker === '£' || marker === 'GBP'
        ? 'GBP'
        : marker === '€' || marker === 'EUR'
          ? 'EUR'
          : undefined;
  return {
    priceCents: Math.round(parsed * 100),
    ...(currency === undefined ? {} : { currency }),
  };
};

export const parseJsonCandidates = (value: unknown, base: URL): Candidate[] => {
  const root = asRecord(value);
  const collection = Array.isArray(value)
    ? value
    : ((['items', 'results', 'data', 'entries', 'products', 'jobs', 'opportunities']
        .map((key) => root[key])
        .find((entry) => Array.isArray(entry)) as unknown[] | undefined) ?? [value]);
  return collection.slice(0, 50).flatMap((entry, index) => {
    const record = asRecord(entry);
    const title = strings(record, ['title', 'name', 'headline', 'subject']);
    if (title === undefined) return [];
    const detail = strings(record, ['description', 'summary', 'body', 'content']) ?? '';
    const rawHref = strings(record, ['url', 'link', 'href']) ?? base.toString();
    let href: string;
    try {
      href = new URL(rawHref, base).toString();
    } catch {
      href = base.toString();
    }
    const id = strings(record, ['id', 'guid', 'uuid']) ?? `${href}:${String(index)}`;
    const price = priceFrom(record.price ?? record.amount ?? record.priceUsd);
    return [
      {
        title: title.slice(0, 300),
        detail: detail.slice(0, 1_000),
        href,
        stableId: `${id}:${hash(`${title}:${detail}:${String(price?.priceCents ?? '')}`).slice(0, 16)}`,
        ...price,
        extraction: 'json' as const,
      },
    ];
  });
};

const parseStructuredHtml = (body: string, base: URL): Candidate[] => {
  const scripts = [
    ...body.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu),
  ];
  const candidates: Candidate[] = [];
  for (const script of scripts.slice(0, 10)) {
    try {
      const parsed: unknown = JSON.parse(script[1] ?? '');
      const values = Array.isArray(parsed) ? parsed : [parsed];
      for (const value of values) {
        const record = asRecord(value);
        const graph = Array.isArray(record['@graph']) ? record['@graph'] : [record];
        for (const node of graph.slice(0, 50)) {
          for (const candidate of parseJsonCandidates(node, base)) {
            candidates.push({ ...candidate, extraction: 'structured_html' });
          }
        }
      }
    } catch {
      // Invalid JSON-LD is ignored; bounded HTML or model extraction can still evaluate the page.
    }
  }
  return candidates.slice(0, 50);
};

export const parseHtmlPage = (body: string, base: URL): Candidate[] => {
  const structured = parseStructuredHtml(body, base);
  if (structured.length > 0) return structured;
  const title = tag(body, ['title']) || base.hostname;
  const description =
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/iu.exec(
      body,
    )?.[1] ?? stripMarkup(body).slice(0, 1_000);
  const price =
    /<meta[^>]+(?:property|itemprop)=["'](?:product:price:amount|price)["'][^>]+content=["']([^"']+)["']/iu.exec(
      body,
    )?.[1] ??
    /(?:class=["'][^"']*price[^"']*["'][^>]*>|(?:USD|GBP|EUR|\$|£|€)\s*)([$£€]?[\d,.]+)/iu.exec(
      body,
    )?.[1] ??
    /(?:USD|GBP|EUR|\$|£|€)\s*([\d,.]+)/iu.exec(`${title} ${description}`)?.[0];
  const parsedPrice = priceFrom(price);
  return [
    {
      title: decodeEntities(title).slice(0, 300),
      detail: decodeEntities(description).slice(0, 1_000),
      href: base.toString(),
      stableId: `${base.toString()}:${hash(`${title}:${description}:${String(parsedPrice?.priceCents ?? '')}`).slice(0, 16)}`,
      ...parsedPrice,
      extraction: 'html',
    },
  ];
};

export const candidateMatches = (
  candidate: Candidate,
  query: string,
  constraints: Record<string, unknown>,
): boolean => {
  const maximum = constraints.maximumCents;
  const expectedCurrency = constraints.currency;
  if (
    typeof maximum === 'number' &&
    (candidate.priceCents === undefined || candidate.priceCents > maximum)
  )
    return false;
  if (
    typeof expectedCurrency === 'string' &&
    candidate.currency !== undefined &&
    candidate.currency !== expectedCurrency.toUpperCase()
  )
    return false;
  const required = Array.isArray(constraints.contains)
    ? constraints.contains.filter((value): value is string => typeof value === 'string')
    : [];
  const haystack = `${candidate.title} ${candidate.detail}`.toLowerCase();
  if (!required.every((term) => haystack.includes(term.toLowerCase()))) return false;
  const queryTerms =
    query
      .replace(/https?:\/\/\S+/giu, ' ')
      .toLowerCase()
      .match(/[a-z0-9]{4,}/gu)
      ?.filter(
        (term) =>
          !['watch', 'when', 'notify', 'under', 'below', 'page', 'appears', 'changes'].includes(
            term,
          ),
      ) ?? [];
  return (
    maximum !== undefined ||
    queryTerms.length === 0 ||
    queryTerms.some((term) => haystack.includes(term))
  );
};

const evaluateWithModel = async (
  router: ModelRouter | undefined,
  userId: string,
  query: string,
  sourceUrl: string,
  body: string,
): Promise<Candidate | null> => {
  if (router === undefined) return null;
  try {
    const response = await router.complete({
      task: 'rerank',
      userId,
      messages: [
        {
          role: 'system',
          content:
            'Evaluate a public page against a watcher. Return JSON only: {"match":boolean,"title":string,"detail":string}. Never invent facts.',
        },
        {
          role: 'user',
          content: `Watcher: ${query}\nURL: ${sourceUrl}\nPage text:\n${stripMarkup(body).slice(0, 12_000)}`,
        },
      ],
      constraints: { maxOutputTokens: 300, temperature: 0, jsonMode: true },
    });
    const parsed = asRecord(JSON.parse(response.text));
    if (
      parsed.match !== true ||
      typeof parsed.title !== 'string' ||
      typeof parsed.detail !== 'string'
    )
      return null;
    return {
      title: parsed.title.slice(0, 300),
      detail: parsed.detail.slice(0, 1_000),
      href: sourceUrl,
      stableId: `${sourceUrl}:${hash(`${parsed.title}:${parsed.detail}`).slice(0, 16)}`,
      extraction: 'llm',
    };
  } catch {
    return null;
  }
};

const webCandidates = async (
  userId: string,
  spec: ReturnType<typeof watcherSpecSchema.parse>,
  router: ModelRouter | undefined,
  searchConfig?: SearchApiConfig,
): Promise<{ candidates: Candidate[]; sourceUrl: string }> => {
  if (spec.format === 'search_api' && spec.url === undefined) {
    if (searchConfig?.SEARCH_API_KEY === undefined) {
      throw new Error('Search API is not configured for this watcher.');
    }
    const endpoint = await assertPublicWatcherUrl(searchConfig.SEARCH_API_ENDPOINT);
    endpoint.searchParams.set('q', spec.query);
    endpoint.searchParams.set('count', '20');
    await throttleHost(endpoint.hostname);
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        Authorization: `Bearer ${searchConfig.SEARCH_API_KEY}`,
        'X-Subscription-Token': searchConfig.SEARCH_API_KEY,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Search API returned HTTP ${String(response.status)}.`);
    const payload = JSON.parse(await readBoundedBody(response)) as unknown;
    const record = asRecord(payload);
    const web = asRecord(record.web);
    const results = Array.isArray(web.results)
      ? web.results
      : Array.isArray(record.results)
        ? record.results
        : [];
    return {
      candidates: parseJsonCandidates(results, endpoint).slice(0, 20),
      sourceUrl: endpoint.origin,
    };
  }
  if (spec.url === undefined) throw new Error('Public-web watchers require a URL.');
  const url = await assertPublicWatcherUrl(spec.url);
  if (!(await robotsAllows(url)))
    throw new Error('The source robots policy does not allow this watcher.');
  const fetched = await fetchPublic(url);
  const format = spec.format;
  let candidates: Candidate[];
  if (
    format === 'rss' ||
    format === 'atom' ||
    fetched.contentType.includes('xml') ||
    /<(rss|feed)[\s>]/iu.test(fetched.body)
  ) {
    candidates = parseFeed(fetched.body, fetched.url);
  } else if (format === 'json' || format === 'search_api' || fetched.contentType.includes('json')) {
    try {
      candidates = parseJsonCandidates(JSON.parse(fetched.body), fetched.url);
    } catch {
      throw new Error('The watcher source did not return valid JSON.');
    }
  } else {
    candidates = parseHtmlPage(fetched.body, fetched.url);
  }
  const matching = candidates.filter((candidate) =>
    candidateMatches(candidate, spec.query, spec.constraints),
  );
  if (matching.length > 0)
    return { candidates: matching.slice(0, 20), sourceUrl: fetched.url.toString() };
  const fallback = await evaluateWithModel(
    router,
    userId,
    spec.query,
    fetched.url.toString(),
    fetched.body,
  );
  return { candidates: fallback === null ? [] : [fallback], sourceUrl: fetched.url.toString() };
};

const matchExchange = async (db: PrismaClient): Promise<number> => {
  const [haves, wants, blocks] = await Promise.all([
    db.exchangeItem.findMany({ where: { direction: 'HAVE', active: true, deletedAt: null } }),
    db.exchangeItem.findMany({ where: { direction: 'WANT', active: true, deletedAt: null } }),
    db.block.findMany({ where: { deletedAt: null } }),
  ]);
  const blocked = new Set(
    blocks.flatMap((block) => [
      `${block.blockerUserId}:${block.blockedUserId}`,
      `${block.blockedUserId}:${block.blockerUserId}`,
    ]),
  );
  let proposals = 0;
  for (const want of wants) {
    const queryWords = new Set(
      `${want.title} ${want.description} ${want.category}`.toLowerCase().match(/[a-z0-9]{3,}/gu) ??
        [],
    );
    const ranked = haves
      .filter(
        (have) => have.userId !== want.userId && !blocked.has(`${have.userId}:${want.userId}`),
      )
      .map((have) => ({
        have,
        score:
          (have.category.toLowerCase() === want.category.toLowerCase() ? 4 : 0) +
          (`${have.title} ${have.description}`.toLowerCase().match(/[a-z0-9]{3,}/gu) ?? []).filter(
            (word) => queryWords.has(word),
          ).length,
      }))
      .filter(({ score }) => score > 0)
      .toSorted((left, right) => right.score - left.score);
    const top = ranked[0]?.have;
    if (top === undefined) continue;
    const existing = await db.exchangeProposal.findUnique({
      where: { haveItemId_wantItemId: { haveItemId: top.id, wantItemId: want.id } },
    });
    if (existing !== null) continue;
    await db.exchangeProposal.create({
      data: {
        haveItemId: top.id,
        wantItemId: want.id,
        terms: {
          summary: `Proposed direct handoff: ${top.title} for ${want.title}.`,
          itemCondition: top.condition,
          suggestedPlace: 'A staffed public campus location',
          suggestedWindow: 'Agree on a broad time window after mutual acceptance',
          payment: false,
        },
        negotiation: [
          {
            side: 'have',
            text: `Offered ${top.title} in ${top.condition ?? 'unspecified'} condition.`,
          },
          {
            side: 'want',
            text: `Requested ${want.title}; boundaries: ${want.willTradeFor ?? 'direct handoff only'}.`,
          },
          {
            side: 'system',
            text: 'Proposed a public-place handoff. ORBIT will not process payment.',
          },
        ],
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    proposals += 1;
  }
  return proposals;
};

export const runWatchers = async (
  db: PrismaClient,
  router?: ModelRouter,
  searchConfig?: SearchApiConfig,
): Promise<{ hits: number; proposals: number }> => {
  const proposals = await matchExchange(db);
  const due = await db.watcher.findMany({
    where: {
      active: true,
      deletedAt: null,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
    },
  });
  let hits = 0;
  for (const watcher of due) {
    const parsed = watcherSpecSchema.safeParse(watcher.spec);
    if (!parsed.success) {
      await db.watcher.update({
        where: { id: watcher.id },
        data: { active: false, lastRunAt: new Date() },
      });
      continue;
    }
    try {
      if (parsed.data.source === 'orbit') {
        const words = parsed.data.query.toLowerCase().match(/[a-z0-9]{3,}/gu) ?? [];
        const items = await db.exchangeItem.findMany({
          where: { active: true, deletedAt: null, userId: { not: watcher.userId } },
          take: 100,
        });
        const ranked = items
          .map((item) => ({
            item,
            score: words.filter((word) =>
              `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(word),
            ).length,
          }))
          .filter(({ score }) => score > 0)
          .toSorted((left, right) => right.score - left.score)
          .slice(0, 10);
        for (const { item } of ranked) {
          const key = watcherDedupeKey(watcher.id, item.id);
          const existing = await db.watcherHit.findUnique({
            where: { watcherId_dedupeKey: { watcherId: watcher.id, dedupeKey: key } },
          });
          if (existing !== null) continue;
          await db.watcherHit.create({
            data: {
              watcherId: watcher.id,
              dedupeKey: key,
              payload: {
                title: item.title,
                detail: item.description,
                href: `/exchange/${item.id}`,
                matchedQuery: parsed.data.query,
                source: 'ORBIT exchange',
                changeSummary: 'A new exchange item matched.',
              },
            },
          });
          await queuePush(db, {
            userId: watcher.userId,
            eventType: 'watcher',
            title: watcher.title,
            body: item.title,
            deepLink: `orbit://watcher/${watcher.id}`,
          });
          hits += 1;
        }
      } else if (parsed.data.source === 'web') {
        const result = await webCandidates(watcher.userId, parsed.data, router, searchConfig);
        for (const candidate of result.candidates) {
          const key = watcherDedupeKey(watcher.id, candidate.stableId);
          const existing = await db.watcherHit.findUnique({
            where: { watcherId_dedupeKey: { watcherId: watcher.id, dedupeKey: key } },
          });
          if (existing !== null) continue;
          await db.watcherHit.create({
            data: {
              watcherId: watcher.id,
              dedupeKey: key,
              payload: {
                title: candidate.title,
                detail: candidate.detail,
                href: candidate.href,
                source: result.sourceUrl,
                extraction: candidate.extraction,
                changeSummary:
                  candidate.priceCents === undefined
                    ? 'New or changed matching content was detected.'
                    : `Matching price detected: ${candidate.currency === undefined ? '' : `${candidate.currency} `}${(candidate.priceCents / 100).toFixed(2)}.`,
                candidate: {
                  stableId: candidate.stableId,
                  ...(candidate.priceCents === undefined
                    ? {}
                    : { priceCents: candidate.priceCents }),
                  ...(candidate.currency === undefined ? {} : { currency: candidate.currency }),
                },
              },
            },
          });
          await queuePush(db, {
            userId: watcher.userId,
            eventType: 'watcher',
            title: watcher.title,
            body: candidate.title,
            deepLink: `orbit://watcher/${watcher.id}`,
          });
          hits += 1;
        }
      }
      await db.watcher.update({
        where: { id: watcher.id },
        data: { lastRunAt: new Date(), nextRunAt: nextDate(watcher.schedule) },
      });
      await db.activityLog.create({
        data: {
          userId: watcher.userId,
          actorType: 'AGENT',
          action: 'watcher.checked',
          targetType: 'Watcher',
          targetId: watcher.id,
          payload: { source: parsed.data.source, status: 'ok' },
        },
      });
    } catch (error: unknown) {
      await db.watcher.update({
        where: { id: watcher.id },
        data: { lastRunAt: new Date(), nextRunAt: nextDate(watcher.schedule) },
      });
      await db.activityLog.create({
        data: {
          userId: watcher.userId,
          actorType: 'SYSTEM',
          action: 'watcher.check_failed',
          targetType: 'Watcher',
          targetId: watcher.id,
          payload: {
            source: parsed.data.source,
            error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown watcher error',
          },
        },
      });
    }
  }
  return { hits, proposals };
};
