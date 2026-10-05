// Logic trận đấu thuần tuý, không biết gì về đồ hoạ hay DOM.
import { getWords } from './words.js';

export const ROUND_TIME = 5; // giây mỗi câu
export const ROUNDS = 10;
export const MAX_HP = 100;

// acc: xác suất bot đúng; tmin/tmax: khoảng thời gian bot trả lời (giây)
export const LEVELS = {
  easy: { label: 'Dễ', hint: 'Từ quen thuộc · Bot hiền', acc: 0.5, tmin: 2.4, tmax: 4.4, color: 0x4fd18b },
  medium: { label: 'Trung bình', hint: 'Từ phổ biến · Bot khá', acc: 0.7, tmin: 1.8, tmax: 3.8, color: 0xff9f43 },
  hard: { label: 'Khó', hint: 'Từ nâng cao · Bot giỏi', acc: 0.88, tmin: 1.2, tmax: 3.0, color: 0xb05cff },
};

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const rand = (a, b) => a + Math.random() * (b - a);
const speedBonus = (t) => Math.round(6 * (1 - t / ROUND_TIME)); // trả lời càng nhanh càng đau

export class Battle {
  constructor(topic, level) {
    this.topic = topic;
    this.level = level;
    this.cfg = LEVELS[level];
    this.hp = { hero: MAX_HP, bot: MAX_HP };
    this.streak = 0;
    this.correct = 0;
    this.round = 0; // số câu đã chấm
    this.missed = []; // từ trả lời sai / hết giờ, để ôn lại cuối trận

    const all = getWords(topic);
    const pool = all.filter((w) => w.level === level);
    this.questions = shuffle(pool)
      .slice(0, ROUNDS)
      .map((w) => this.makeQuestion(w, all, pool));
  }

  makeQuestion(word, all, pool) {
    // Đáp án nhiễu ưu tiên cùng độ khó, thiếu thì lấy thêm từ các mức khác cùng chủ đề.
    const seen = new Set([word.vi]);
    const distractors = [];
    for (const w of [...shuffle(pool), ...shuffle(all)]) {
      if (distractors.length === 3) break;
      if (seen.has(w.vi)) continue;
      seen.add(w.vi);
      distractors.push(w.vi);
    }
    const options = shuffle([word.vi, ...distractors]);
    return { word, options, correctIndex: options.indexOf(word.vi) };
  }

  /** Kế hoạch trả lời của bot cho một câu: đúng/sai và lúc nào bấm. */
  plan() {
    return { correct: Math.random() < this.cfg.acc, time: rand(this.cfg.tmin, this.cfg.tmax) };
  }

  /**
   * Chấm một câu. idx = đáp án người chơi chọn (-1 nếu hết giờ), time = giây đã dùng.
   * Ai đúng thì tấn công; cả hai đúng thì ai nhanh hơn thắng; cả hai sai thì không ai đánh được.
   */
  resolve(q, idx, time, plan) {
    const playerCorrect = idx === q.correctIndex;
    const botCorrect = plan.correct;
    let winner = 'none';
    if (playerCorrect && botCorrect) winner = time <= plan.time ? 'hero' : 'bot';
    else if (playerCorrect) winner = 'hero';
    else if (botCorrect) winner = 'bot';

    this.streak = playerCorrect ? this.streak + 1 : 0;
    if (playerCorrect) this.correct++;
    else this.missed.push(q.word);
    this.round++;

    let damage = 0;
    let combo = 0;
    if (winner === 'hero') {
      combo = this.streak >= 2 ? Math.min(this.streak - 1, 3) : 0;
      damage = 8 + speedBonus(time) + combo * 2;
      this.hp.bot = Math.max(0, this.hp.bot - damage);
    } else if (winner === 'bot') {
      damage = 8 + speedBonus(plan.time);
      this.hp.hero = Math.max(0, this.hp.hero - damage);
    }
    return { playerCorrect, botCorrect, winner, damage, combo, timedOut: idx === -1 };
  }

  isOver() {
    return this.hp.hero === 0 || this.hp.bot === 0 || this.round >= this.questions.length;
  }

  outcome() {
    if (this.hp.hero === this.hp.bot) return 'draw';
    return this.hp.hero > this.hp.bot ? 'win' : 'lose';
  }

  get accuracy() {
    return this.round ? this.correct / this.round : 0;
  }

  get stars() {
    const a = this.accuracy;
    return a >= 0.9 ? 3 : a >= 0.7 ? 2 : a >= 0.4 ? 1 : 0;
  }
}
