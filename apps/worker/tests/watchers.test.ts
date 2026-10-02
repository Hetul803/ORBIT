import { describe, expect, it } from 'vitest';

import {
  assertPublicWatcherUrl,
  candidateMatches,
  parseFeed,
  parseHtmlPage,
  parseJsonCandidates,
  watcherDedupeKey,
} from '../src/jobs/watchers.js';

describe('public web watchers', () => {
  it('rejects local, authenticated, login, and disallowed social URLs before fetching', async () => {
    await expect(assertPublicWatcherUrl('http://localhost:4100/private')).rejects.toThrow();
    await expect(assertPublicWatcherUrl('https://user:pass@example.com/feed')).rejects.toThrow();
    await expect(assertPublicWatcherUrl('https://example.com/login')).rejects.toThrow();
    await expect(assertPublicWatcherUrl('https://instagram.com/public')).rejects.toThrow();
  });

  it('parses RSS and Atom items with stable change-aware identifiers', () => {
    const base = new URL('https://example.com/feed');
    const rss = parseFeed(
      '<rss><channel><item><guid>7</guid><title>Grant opens</title><link>https://example.com/g/7</link><description>Deadline Friday</description></item></channel></rss>',
      base,
    );
    const atom = parseFeed(
      '<feed><entry><id>a9</id><title>Research role</title><link href="/role/9"/><summary>Apply now</summary></entry></feed>',
      base,
    );
    expect(rss[0]).toMatchObject({ title: 'Grant opens', extraction: 'rss' });
    expect(atom[0]).toMatchObject({ href: 'https://example.com/role/9', extraction: 'atom' });
    expect(parseFeed(rss[0]?.detail === 'Deadline Friday' ? '<rss />' : '', base)).toEqual([]);
  });

  it('parses JSON, JSON-LD, HTML prices, and evaluates constraints without an LLM', () => {
    const base = new URL('https://shop.example.com/books');
    const json = parseJsonCandidates(
      { results: [{ id: 'book-1', title: 'Systems Book', price: 29.5, url: '/book-1' }] },
      base,
    );
    const html = parseHtmlPage(
      '<html><head><title>Systems Book</title><meta name="description" content="A careful guide for builders"><meta itemprop="price" content="29.50"></head></html>',
      base,
    );
    const jsonLd = parseHtmlPage(
      '<script type="application/ld+json">{"name":"Systems Book","description":"Guide","url":"/book-1","price":"29.50"}</script>',
      base,
    );
    expect(json[0]).toMatchObject({ priceCents: 2950, extraction: 'json' });
    expect(html[0]).toMatchObject({ priceCents: 2950, extraction: 'html' });
    expect(jsonLd[0]).toMatchObject({ title: 'Systems Book', extraction: 'structured_html' });
    const first = json[0];
    if (first === undefined) throw new Error('Expected the JSON parser to return one candidate.');
    expect(candidateMatches(first, 'systems book under $40', { maximumCents: 4000 })).toBe(true);
    expect(candidateMatches(first, 'systems book under $20', { maximumCents: 2000 })).toBe(false);
  });

  it('deduplicates the same target deterministically while preserving changed targets', () => {
    expect(watcherDedupeKey('watcher-1', 'item-1')).toBe(watcherDedupeKey('watcher-1', 'item-1'));
    expect(watcherDedupeKey('watcher-1', 'item-1')).not.toBe(
      watcherDedupeKey('watcher-1', 'item-2'),
    );
  });
});
