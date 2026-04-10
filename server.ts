import express from 'express';
import { createServer as createViteServer } from 'vite';
import * as cheerio from 'cheerio';
import path from 'path';
import { EdgeTTS } from 'node-edge-tts';
import { randomUUID } from 'crypto';
import os from 'os';
import fs from 'fs/promises';

// --- Scraper Interfaces ---
interface SearchResult {
  title: string;
  url: string;
  cover: string;
  author: string;
  sourceId: string;
  sourceName: string;
}

interface Scraper {
  id: string;
  name: string;
  canHandle: (url: string) => boolean;
  search: (query: string) => Promise<SearchResult[]>;
  getNovel: (url: string) => Promise<any>;
  getChapter: (url: string) => Promise<string>;
}

const scrapers: Scraper[] = [
  {
    id: 'novelfire',
    name: 'NovelFire',
    canHandle: (url) => url.includes('novelfire.net'),
    search: async (query) => {
      const response = await fetch(`https://novelfire.net/search?keyword=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      const results: SearchResult[] = [];
      
      $('.novel-item').each((_, el) => {
        const title = $(el).find('.novel-title').text().trim();
        const url = $(el).find('a').first().attr('href');
        const cover = $(el).find('img').attr('src');
        if (title && url) {
          results.push({
            title,
            url: url.startsWith('http') ? url : `https://novelfire.net${url}`,
            cover: cover ? (cover.startsWith('http') ? cover : `https://novelfire.net${cover}`) : '',
            author: 'Unknown',
            sourceId: 'novelfire',
            sourceName: 'NovelFire'
          });
        }
      });
      return results;
    },
    getNovel: async (url) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const title = $('.novel-title').text().trim();
      const cover = $('.novel-cover img').attr('src');
      const author = $('.author a').text().trim() || 'Unknown';
      
      // NovelFire loads chapters via ajax or they are in a list
      // Let's check if they are in the DOM directly
      const chapters: any[] = [];
      $('#ch-page-1 li a').each((_, el) => {
        const chTitle = $(el).find('.chapter-title').text().trim() || $(el).text().trim();
        const chUrl = $(el).attr('href');
        if (chTitle && chUrl) {
          chapters.push({
            id: chUrl,
            title: chTitle,
            url: chUrl.startsWith('http') ? chUrl : `https://novelfire.net${chUrl}`,
            text: ''
          });
        }
      });
      
      // If chapters are not in #ch-page-1, try a more generic selector
      if (chapters.length === 0) {
        $('.chapter-list li a').each((_, el) => {
          const chTitle = $(el).find('.chapter-title').text().trim() || $(el).text().trim();
          const chUrl = $(el).attr('href');
          if (chTitle && chUrl) {
            chapters.push({
              id: chUrl,
              title: chTitle,
              url: chUrl.startsWith('http') ? chUrl : `https://novelfire.net${chUrl}`,
              text: ''
            });
          }
        });
      }
      
      return {
        id: url,
        title,
        cover: cover ? (cover.startsWith('http') ? cover : `https://novelfire.net${cover}`) : '',
        author,
        sourceUrl: url,
        chapters
      };
    },
    getChapter: async (url) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      let text = '';
      $('#chapter-container p').each((_, el) => {
        text += $(el).text().trim() + '\n\n';
      });
      
      if (!text) {
        $('#chapter-content p').each((_, el) => {
          text += $(el).text().trim() + '\n\n';
        });
      }
      
      return text.trim();
    }
  },
  {
    id: 'lightnovelpub',
    name: 'LightNovelPub',
    canHandle: (url) => url.includes('lightnovelpub.me'),
    search: async (query) => {
      const response = await fetch(`https://lightnovelpub.me/search?keyword=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      const results: SearchResult[] = [];
      
      $('.novel-list .novel-item').each((_, el) => {
        const title = $(el).find('.novel-title a').text().trim();
        const url = $(el).find('.novel-title a').attr('href');
        const cover = $(el).find('img').attr('src');
        if (title && url) {
          results.push({
            title,
            url: url.startsWith('http') ? url : `https://lightnovelpub.me${url}`,
            cover: cover ? (cover.startsWith('http') ? cover : `https://lightnovelpub.me${cover}`) : '',
            author: 'Unknown',
            sourceId: 'lightnovelpub',
            sourceName: 'LightNovelPub'
          });
        }
      });
      return results;
    },
    getNovel: async (url) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const title = $('.novel-title').text().trim();
      const cover = $('.novel-cover img').attr('src');
      const author = $('.author a').text().trim() || 'Unknown';
      
      const chapters: any[] = [];
      $('.chapter-list li a').each((_, el) => {
        const chTitle = $(el).find('.chapter-title').text().trim() || $(el).text().trim();
        const chUrl = $(el).attr('href');
        if (chTitle && chUrl) {
          chapters.push({
            id: chUrl,
            title: chTitle,
            url: chUrl.startsWith('http') ? chUrl : `https://lightnovelpub.me${chUrl}`,
            text: ''
          });
        }
      });
      
      return {
        id: url,
        title,
        cover: cover ? (cover.startsWith('http') ? cover : `https://lightnovelpub.me${cover}`) : '',
        author,
        sourceUrl: url,
        chapters
      };
    },
    getChapter: async (url) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      let text = '';
      $('#chapter-container p').each((_, el) => {
        text += $(el).text().trim() + '\n\n';
      });
      
      return text.trim();
    }
  },
  {
    id: 'noveltrust',
    name: 'NovelTrust',
    canHandle: (url) => url.includes('noveltrust.com'),
    search: async (query) => {
      const response = await fetch(`https://noveltrust.com/search?keyword=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      const results: SearchResult[] = [];
      
      $('.novel-item').each((_, el) => {
        const title = $(el).find('.novel-title').text().trim();
        const url = $(el).find('a').first().attr('href');
        const cover = $(el).find('img').attr('src');
        if (title && url) {
          results.push({
            title,
            url: url.startsWith('http') ? url : `https://noveltrust.com${url}`,
            cover: cover ? (cover.startsWith('http') ? cover : `https://noveltrust.com${cover}`) : '',
            author: 'Unknown',
            sourceId: 'noveltrust',
            sourceName: 'NovelTrust'
          });
        }
      });
      return results;
    },
    getNovel: async (url) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const title = $('.novel-title').text().trim();
      const cover = $('.novel-cover img').attr('src');
      const author = $('.author a').text().trim() || 'Unknown';
      
      const chapters: any[] = [];
      const novelId = $('#novel').attr('data-novel-id');
      
      if (novelId) {
        const chRes = await fetch(`https://noveltrust.com/ajax/chapter-archive?novelId=${novelId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const chHtml = await chRes.text();
        const $c = cheerio.load(chHtml);
        $c('li a').each((_, el) => {
          const chTitle = $c(el).find('.chapter-title').text().trim() || $c(el).text().trim();
          const chUrl = $c(el).attr('href');
          if (chTitle && chUrl) {
            chapters.push({
              id: chUrl,
              title: chTitle,
              url: chUrl.startsWith('http') ? chUrl : `https://noveltrust.com${chUrl}`,
              text: ''
            });
          }
        });
      }
      
      return {
        id: url,
        title,
        cover: cover ? (cover.startsWith('http') ? cover : `https://noveltrust.com${cover}`) : '',
        author,
        sourceUrl: url,
        chapters
      };
    },
    getChapter: async (url) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      let text = '';
      $('#chapter-container p').each((_, el) => {
        text += $(el).text().trim() + '\n\n';
      });
      
      return text.trim();
    }
  },
  {
    id: 'wuxiaworldeu',
    name: 'WuxiaWorld.eu',
    canHandle: (url) => url.includes('wuxiaworld.eu'),
    search: async (query) => {
      const response = await fetch(`https://www.wuxiaworld.eu/search/${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      const nextData = $('#__NEXT_DATA__').html();
      const results: SearchResult[] = [];
      if (nextData) {
        try {
          const data = JSON.parse(nextData);
          const queries = data.props.pageProps.dehydratedState.queries;
          const searchData = queries.find((q: any) => q.state.data && q.state.data.results);
          if (searchData && searchData.state.data.results) {
            searchData.state.data.results.forEach((novel: any) => {
              results.push({
                title: novel.name,
                url: `https://www.wuxiaworld.eu/novel/${novel.slug}`,
                cover: novel.image ? `https://www.wuxiaworld.eu${novel.image}` : undefined,
                author: 'Unknown',
                sourceId: 'wuxiaworldeu',
                sourceName: 'WuxiaWorld.eu'
              });
            });
          }
        } catch (e) {
          console.error('WuxiaWorldEU search parse error:', e);
        }
      }
      return results;
    },
    getNovel: async (url) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const $ = cheerio.load(html);
      const nextData = $('#__NEXT_DATA__').html();
      
      let title = '';
      let cover = '';
      let author = '';
      const chapters: any[] = [];
      
      if (nextData) {
        try {
          const data = JSON.parse(nextData);
          const queries = data.props.pageProps.dehydratedState.queries;
          const novelData = queries.find((q: any) => q.state.data && q.state.data.slug);
          
          if (novelData && novelData.state.data) {
            const novel = novelData.state.data;
            title = novel.name;
            cover = novel.image ? `https://www.wuxiaworld.eu${novel.image}` : '';
            author = novel.author?.name || 'Unknown';
            
            if (novel.chapters && Array.isArray(novel.chapters)) {
              novel.chapters.forEach((ch: any) => {
                chapters.push({
                  id: ch.slug,
                  title: ch.name || `Chapter ${ch.order}`,
                  url: `https://www.wuxiaworld.eu/novel/${novel.slug}/${ch.slug}`,
                  text: ''
                });
              });
            }
          }
        } catch (e) {
          console.error('WuxiaWorldEU novel parse error:', e);
        }
      }
      
      return { title, cover, author, chapters };
    },
    getChapter: async (url) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const $ = cheerio.load(html);
      const nextData = $('#__NEXT_DATA__').html();
      
      let content = '';
      if (nextData) {
        try {
          const data = JSON.parse(nextData);
          const queries = data.props.pageProps.dehydratedState.queries;
          const chapterData = queries.find((q: any) => q.state.data && q.state.data.text);
          if (chapterData && chapterData.state.data.text) {
            const chapterHtml = chapterData.state.data.text;
            const $c = cheerio.load(chapterHtml);
            const paragraphs: string[] = [];
            $c('p').each((_, el) => {
              const text = $c(el).text().trim();
              if (text) paragraphs.push(text);
            });
            content = paragraphs.join('\n\n');
          }
        } catch (e) {
          console.error('WuxiaWorldEU chapter parse error:', e);
        }
      }
      return content;
    }
  },
  {
    id: 'freewebnovel',
    name: 'FreeWebNovel',
    canHandle: (url) => url.includes('freewebnovel.com'),
    search: async (query) => {
      const response = await fetch(`https://freewebnovel.com/search?searchkey=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const results: SearchResult[] = [];
      $('.li-row').each((_, el) => {
        const title = $(el).find('.tit a').text().trim() || $(el).find('h3 a').text().trim();
        const url = $(el).find('.tit a').attr('href') || $(el).find('h3 a').attr('href') || $(el).find('a').first().attr('href');
        const cover = $(el).find('.pic img').attr('src') || $(el).find('img').first().attr('src');
        if (title && url) {
          results.push({
            title,
            url: url.startsWith('http') ? url : `https://freewebnovel.com${url}`,
            cover: cover ? (cover.startsWith('http') ? cover : `https://freewebnovel.com${cover}`) : '',
            author: 'Unknown',
            sourceId: 'freewebnovel',
            sourceName: 'FreeWebNovel'
          });
        }
      });
      return results;
    },
    getNovel: async (url) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const title = $('h1.tit').text().trim();
      const cover = $('.pic img').attr('src');
      const author = $('.txt .item').first().text().replace('Author:', '').trim() || 'Unknown';
      
      const chapters: any[] = [];
      $('#m-chs li a').each((_, el) => {
        const chTitle = $(el).text().trim();
        const chUrl = $(el).attr('href');
        if (chTitle && chUrl) {
          chapters.push({
            id: chUrl,
            title: chTitle,
            url: chUrl.startsWith('http') ? chUrl : `https://freewebnovel.com${chUrl}`,
            text: ''
          });
        }
      });
      
      return {
        id: url,
        title,
        cover: cover ? (cover.startsWith('http') ? cover : `https://freewebnovel.com${cover}`) : '',
        author,
        sourceUrl: url,
        chapters
      };
    },
    getChapter: async (url) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      let text = '';
      $('.txt p').each((_, el) => {
        text += $(el).text().trim() + '\n\n';
      });
      
      return text.trim();
    }
  },
  {
    id: 'royalroad',
    name: 'Royal Road',
    canHandle: (url) => url.includes('royalroad.com'),
    search: async (query) => {
      const response = await fetch(`https://www.royalroad.com/fictions/search?title=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      const results: SearchResult[] = [];
      $('.fiction-list-item').each((_, el) => {
        const titleEl = $(el).find('.fiction-title a');
        const title = titleEl.text().trim();
        const url = titleEl.attr('href');
        const cover = $(el).find('img').attr('src');
        const author = $(el).find('.author').text().trim();
        if (title && url) {
          results.push({
            title,
            url: url.startsWith('http') ? url : `https://www.royalroad.com${url}`,
            cover: cover?.startsWith('http') ? cover : `https://www.royalroad.com${cover}`,
            author,
            sourceId: 'royalroad',
            sourceName: 'Royal Road'
          });
        }
      });
      return results;
    },
    getNovel: async (url) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const $ = cheerio.load(html);
      const title = $('h1.fic-title').text().trim();
      const cover = $('.fic-header img').attr('src');
      const author = $('h4.fic-author a').text().trim();
      
      const chapters: any[] = [];
      $('table#chapters tbody tr').each((_, el) => {
        const chUrl = $(el).attr('data-url');
        const chTitle = $(el).find('td').first().text().trim();
        if (chTitle && chUrl) {
          chapters.push({
            id: chUrl,
            title: chTitle,
            url: chUrl.startsWith('http') ? chUrl : `https://www.royalroad.com${chUrl}`,
            text: ''
          });
        }
      });
      
      return {
        title,
        cover: cover?.startsWith('http') ? cover : `https://www.royalroad.com${cover}`,
        author,
        chapters
      };
    },
    getChapter: async (url) => {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const $ = cheerio.load(html);
      $('.chapter-content').find('script, style, iframe, ins').remove();
      const paragraphs: string[] = [];
      $('.chapter-content p').each((_, el) => {
        const text = $(el).text().trim();
        if (text) paragraphs.push(text);
      });
      return paragraphs.join('\n\n');
    }
  }
];

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post('/api/search', async (req, res) => {
    try {
      const { query, source } = req.body;
      let activeScrapers = scrapers;
      if (source && source !== 'all') {
        activeScrapers = scrapers.filter(s => s.id === source);
      }

      const resultsPromises = activeScrapers.map(scraper =>
        scraper.search(query).catch(err => {
          console.error(`Scraper ${scraper.name} failed:`, err);
          return [];
        })
      );

      const resultsArrays = await Promise.all(resultsPromises);
      const results = resultsArrays.flat();
      res.json({ results });
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Failed to search' });
    }
  });

  app.post('/api/novel', async (req, res) => {
    try {
      const { url } = req.body;
      const scraper = scrapers.find(s => s.canHandle(url));
      if (!scraper) throw new Error('No scraper found for this URL');
      const novel = await scraper.getNovel(url);
      res.json(novel);
    } catch (error) {
      console.error('Novel error:', error);
      res.status(500).json({ error: 'Failed to fetch novel details' });
    }
  });

  app.post('/api/chapter', async (req, res) => {
    try {
      const { url } = req.body;
      const scraper = scrapers.find(s => s.canHandle(url));
      if (!scraper) throw new Error('No scraper found for this URL');
      const text = await scraper.getChapter(url);
      res.json({ text });
    } catch (error) {
      console.error('Chapter error:', error);
      res.status(500).json({ error: 'Failed to fetch chapter' });
    }
  });

  // --- Premium TTS API ---
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voice, apiKey, baseUrl, provider } = req.body;
      
      if (provider === 'edge') {
        const edgeVoice = voice || 'en-US-AriaNeural';
        const tts = new EdgeTTS({
          voice: edgeVoice,
          lang: edgeVoice.split('-').slice(0, 2).join('-'),
          outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
        });
        
        const tempFilePath = path.join(os.tmpdir(), `tts-${randomUUID()}.mp3`);
        await tts.ttsPromise(text, tempFilePath);
        
        const buffer = await fs.readFile(tempFilePath);
        await fs.unlink(tempFilePath).catch(console.error);
        
        res.set({
          'Content-Type': 'audio/mpeg',
          'Content-Length': buffer.length
        });
        return res.send(buffer);
      }

      // Default to OpenAI/Compatible API
      const finalApiKey = apiKey || process.env.OPENAI_API_KEY;

      if (!finalApiKey) {
        return res.status(401).json({ error: 'API key is missing. Please enter it in the settings.' });
      }

      const finalBaseUrl = baseUrl || 'https://api.openai.com/v1';
      const endpoint = finalBaseUrl.endsWith('/') ? `${finalBaseUrl}audio/speech` : `${finalBaseUrl}/audio/speech`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${finalApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: voice || 'alloy'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length
      });
      res.send(buffer);
    } catch (error) {
      console.error('TTS error:', error);
      res.status(500).json({ error: 'Failed to generate audio' });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
