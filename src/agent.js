import { CATALOG, product, total, MAX_QUANTITY } from './catalog.js';

export const normalize = value => String(value).normalize('NFKC').toLowerCase().trim().replace(/[.!?。！？]+$/u, '').trim();
const numbers = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, 'ゼロ': 0, 'ひとつ': 1, 'ふたつ': 2, 'みっつ': 3, '四つ': 4, '五つ': 5, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
const numberRE = /\d+|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty)\b|ひとつ|ふたつ|みっつ|ゼロ|[一二三四五六七八九十]/gu;
const quantityOf = text => {
  const found = [...text.matchAll(numberRE)];
  if (found.length > 1) return NaN;
  return found.length ? (numbers[found[0][0]] ?? Number(found[0][0])) : null;
};
const reject = (reason = 'unknown') => ({ reason, tools: [] });

export function parseOrder(input, cart = {}) {
  let text = normalize(input);
  if (!text || text.length > 500) return reject();
  if (/^(yes|yes please|confirm|that's right|correct|はい|はいお願いします|お願いします|確定|それでお願いします)$/u.test(text)) return { control: 'yes' };
  if (/^(no|no thanks|いいえ|違います)$/u.test(text)) return { control: 'no' };
  if (/^(review(?: order)?|check ?out|pay|お会計|注文確認|確認|会計)$/u.test(text)) return { control: 'confirm' };
  if (/^(clear(?: order| cart)?|cancel(?: order| everything)?|reset|全部キャンセル|注文を取り消し|リセット)$/u.test(text)) return { control: 'clear' };
  if (/\bor\b|または|それとも|か紅茶|かコーヒー|かクロワッサン/u.test(text)) return reject('choose');
  // Negative preferences and conditions need clarification, not a guessed add.
  if (/\b(?:not|don't|without|unless|if|except)\b|いらない|不要|以外|なし|なら/u.test(text)) return reject('choose');
  if (/-\s*\d|\d[.,]\d|[一二三四五六七八九十]{2,}|\b(?:thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|hundred|dozen)\b/u.test(text)) return reject('quantity');
  const tools = [];
  if (/to go|take ?away|持ち帰り|テイクアウト/u.test(text)) {
    tools.push({ tool: 'set_fulfillment', args: { value: 'takeaway' } });
    text = text.replace(/(?:to go|take ?away|持ち帰り(?:で)?|テイクアウト(?:で)?)/gu, '');
  } else if (/eat in|dine in|店内/u.test(text)) {
    tools.push({ tool: 'set_fulfillment', args: { value: 'here' } });
    text = text.replace(/eat in|dine in|店内(?:で)?/gu, '');
  }
  const clauses = text.split(/\s+and\s+|[,、;。]|と/u).map(s => s.trim()).filter(Boolean);
  let itemCount = 0;
  for (const clause of clauses) {
    const matches = CATALOG.filter(p => p.aliases.some(alias => /[a-z]/u.test(alias) ? new RegExp(`\\b${alias}\\b`, 'u').test(clause) : clause.includes(alias)));
    if (!matches.length && !clause.replace(/please|お願いします|ください|で/gu, '').trim()) continue;
    let p = matches[0];
    if (!matches.length && /make it|それを/u.test(clause) && Object.keys(cart).length === 1) p = product(Object.keys(cart)[0]);
    if (!p || matches.length > 1) return reject(matches.length > 1 ? 'choose' : 'unknown');
    const q = quantityOf(clause);
    if (q !== null && (!Number.isInteger(q) || q < 0 || q > MAX_QUANTITY)) return reject('quantity');
    const remove = /\b(?:remove|cancel|delete)\b|キャンセル|削除|取り消し|減らして/u.test(clause);
    const set = /\b(?:make|set|change)\b|にして|に変更|それを/u.test(clause);
    // Only allow the small supported grammar. Unrecognized qualifiers stay out of the cart.
    let residue = clause;
    for (const alias of p.aliases) residue = residue.replaceAll(alias, '');
    residue = residue.replace(numberRE, '').replace(/\b(?:i|would|like|want|a|an|the|of|cups?|please|add|more|remove|cancel|delete|make|it|set|change|to)\b|(?:を|は|が|にして|に変更|追加|ください|お願いします|個|杯|つ|キャンセル|削除|取り消し|減らして|それを)/gu, '').replace(/\s/gu, '');
    if (residue) return reject();
    if (q === 0 && !set && !remove) return reject('quantity');
    tools.push({ tool: remove ? 'remove_item' : set ? 'set_quantity' : 'add_item', args: { id: p.id, quantity: remove ? q : q ?? 1 } });
    itemCount++;
  }
  return itemCount || tools.length ? { tools } : reject();
}

export class Agent {
  constructor() {
    this.cart = {}; this.phase = 'editing'; this.fulfillment = 'takeaway';
    this.revision = 0; this.confirmedRevision = null; this.trace = [];
    this.question = ''; this.suggestion = null;
  }
  get locked() { return ['processing', 'complete', 'uncertain'].includes(this.phase); }
  invalidate() { this.revision++; this.confirmedRevision = null; this.phase = 'editing'; this.question = ''; this.suggestion = null; }
  tool(name, args = {}) {
    if (this.locked) throw new Error('The order is locked.');
    if (['add_item', 'remove_item', 'set_quantity'].includes(name)) {
      const { id, quantity: q } = args;
      if (!product(id)) throw new Error('Unknown product.');
      if (!(name === 'remove_item' && q === null) && (!Number.isInteger(q) || q < 0 || q > MAX_QUANTITY)) throw new Error('Quantity must be an integer from 0 to 20.');
      const previous = this.cart[id] ?? 0;
      const next = name === 'add_item' ? previous + q : name === 'remove_item' ? Math.max(0, previous - (q ?? previous)) : q;
      if (next > MAX_QUANTITY) throw new Error('Maximum 20 per product.');
      if (next) this.cart[id] = next; else delete this.cart[id];
      this.invalidate();
    } else if (name === 'set_fulfillment') {
      if (!['takeaway', 'here'].includes(args.value)) throw new Error('Unknown fulfillment.');
      this.fulfillment = args.value; this.invalidate();
    } else if (name === 'confirm') {
      if (!total(this.cart)) { this.question = 'empty'; return; }
      this.phase = 'review'; this.confirmedRevision = null; this.question = '';
    } else if (name === 'checkout') {
      if (this.phase !== 'review' || !total(this.cart) || this.question || this.suggestion) throw new Error('Review the cart before checkout.');
      this.confirmedRevision = this.revision; this.phase = 'checkout';
    } else throw new Error('Unknown tool.');
    this.trace.push({ tool: name, args: { ...args }, revision: this.revision });
    this.trace = this.trace.slice(-40);
  }
  turn(input) {
    if (this.locked) return;
    const parsed = parseOrder(input, this.cart);
    this.question = '';
    if (parsed.control === 'yes') {
      if (this.suggestion) {
        const s = this.suggestion;
        this.tool('add_item', { id: s.id, quantity: s.quantity }); this.tool('confirm');
      } else if (this.phase === 'review') this.tool('checkout');
      else this.question = total(this.cart) ? 'review' : 'empty';
      return;
    }
    this.suggestion = null;
    if (parsed.control === 'no') { this.invalidate(); this.question = 'edit'; return; }
    if (parsed.control === 'clear') { this.cart = {}; this.invalidate(); return; }
    if (parsed.control === 'confirm') { this.tool('confirm'); return; }
    if (parsed.reason) { this.invalidate(); this.question = parsed.reason; return; }
    // Validate a complete tool batch on a shadow state before applying any action.
    const shadow = new Agent(); shadow.cart = { ...this.cart };
    try { for (const t of parsed.tools) shadow.tool(t.tool, t.args); }
    catch { this.invalidate(); this.question = 'quantity'; return; }
    for (const t of parsed.tools) this.tool(t.tool, t.args);
    this.tool('confirm');
  }
  suggest(s) {
    if (this.locked) throw new Error('The order is locked.');
    if (!product(s.id) || !Number.isInteger(s.quantity) || s.quantity < 1 || s.quantity > MAX_QUANTITY) throw new Error('Invalid suggestion.');
    this.invalidate(); this.suggestion = { ...s }; this.question = 'suggestion';
  }
  beginPayment() {
    if (this.phase !== 'checkout' || this.confirmedRevision !== this.revision) throw new Error('A confirmed cart is required.');
    const snapshot = Object.freeze({ cart: Object.freeze({ ...this.cart }), revision: this.revision, amount: total(this.cart), fulfillment: this.fulfillment });
    this.phase = 'processing'; return snapshot;
  }
  paymentCancelled() { if (this.phase === 'processing') { this.phase = 'review'; this.confirmedRevision = null; } }
}
