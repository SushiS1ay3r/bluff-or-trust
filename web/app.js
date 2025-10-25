// Bluff or Trust — Web Version
// J = 0, A = 1, 2 = 2, 3 = 3
// Goal: force opponent to exceed total of 9

const TOTAL_TARGET = 9;
const VALUES = [0,1,2,3];
// Colored number cards with a large background shape
const SHAPES = {0:'♣',1:'♦',2:'♥',3:'♠'};
const THEME_CLASS = {0:'theme-v0',1:'theme-v1',2:'theme-v2',3:'theme-v3'};

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()* (i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}

function makeDeck(){
  // 4 copies of 0..3 styled as colored number cards
  const deck = [];
  for(let v of VALUES){
    for(let k=0;k<4;k++){
      deck.push({value:v, shape:SHAPES[v], theme:THEME_CLASS[v], id:`${v}-${k}-${Math.random().toString(36).slice(2)}`});
    }
  }
  return shuffle(deck);
}

class PlayerBase{
  constructor(name){
    this.name = name;
    this.hand = [];
    this.bluffs = 1;
  }
  hasCards(){ return this.hand.length>0; }
  giveCard(c){ if(c) this.hand.push(c); }
  removeCardByIndex(i){ return this.hand.splice(i,1)[0]; }
  removeFirstByValue(v){ const idx = this.hand.findIndex(c=>c.value===v); if(idx>=0){return this.removeCardByIndex(idx);} return null; }
}

class AdaptiveAI extends PlayerBase{
  constructor(name='AI'){
    super(name);
  }
  choosePlay(total){
    // Simple heuristic: if safe card exists, play face-up the max safe; else bluff sometimes
    const safe = this.hand.filter(c=> total + c.value <= TOTAL_TARGET);
    const risky = this.hand.filter(c=> total + c.value > TOTAL_TARGET);
    const shouldBluff = this.bluffs>0 && (risky.length>0 || Math.random()<0.15);
    if(!shouldBluff){
      if(safe.length){
        const choice = safe.sort((a,b)=>b.value-a.value)[0];
        const idx = this.hand.indexOf(choice);
        const real = this.removeCardByIndex(idx);
        return {mode:'up', real, claim:real.value};
      }
      // no safe
      const choice = this.hand.sort((a,b)=>a.value-b.value)[0];
      const idx = this.hand.indexOf(choice);
      const real = this.removeCardByIndex(idx);
      return {mode:'up', real, claim:real.value};
    }
    // bluff
    const real = this.hand[Math.floor(Math.random()*this.hand.length)];
    const idx = this.hand.indexOf(real);
    const played = this.removeCardByIndex(idx);
    this.bluffs -= 1;
    // claim a safe-ish value
    const claim = Math.min(played.value, Math.max(0, TOTAL_TARGET - total - 1));
    return {mode:'down', real:played, claim};
  }
  decideOnBluff(opponentClaim, total){
    // Very simple: call more often when expect goes high
    const expect = total + opponentClaim;
    const risk = expect / TOTAL_TARGET; // >1 is bust
    const callProb = Math.max(0.1, Math.min(0.9, risk - 0.4));
    return Math.random() < callProb ? 'b' : 't';
  }
  resolveKeepOrLose(actual, claimed, ctx){
    const x = ctx.total + actual;
    // If keeping would bust: decide based on whose card it is
    if (x > TOTAL_TARGET) {
      // If the card belongs to the opponent (ctx.actor === 'Human'), keeping makes them lose immediately
      // If the card is AI's own, keeping would make AI lose -> avoid
      return ctx.actor === 'Human' ? 'k' : 'l';
    }
    const margin = TOTAL_TARGET - x; // how far from bust after keeping
    // Strategy differs based on whose card this is, because it determines who plays next
    if (ctx.actor === 'AI') {
      // This is AI's own card, and after resolution, Human plays next.
      // Pressure the Human when safe; keep more aggressively.
      if (margin <= 1) return 'k';     // take it to 8 or 9 to corner Human
      if (margin >= 4) return 'l';     // very low total; conserve options
      return 'k';                      // moderate totals: keep pressure
    } else {
      // This is Human's card, and after resolution, AI plays next.
      // Avoid painting ourselves into a corner on our upcoming turn.
      if (margin <= 1) return 'l';     // don't leave ourselves at 8/9
      if (margin >= 4) return 'k';     // low total: safe to keep
      return 'l';                      // mid-high totals: play it safe
    }
  }
  resolveZeroKeepOrSteal(ctx){
    // Prefer stealing zeros so AI has a safety card when it needs it soon.
    // If Human played the card, AI plays next -> always steal to have a safe play.
    if (ctx.actor === 'Human') return 's';
    // If AI played the card (Human plays next), stealing is still generally useful; keep occasionally for variety.
    return Math.random() < 0.7 ? 's' : 'k';
  }
}

