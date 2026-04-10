import * as cheerio from 'cheerio';

async function test() {
  const query = 'martial';
  const response = await fetch(`https://noveltrust.com/search?keyword=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  const results: any[] = [];
  
  $('.novel-list .novel-item').each((_, el) => {
    const title = $(el).find('.novel-title a').text().trim();
    const url = $(el).find('.novel-title a').attr('href');
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
  console.log(results.slice(0, 2));
  
  if (results.length > 0) {
    const novelRes = await fetch(results[0].url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const novelHtml = await novelRes.text();
    const $n = cheerio.load(novelHtml);
    
    // NovelFire loads chapters via ajax
    const novelId = $n('#novel').attr('data-novel-id');
    console.log('Novel ID:', novelId);
    
    if (novelId) {
      const chRes = await fetch(`https://noveltrust.com/ajax/chapter-archive?novelId=${novelId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const chHtml = await chRes.text();
      const $c = cheerio.load(chHtml);
      const chapters: any[] = [];
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
      console.log('Chapters:', chapters.length, chapters.slice(0, 2));
      
      if (chapters.length > 0) {
        const textRes = await fetch(chapters[0].url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const textHtml = await textRes.text();
        const $t = cheerio.load(textHtml);
        let text = '';
        $t('#chapter-container p').each((_, el) => {
          text += $t(el).text().trim() + '\n\n';
        });
        console.log('Text length:', text.length);
      }
    }
  }
}
test();
