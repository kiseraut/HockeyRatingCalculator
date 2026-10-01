const test = require('node:test');
const assert = require('node:assert/strict');
const {parseMath}=require('../manual-data');
test('Math totals accept printed minus signs, explicit plus signs, and spaces in game count',()=>{
 const header='Date\tOpponent\tGD\tOpp Rating\tPoints\t+/-\n';
 for(const sign of ['-', '\u2212','\u2013']){
  const result=parseMath(header+`Totals ( 8 games )\t6-1-1\t21-30\t${sign}9\t732.55\t723.55\t0`);
  assert.equal(result.totalGoalDifferential,-9);
 }
 assert.equal(parseMath(header+'Totals (8 games)\t6-1-1\t30-21\t+9\t732.55\t741.55\t0').totalGoalDifferential,9);
});
test('St Louis rankable totals use 5-5-2 record and exclude unrankable rows',()=>{
 const table='Date\tOpponent\tW/L/T\tScore\tGD\tOpp Rating\tPoints\t+/-\nSep 13\tSt Louis Sting (CSDHL) 15U AA\t-\t-\t-\t-\t-\t-\nTotals (for rankable games)\t5 - 5 - 2\t42 - 36\t6\t1115.19\t1121.19\t-0.02';
 const result=parseMath(table);
 assert.equal(result.totalGames,12);assert.equal(result.totalGoalDifferential,6);assert.equal(result.totalOpponentRating,1115.19);
 assert.equal(((result.totalGoalDifferential+result.totalOpponentRating)/result.totalGames).toFixed(2),'93.43');
 assert.throws(()=>parseMath(table.replace('5 - 5 - 2','unknown')),/validated/);
 assert.throws(()=>parseMath(table.replace('Totals (for rankable games)','Totals (13 games)')),/does not match/);
});