class Game{
  constructor(){
    this.deck = makeDeck();
    this.human = new PlayerBase('Human');
    this.ai = new AdaptiveAI('AI');
    this.total = 0;
    this.turn = Math.random()<0.5? 'Human':'AI';
    for(let i=0;i<4;i++){
      this.human.giveCard(this.deck.pop());
      this.ai.giveCard(this.deck.pop());
    }
    this.over = false;
    this.msg = '';
    this.pending = null; // used for multi-step sequences
    this.history = [];
    this.humanPlayed = [];
    this.aiPlayed = [];
    this.tableOrder = [];
  }
}

// UI Helpers
const el = sel => document.querySelector(sel);
const humanHandEl = el('#humanHand');
const aiHandEl = el('#aiHand');
const aiPlayEl = el('#aiPlay');
const aiPileEl = el('#aiPile');
const humanPileEl = el('#humanPile');
const tableEl = el('#tableList');
const historyEl = el('#history');
const totalEl = el('#total');
const roundEl = el('#round');
const turnEl = el('#turn');
const msgEl = el('#message');
const humanBluffsEl = el('#humanBluffs');
const aiBluffsEl = el('#aiBluffs');
const actionBar = el('#actionBar');
const claimBar = el('#claimBar');
const trustBar = el('#trustBar');
const keepLoseBar = el('#keepLoseBar');
const btnPlayUp = el('#playUp');
const btnPlayDown = el('#playDown');
const btnTrust = el('#trustBtn');
const btnCall = el('#callBtn');
const btnKeep = el('#keepBtn');
const btnLose = el('#loseBtn');
const btnSteal = el('#stealBtn');
const btnNew = el('#newGame');
const overlayEl = el('#overlay');
const overlayMsgEl = el('#overlayMsg');
const overlayAgainEl = el('#overlayAgain');

let G = null; // game state
let selectedValue = null; // value user picked (0..3)
let roundNum = 1;
let lastPendingActor = null;
let awaitingClaim = false; // only show claim options when face-down is chosen

function displayValue(v){ return `${v}`; }

function render(){
  // Status
  totalEl.textContent = G.total;
  roundEl.textContent = roundNum;
  turnEl.textContent = G.turn;
  humanBluffsEl.textContent = G.human.bluffs;
  aiBluffsEl.textContent = G.ai.bluffs;

  // Human hand
  humanHandEl.innerHTML = '';
  const handSorted = [...G.human.hand].sort((a,b)=> a.value-b.value);
  handSorted.forEach(card=>{
    const c = document.createElement('div');
    c.className = `card ${card.theme}`;
    c.dataset.value = card.value;
    c.setAttribute('data-shape', card.shape);
    c.innerHTML = `<div class="bignum">${displayValue(card.value)}</div>`;
    c.addEventListener('click', ()=>{
      if(G.turn!=='Human' || G.over) return;
      selectedValue = card.value;
      document.querySelectorAll('.card').forEach(x=>x.classList.remove('selected'));
      c.classList.add('selected');
      actionBar.classList.remove('hidden');
      hideClaimBar();
    });
    humanHandEl.appendChild(c);
  });

  // AI play area
  aiPlayEl.textContent = '';

  // AI hand (render hidden backs equal to AI hand size)
  aiHandEl.innerHTML = '';
  for(let i=0;i<G.ai.hand.length;i++){
    const back = document.createElement('div');
    back.className = 'card back';
    back.setAttribute('data-shape','?');
    back.innerHTML = `<div class="bignum">?<\/div>`;
    aiHandEl.appendChild(back);
  }

  // If AI has a pending face-down card on the table, show its back in the play area
  if(G.pending && G.pending.actor==='AI'){
    const back = document.createElement('div');
    back.className = 'card back';
    back.setAttribute('data-shape','?');
    back.innerHTML = `<div class="bignum">?<\/div>`;
    aiPlayEl.appendChild(back);
  }

  // Render piles
  renderPile(humanPileEl, G.humanPlayed);
  renderPile(aiPileEl, G.aiPlayed);

  // Render global table sequence as mini cards (like on-table pile)
  renderPile(tableEl, G.tableOrder);

  // Render history
  historyEl.innerHTML = '';
  G.history.slice(-50).forEach(line=>{
    const li = document.createElement('li');
    li.textContent = line;
    historyEl.appendChild(li);
  });

  // Control bars visibility based on state
  if(G.over){
    actionBar.classList.add('hidden');
    trustBar.classList.add('hidden');
    keepLoseBar.classList.add('hidden');
    claimBar.classList.add('hidden');
    claimBar.style.display = 'none';
    awaitingClaim = false;
  } else {
    // Ensure claim values only appear during bluff flow
    if(awaitingClaim){
      claimBar.classList.remove('hidden');
      claimBar.style.display = 'flex';
    } else {
      claimBar.classList.add('hidden');
      claimBar.style.display = 'none';
    }
  }
}

