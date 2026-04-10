import * as cheerio from 'cheerio';

async function test() {
  const response = await fetch(`https://novelfull.com/search?keyword=martial`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  const url = $('.col-truyen-main .row').first().find('h3.truyen-title a').attr('href');
  console.log('Found URL:', url);
  
  if (url) {
    const fullUrl = `https://novelfull.com${url}`;
    const res2 = await fetch(fullUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html2 = await res2.text();
    const $2 = cheerio.load(html2);
    
    const lastPageUrl = $2('ul.pagination li.last a').attr('href');
    let maxPage = 1;
    if (lastPageUrl) {
      const match = lastPageUrl.match(/page=(\d+)/);
      if (match) maxPage = parseInt(match[1], 10);
    }
    console.log('Max page:', maxPage);
  }
}
test();
