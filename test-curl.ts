async function test() {
  const res = await fetch('https://freewebnovel.com/martial-god-asura.html', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  console.log(text.substring(0, 500));
}
test();