function setMessage(txt){ msgEl.textContent = txt || ''; }

function log(line){
  G.history.push(line);
}

// Special rule detection: actual zero claimed as zero and truth
function isZeroSpecial(pending){
  return pending && pending.truth && pending.played && pending.played.value === 0 && pending.claim === 0;
}

function setDecisionButtonsForPending(){
  // default: Keep/Lose visible, Steal hidden
  btnKeep.classList.remove('hidden');
  btnLose.classList.remove('hidden');
  btnSteal.classList.add('hidden');
  if(isZeroSpecial(G.pending)){
    // For zero special: show Keep + Steal; hide Lose
    btnSteal.classList.remove('hidden');
    btnLose.classList.add('hidden');
  }
}

function showClaimBar(){
  awaitingClaim = true;
  claimBar.classList.remove('hidden');
  claimBar.style.display = 'flex';
  btnPlayDown.classList.add('active');
}

function hideClaimBar(){
  awaitingClaim = false;
  claimBar.classList.add('hidden');
  claimBar.style.display = 'none';
  btnPlayDown.classList.remove('active');
  // clear any previous selection highlight on claim buttons
  document.querySelectorAll('.claim').forEach(b=> b.classList.remove('selected'));
}

function renderPile(container, pile){
  if(!container) return;
  container.innerHTML = '';
  pile.forEach(card=>{
    const c = document.createElement('div');
    const theme = card && card.theme ? card.theme : 'theme-v0';
    c.className = `card mini ${theme}`;
    const value = card && card.value !== undefined ? displayValue(card.value) : '?';
    const shape = card && card.shape ? card.shape : '';
    c.setAttribute('data-shape', shape);
    c.innerHTML = `<div class=\"bignum\">${value}<\/div>`;
    container.appendChild(c);
  });
}

function renderOrder(container, pile){
  if(!container) return;
  container.innerHTML = '';
  pile.forEach((card, idx)=>{
    const item = document.createElement('span');
    item.className = 'orderItem';
    item.textContent = displayValue(card.value);
    container.appendChild(item);
    if(idx < pile.length - 1){
      const arrow = document.createElement('span');
      arrow.className = 'orderArrow';
      arrow.textContent = '→';
      container.appendChild(arrow);
    }
  });
}

function startNewRound(){
  G = new Game();
  selectedValue = null;
  awaitingClaim = false;
  setMessage('');
  if(overlayEl){ overlayEl.classList.add('hidden'); }
  render();
  proceedTurn();
}

function proceedTurn(){
  render();
  if(G.over) return;
  const dealt = ensureHandsHaveCards();
  if(dealt){
    render();
  } else {
    setMessage('');
  }
  // Ensure claim values are hidden unless Bluff was just chosen
  hideClaimBar();
  if(G.turn === 'Human'){
    setMessage('Select a card, then choose Trust or Bluff.');
  } else {
    // AI plays
    window.setTimeout(()=> aiTurn(), 500);
  }
}

// Ensure no one is stuck without cards: if either hand is empty, deal one card to that player (rebuild deck if needed)
function ensureHandsHaveCards(){
  let dealt = false;
  const needHuman = (G.human.hand.length === 0);
  const needAI = (G.ai.hand.length === 0);
  const needCount = (needHuman?1:0) + (needAI?1:0);
  if(needCount > 0){
    if(G.deck.length < needCount){
      G.deck = makeDeck();
    }
    if(needHuman){
      const h = G.deck.pop();
      if(h){ G.human.giveCard(h); dealt = true; log('Auto-deal: Human draws 1 card.'); }
    }
    if(needAI){
      const a = G.deck.pop();
      if(a){ G.ai.giveCard(a); dealt = true; log('Auto-deal: AI draws 1 card.'); }
    }
  }
  return dealt;
}

