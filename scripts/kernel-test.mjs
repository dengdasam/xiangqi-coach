// 训练内核自检：perft + 评分 + 难度采样 + 画像
import { build } from 'esbuild';
async function load(entry) {
  const r = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
}
const rules = await load('src/chess/rules.ts');
const perft = rules.runPerftSelfTest();
console.log('PERFT', JSON.stringify(perft.map(x=>x.got)), 'OK=' + perft.every(x=>x.ok));

const grader = await load('src/training/grader.ts');
const g1 = grader.gradeMove('h2e2', { bestmove:'h2e2', scoreCp:50 }, 50, true);
const g2 = grader.gradeMove('a0a1', { bestmove:'h2e2', scoreCp:50 }, -300, true);
console.log('GRADE best=' + g1.label + '/' + g1.cpLoss + ' blunder=' + g2.label + '/' + g2.cpLoss);

const diff = await load('src/training/difficulty.ts');
const cands = [
  {bestmove:'a',scoreCp:100},{bestmove:'b',scoreCp:80},{bestmove:'c',scoreCp:20}
];
let picks = {};
for (let i=0;i<200;i++){ const p = diff.pickMove(cands, diff.LEVELS[0]); picks[p]=(picks[p]||0)+1; }
console.log('SAMPLE(beginner,200x)', JSON.stringify(picks));
const strong = diff.pickMove(cands, diff.LEVELS[5]);
console.log('SAMPLE(master) always best=' + (strong==='a'));

const prof = await load('src/training/profile.ts');
const samples = [
  {grade:{cpLoss:300,grade:'blunder',label:'严重失误',best:'',played:'',scoreBefore:0,scoreAfter:0},scoreForMover:-150,ply:5,thinkSeconds:1,pieceCount:30},
  {grade:{cpLoss:20,grade:'good',label:'良好',best:'',played:'',scoreBefore:0,scoreAfter:0},scoreForMover:-50,ply:10,thinkSeconds:2,pieceCount:28},
  {grade:{cpLoss:400,grade:'blunder',label:'严重失误',best:'',played:'',scoreBefore:0,scoreAfter:0},scoreForMover:-200,ply:40,thinkSeconds:1,pieceCount:10},
];
const p = prof.buildProfile(samples);
console.log('PROFILE', JSON.stringify({tactics:p.tactics,defense:p.defense,weakest:p.weakest,overall:p.overall}));
