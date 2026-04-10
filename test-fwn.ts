import * as cheerio from 'cheerio';

async function test() {
  const url = 'https://novelfire.net/book/martial-god-asura';
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const novelId = $('#novel').attr('data-novel-id') || $('[data-novel-id]').attr('data-novel-id');
  console.log('novelId:', novelId);
  
  if (novelId) {
    const chRes = await fetch(`https://novelfire.net/ajax/chapter-archive?novelId=${novelId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const chHtml = await chRes.text();
    const $c = cheerio.load(chHtml);
    const chapters: any[] = [];
    $c('li a').each((_, el) => {
      const chTitle = $c(el).find('.chapter-title').text().trim() || $c(el).text().trim();
      const chUrl = $c(el).attr('href');
      if (chTitle && chUrl) {
        chapters.push({ title: chTitle, url: chUrl });
      }
    });
    console.log('Chapters found:', chapters.length);
  } else {
    console.log('No novelId found. HTML snippet:', html.substring(0, 500));
  }
}
test();