function checkOverflow(actorName){
  if(G.total > TOTAL_TARGET){
    G.over = true;
    G.msg = `${actorName} loses (exceeded ${TOTAL_TARGET})`;
    setMessage(G.msg);
    // Show win/lose popup for 3 seconds
    if(overlayEl && overlayMsgEl){
      const playerLost = (actorName === 'Human');
      overlayMsgEl.textContent = playerLost ? 'You lose!' : 'You won!';
      overlayEl.classList.remove('hidden');
    }
    render();
    return true;
  }
  return false;
}

// Human actions
btnPlayUp.addEventListener('click', ()=>{
  if(G.turn!=='Human' || selectedValue==null) return;
  hideClaimBar();
  const played = G.human.removeFirstByValue(selectedValue);
  if(!played){ setMessage('Please pick a card from your hand.'); return; }
  setMessage(`You play: ${displayValue(played.value)} face-up.`);
  log(`You played ${displayValue(played.value)} face-up.`);
  G.humanPlayed.push(played);
  G.tableOrder.push(played);
  G.total += played.value;
  log(`Total is now ${G.total}.`);
  if(checkOverflow('Human')) return;
  G.turn = 'AI';
  selectedValue = null;
  proceedTurn();
});

btnPlayDown.addEventListener('click', ()=>{
  if(G.turn!=='Human' || selectedValue==null) return;
  if(G.human.bluffs<=0){ setMessage('No bluffs remaining. Play face-up.'); return; }
  // prepare to choose claim
  showClaimBar();
  setMessage('Choose a claim value for your face-down card.');
});

document.querySelectorAll('.claim').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(G.turn!=='Human' || selectedValue==null) return;
    // highlight the tapped claim briefly
    document.querySelectorAll('.claim').forEach(b=> b.classList.remove('selected'));
    btn.classList.add('selected');
    const claim = parseInt(btn.dataset.claim,10);
    const played = G.human.removeFirstByValue(selectedValue);
    if(!played){ setMessage('Please pick a card from your hand.'); return; }
    hideClaimBar();
    G.human.bluffs -= 1;
    setMessage(`You play a card face-down and claim ${displayValue(claim)}.`);
    log(`You played a card face-down and claimed ${displayValue(claim)}.`);
    // AI decides trust or call
    const decision = G.ai.decideOnBluff(claim, G.total);
    if(decision==='t'){
      setMessage(`You play a card face-down and claim ${claim}. AI trusts.`);
      log(`AI trusts.`);
    } else {
      setMessage(`You play a card face-down and claim ${claim}. AI calls bluff!`);
      log(`AI calls bluff.`);
    }
    // resolve chooser
    const truth = (played.value === claim);
    const correct = (decision==='t' && truth) || (decision==='b' && !truth);
    const chooser = correct? 'AI' : 'Human';
    // if trusted correctly, AI gains bluff
    if(decision==='t' && truth){ G.ai.bluffs += 1; }

    if(chooser==='Human'){
      // human chooses keep/lose or steal (zero special)
      G.pending = {actor:'Human', played, claim, decision, truth};
      lastPendingActor = 'Human';
      keepLoseBar.classList.remove('hidden');
      setDecisionButtonsForPending();
      setMessage((decision==='t'? 'AI trusted you. ' : 'AI called you wrongly. ') + 'Choose Keep or ' + (isZeroSpecial(G.pending)? 'Steal.' : 'Lose.'));
    } else {
      // AI chooses (may use zero special)
      if(isZeroSpecial({played, claim, truth})){
        const aiChoice = G.ai.resolveZeroKeepOrSteal({total:G.total, actor:'Human'});
        if(aiChoice==='k'){
          G.total += played.value;
          G.humanPlayed.push(played);
          G.tableOrder.push(played);
        } else {
          // Steal: return zero to AI hand; do not add to any pile or table
          G.ai.giveCard(played);
        }
        log(`Your card revealed ${played.value} (truth; claimed 0). AI chose to ${aiChoice==='k'?'Keep':'Steal'}. Total: ${G.total}.`);
        setMessage(`AI chooses to ${aiChoice==='k'?'Keep':'Steal'}. Revealed: 0. Total: ${G.total}`);
      } else {
  const dec = G.ai.resolveKeepOrLose(played.value, claim, {total:G.total, called:decision, truth, actor:'Human'});
  if(dec==='k'){ G.total += played.value; }
  G.humanPlayed.push(played);
  if(dec==='k'){ G.tableOrder.push(played); }
        log(`Your card revealed ${played.value} (${truth? 'truth' : `lied; claimed ${claim}`}). AI chose to ${dec==='k'? 'Keep' : 'Lose'}. Total: ${G.total}.`);
        setMessage(`AI chooses to ${dec==='k'? 'Keep' : 'Lose'}. Revealed: ${displayValue(played.value)}${truth? ' (truth)' : ` (lied; claimed ${displayValue(claim)})`}. Total: ${G.total}`);
      }
      if(checkOverflow('Human')) return; // actor is human here
      G.turn = 'AI';
      proceedTurn();
    }
  });
});

