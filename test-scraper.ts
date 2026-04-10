import * as cheerio from 'cheerio';

async function testNovelFire() {
  console.log('Testing NovelFire...');
  const url = 'https://novelfire.net/book/martial-god-asura';
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  console.log('Title:', $('.novel-title').text().trim());
  console.log('Novel ID:', $('#novel').attr('data-novel-id'));
  console.log('Chapters in DOM:', $('.chapter-list li a').length);
  
  if (html.includes('Just a moment...')) {
    console.log('Cloudflare blocked the request.');
  }
}

async function testLightNovelPub() {
  console.log('\nTesting LightNovelPub...');
  const url = 'https://lightnovelpub.me/novel/martial-god-asura-19072354';
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
  const html = await response.text();
  const $ = cheerio.load(html);
  console.log('Title:', $('.novel-title').text().trim());
  console.log('Chapters in DOM:', $('.chapter-list li a').length);
  if (html.includes('Just a moment...')) {
    console.log('Cloudflare blocked the request.');
  }
}

async function testFreeWebNovel() {
  console.log('\nTesting FreeWebNovel...');
  const url = 'https://freewebnovel.com/martial-god-asura.html';
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
  const html = await response.text();
  const $ = cheerio.load(html);
  console.log('Title:', $('h1.tit').text().trim());
  console.log('Chapters in DOM:', $('#m-chs li a').length);
}

async function run() {
  await testNovelFire();
  await testLightNovelPub();
  await testFreeWebNovel();
}
run();
