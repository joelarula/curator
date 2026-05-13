import Parser from 'rss-parser';
const parser = new Parser();
async function run() {
    const feed = await parser.parseURL("http://uudised.err.ee/uudised_rss.php");
    console.log(feed.items.map((i: any) => ({ link: i.link, type: typeof i.link, isArray: Array.isArray(i.link) })).slice(0, 5));
}
run();