btnKeep.addEventListener('click', ()=>{
  if(!G.pending) return;
  G.total += G.pending.played.value;
  const {played, claim, truth} = G.pending;
  keepLoseBar.classList.add('hidden');
  G.pending = null;
   if(G.pending && G.pending.actor==='AI'){} // no-op safeguard
  // record into piles
  // If pending actor was Human, this is the human's card resolution
  // If pending actor was AI, this is the AI's card resolution
  // We stored actor in pending before clearing it above, so capture before
  // Luckily we still have 'played'
  // Push based on last chooser context: when human chooses after AI's face-down, pending.actor==='AI'
  // For our case, we can deduce by message content; simpler: push both ways using a flag
  // As we cleared pending, infer by last message string not reliable; instead we store a hidden flag before clear
  // To keep it simple, assume when keep/lose bar is visible, pending.actor indicates whose card was revealed.
  // We'll adjust: store lastPendingActor globally when setting G.pending.
  setMessage(`You choose to Keep. Revealed: ${displayValue(played.value)}${truth? ' (truth)' : ` (lied; claimed ${displayValue(claim)})`}. Total: ${G.total}`);
  // push to correct pile
  if(lastPendingActor==='Human'){
    G.humanPlayed.push(played);
  G.tableOrder.push(played);
  log(`You chose Keep. Your card was ${displayValue(played.value)}${truth? ' (truth)' : ` (lied; claimed ${displayValue(claim)})`}. Total: ${G.total}.`);
  } else if(lastPendingActor==='AI'){
    G.aiPlayed.push(played);
  G.tableOrder.push(played);
  log(`You chose Keep on AI's card. Revealed ${displayValue(played.value)}${truth? ' (truth)' : ` (lied; claimed ${displayValue(claim)})`}. Total: ${G.total}.`);
  }
  if(checkOverflow(lastPendingActor||'Human')) return;
  // Next turn depends on whose card this was
  G.turn = (lastPendingActor === 'AI') ? 'Human' : 'AI';
  proceedTurn();
});

btnLose.addEventListener('click', ()=>{
  if(!G.pending) return;
  const {played, claim, truth} = G.pending;
  keepLoseBar.classList.add('hidden');
  G.pending = null;
  setMessage(`You choose to Lose. Revealed: ${displayValue(played.value)}${truth? ' (truth)' : ` (lied; claimed ${displayValue(claim)})`}. Total: ${G.total}`);
  if(lastPendingActor==='Human'){
    G.humanPlayed.push(played);
  log(`You chose Lose. Your card was ${displayValue(played.value)}${truth? ' (truth)' : ` (lied; claimed ${displayValue(claim)})`}. Total remains ${G.total}.`);
  } else if(lastPendingActor==='AI'){
    G.aiPlayed.push(played);
  log(`You chose Lose on AI's card. Revealed ${displayValue(played.value)}${truth? ' (truth)' : ` (lied; claimed ${displayValue(claim)})`}. Total remains ${G.total}.`);
  }
  if(checkOverflow(lastPendingActor||'Human')) return;
  // Next turn depends on whose card this was
  G.turn = (lastPendingActor === 'AI') ? 'Human' : 'AI';
  proceedTurn();
});

btnSteal.addEventListener('click', ()=>{
  if(!G.pending) return;
  const {played, claim, truth} = G.pending;
  if(!(truth && claim===0 && played && played.value===0)){
    return; // only valid for zero special
  }
  keepLoseBar.classList.add('hidden');
  G.pending = null;
  if(lastPendingActor==='Human'){
    // Human steals their own 0 back into hand: don't add to piles or table
    G.human.giveCard(played);
    setMessage(`You steal the 0 back into your hand. Total: ${G.total}`);
    log(`You chose Steal. Your 0 returns to your hand. Total remains ${G.total}.`);
  } else if(lastPendingActor==='AI'){
    // Human steals AI's 0 into hand: don't add to piles or table
    G.human.giveCard(played);
    setMessage(`You steal AI's 0 into your hand. Total: ${G.total}`);
    log(`You chose Steal. You took AI's 0 into your hand. Total remains ${G.total}.`);
  }
  if(checkOverflow(lastPendingActor||'Human')) return;
  // Next turn depends on whose card this was
  G.turn = (lastPendingActor === 'AI') ? 'Human' : 'AI';
  proceedTurn();
});

// AI turn
function aiTurn(){
  if(G.over) return;
  const decision = G.ai.choosePlay(G.total);
  if(decision.mode==='up'){
    G.total += decision.real.value;
  setMessage(`AI plays: ${displayValue(decision.real.value)}. Total: ${G.total}`);
  G.aiPlayed.push(decision.real);
  G.tableOrder.push(decision.real);
  log(`AI played ${displayValue(decision.real.value)} face-up. Total: ${G.total}.`);
    if(checkOverflow('AI')) return;
    G.turn = 'Human';
    proceedTurn();
    return;
  }
  // face-down
  setMessage(`AI plays a card face-down and claims ${displayValue(decision.claim)}.`);
  log(`AI played a card face-down claiming ${displayValue(decision.claim)}.`);
  // store pending reveal context
  G.pending = {actor:'AI', played:decision.real, claim:decision.claim, decision:null, truth:(decision.real.value===decision.claim)};
  lastPendingActor = 'AI';
  // prompt human trust/call
  hideClaimBar();
  trustBar.classList.remove('hidden');
}

btnTrust.addEventListener('click', ()=> resolveAiFaceDown('t'));
btnCall.addEventListener('click', ()=> resolveAiFaceDown('b'));

function resolveAiFaceDown(call){
  trustBar.classList.add('hidden');
  const {played, claim, truth} = G.pending;
  G.pending = null;
  // determine chooser
  const correct = (call==='t' && truth) || (call==='b' && !truth);
  const chooser = correct? 'Human' : 'AI';
  if(call==='t' && truth){ G.human.bluffs += 1; }

  if(chooser==='Human'){
    // human chooses
    G.pending = {actor:'AI', played, claim, decision:call, truth};
    lastPendingActor = 'AI';
    keepLoseBar.classList.remove('hidden');
    setDecisionButtonsForPending();
    setMessage((call==='t'? 'You trusted correctly. ' : 'You called bluff wrongly. ') + 'Choose Keep or ' + (isZeroSpecial(G.pending)? 'Steal.' : 'Lose.'));
  } else {
    // AI chooses
    if(isZeroSpecial({played, claim, truth})){
      const aiChoice = G.ai.resolveZeroKeepOrSteal({total:G.total, actor:'AI'});
      if(aiChoice==='k'){
        G.total += played.value;
        G.aiPlayed.push(played);
        G.tableOrder.push(played);
      } else {
        // Steal: return zero to AI hand; do not add to any pile or table
        G.ai.giveCard(played);
      }
      log(`AI chooses to ${aiChoice==='k'? 'Keep' : 'Steal'}. Revealed 0 (truth). Total: ${G.total}.`);
      setMessage(`AI chooses to ${aiChoice==='k'? 'Keep' : 'Steal'}. Revealed: 0. Total: ${G.total}`);
    } else {
  const dec = G.ai.resolveKeepOrLose(played.value, claim, {total:G.total, called:call, truth, actor:'AI'});
  if(dec==='k'){ G.total += played.value; }
  G.aiPlayed.push(played);
  if(dec==='k'){ G.tableOrder.push(played); }
      log(`AI chooses to ${dec==='k'? 'Keep' : 'Lose'}. Revealed ${played.value}${truth? ' (truth)' : ` (lied; claimed ${claim})`}. Total: ${G.total}.`);
      setMessage(`AI chooses to ${dec==='k'? 'Keep' : 'Lose'}. Revealed: ${displayValue(played.value)}${truth? ' (truth)' : ` (lied; claimed ${displayValue(claim)})`}. Total: ${G.total}`);
    }
    if(checkOverflow('AI')) return;
    G.turn = 'Human';
    proceedTurn();
  }
}

btnNew.addEventListener('click', ()=>{
  roundNum = 1;
  startNewRound();
});

if(overlayAgainEl){
  overlayAgainEl.addEventListener('click', ()=>{
    roundNum += 1;
    startNewRound();
  });
}

// bootstrap
startNewRound();
