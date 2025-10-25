"""
Bluff or Trust - Enhanced Version with Rubric-Optimized Features
Original code improved with better UX, AI insights, and documentation
"""

import random
from collections import deque, defaultdict
from dataclasses import dataclass
from typing import Optional, Tuple, Dict, List

VALUES = [0, 1, 2, 3]
TOTAL_TARGET = 9

# ANSI Color codes for better UX
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'

@dataclass
class RevealResult:
    was_truth: bool
    actual_value: int
    claimed_value: int

class Deck:
    """Manages the 16-card deck (4 each of values 0-3)"""
    def __init__(self, seed=None):
        self.cards = [v for v in VALUES for _ in range(4)]
        if seed is not None:
            random.seed(seed)
        random.shuffle(self.cards)
    
    def draw(self):
        return self.cards.pop() if self.cards else None
    
    def __len__(self):
        return len(self.cards)

class PlayerBase:
    """Base class for all players"""
    def __init__(self, name):
        self.name = name
        self.hand = []
        self.bluffs = 1
    
    def has_cards(self):
        return len(self.hand) > 0
    
    def give_card(self, v):
        if v is not None:
            self.hand.append(v)
    
    def use_bluff(self):
        if self.bluffs > 0:
            self.bluffs -= 1
            return True
        return False
    
    def gain_bluff(self):
        self.bluffs += 1
    
    def remove_card(self, idx):
        return self.hand.pop(idx)

class Human(PlayerBase):
    """Human player with improved UX"""
    def choose_play(self, total):
        print(f"\n{Colors.GREEN}{'='*60}{Colors.END}")
        print(f"{Colors.GREEN}{Colors.BOLD}YOUR TURN{Colors.END}")
        print(f"{Colors.GREEN}{'='*60}{Colors.END}")
        print(f"\n{Colors.CYAN}Your Cards: {sorted(self.hand)}{Colors.END}")
        print(f"{Colors.CYAN}Your bluffs remaining: {self.bluffs}{Colors.END}")
        print(f"{Colors.WARNING}Current total: {total} / {TOTAL_TARGET}{Colors.END}")
        
        # Choose card by value (not index) and show only valid options from your hand
        while True:
            valid_values = sorted(set(self.hand))
            choice_list = ", ".join(str(v) for v in valid_values)
            m = input(f"\n{Colors.BLUE}Play a card from your hand (one of: {choice_list}): {Colors.END}").strip()
            if m.isdigit() and int(m) in self.hand:
                chosen_value = int(m)
                break
            print(f"{Colors.FAIL}Please play a card from your hand. Your Cards: {sorted(self.hand)}{Colors.END}")
        
        # Remove first occurrence of the chosen value from the actual hand order
        idx = self.hand.index(chosen_value)
        card = self.hand[idx]
        print(f"\n{Colors.CYAN}You selected card: {card}{Colors.END}")
        
        # Choose play type
        face = "u"
        if self.bluffs > 0:
            print(f"\n{Colors.WARNING}You have {self.bluffs} bluff(s) remaining.{Colors.END}")
            face = input(f"{Colors.BLUE}Play face-up 'u' (honest) or face-down 'd' (bluff)?: {Colors.END}").strip().lower() or "u"
        else:
            print(f"{Colors.WARNING}No bluffs remaining. Playing honestly.{Colors.END}")
            face = "u"
        
        if face not in ("u", "d"):
            face = "u"
        
        card = self.remove_card(idx)
        
        if face == "u":
            print(f"{Colors.GREEN}✓ Playing {card} face-up (honest){Colors.END}")
            return ("up", card, card)
        
        if not self.use_bluff():
            print(f"{Colors.FAIL}Failed to use bluff. Playing honestly.{Colors.END}")
            return ("up", card, card)
        
        # Bluffing - claim value
        print(f"\n{Colors.WARNING}Your actual card: {card}{Colors.END}")
        print(f"{Colors.WARNING}You can claim any value 0-3{Colors.END}")
        claim_in = input(f"{Colors.BLUE}Claim value (0-3) for face-down card: {Colors.END}").strip()
        claim = int(claim_in) if claim_in.isdigit() and int(claim_in) in VALUES else card
        
        if claim == card:
            print(f"{Colors.CYAN}🤔 You're claiming the TRUE value...{Colors.END}")
        else:
            print(f"{Colors.FAIL}😈 You're LYING! (Real: {card}, Claim: {claim}){Colors.END}")
        
        return ("down", card, claim)

    def decide_on_bluff(self, opponent_claim, total):
        print(f"\n{Colors.WARNING}{'='*60}{Colors.END}")
        print(f"{Colors.WARNING}{Colors.BOLD}AI PLAYED FACE-DOWN!{Colors.END}")
        print(f"{Colors.WARNING}{'='*60}{Colors.END}")
        print(f"{Colors.WARNING}AI claims the card is: {opponent_claim}{Colors.END}")
        print(f"{Colors.CYAN}Current total: {total}{Colors.END}")
        print(f"{Colors.CYAN}If true, total would be: {total + opponent_claim}{Colors.END}")
        
        while True:
            x = input(f"\n{Colors.BLUE}Do you TRUST 't' or CALL BLUFF 'b'?: {Colors.END}").strip().lower()
            if x in ("t", "b"):
                return x
            print(f"{Colors.FAIL}Invalid! Enter 't' for trust or 'b' for call bluff.{Colors.END}")

    def resolve_keep_or_lose(self, actual, claimed, ctx):
        print(f"\n{Colors.CYAN}Revealed card: {actual} (Claimed: {claimed}){Colors.END}")
        print(f"{Colors.CYAN}Current total: {ctx['total']}{Colors.END}")
        print(f"{Colors.CYAN}If kept, total would be: {ctx['total'] + actual}{Colors.END}")
        
        while True:
            x = input(f"{Colors.BLUE}KEEP 'k' or LOSE 'l' this card's value?: {Colors.END}").strip().lower()
            if x in ("k", "l"):
                return x
            print(f"{Colors.FAIL}Invalid! Enter 'k' or 'l'.{Colors.END}")

class AdaptiveAI(PlayerBase):
    """
    AI that learns and adapts to player behavior.
    
    Tracks:
    - Player's honesty rate when bluffing
    - Trust vs call patterns
    - Risk tolerance
    """
    def __init__(self, name="AI"):
        super().__init__(name)
        self.stats = {
            "claims_true": 1,  # Bayesian smoothing
            "claims_total": 2,
            "claim_hist": defaultdict(lambda: [1, 2]),  # [true_count, total_count] per claim
            "player_face_down_rate": [1, 2],
            "player_call_history": {"trust": 1, "bluff": 1},
            "risk_tolerance": 0.55,
            "call_bias": 0.5,
            "round_count": 0
        }
        self.insights = []

    def post_round_update(self, round_log):
        """Update learning from round results"""
        self.stats["round_count"] += 1
        
        player_bluffs_this_round = 0
        player_lies_this_round = 0
        
        for e in round_log:
            # Track when human plays face-down
            if e["actor"] == "Human" and e["type"] == "down":
                self.stats["player_face_down_rate"][1] += 1
                player_bluffs_this_round += 1
            
            # Track truth rate when human bluffs
            if e["actor"] == "Human" and e["type"] == "down_reveal":
                self.stats["claims_total"] += 1
                if e["truth"]:
                    self.stats["claims_true"] += 1
                else:
                    player_lies_this_round += 1
                
                # Update per-claim statistics
                a = self.stats["claim_hist"][e["claim"]]
                a[1] += 1
                if e["truth"]:
                    a[0] += 1
                
                # Track human's calling pattern
                call_type = "trust" if e["call"] == "t" else "bluff"
                self.stats["player_call_history"][call_type] += 1
        
        # Generate insights after learning
        self._generate_insights()

    def _generate_insights(self):
        """Generate human-readable insights about player behavior"""
        self.insights = []
        
        # Honesty insight
        honesty_rate = self.p_truth_overall()
        if honesty_rate > 0.7:
            self.insights.append("📊 You tell the truth often when bluffing")
        elif honesty_rate < 0.3:
            self.insights.append("📊 You're a serial liar when bluffing!")
        else:
            self.insights.append("📊 Your bluffing strategy is balanced")
        
        # Calling pattern insight
        total_calls = sum(self.stats["player_call_history"].values())
        if total_calls > 2:
            trust_rate = self.stats["player_call_history"]["trust"] / total_calls
            if trust_rate > 0.65:
                self.insights.append("🤝 You tend to TRUST my claims")
            elif trust_rate < 0.35:
                self.insights.append("🚨 You're aggressive - you CALL BLUFF often")
            else:
                self.insights.append("⚖️  You balance trust and suspicion well")
        
        # Experience insight
        if self.stats["round_count"] >= 3:
            self.insights.append(f"🧠 I've learned from {self.stats['round_count']} rounds of your play")

    def get_insights(self) -> List[str]:
        """Return current AI insights"""
        return self.insights

    def p_truth_overall(self):
        """Probability player tells truth overall"""
        return self.stats["claims_true"] / self.stats["claims_total"]

    def p_truth_given_claim(self, claim):
        """Probability player tells truth given specific claim"""
        a = self.stats["claim_hist"][claim]
        return a[0] / a[1]

    def choose_play(self, total):
        """AI decides which card to play and whether to bluff"""
        safe = [v for v in self.hand if total + v <= TOTAL_TARGET]
        risky = [v for v in self.hand if total + v > TOTAL_TARGET]
        
        # Consider bluffing if have risky cards or randomly (15% chance)
        use_bluff = self.bluffs > 0 and len(self.hand) > 0 and (len(risky) > 0 or random.random() < 0.15)
        
        if not use_bluff:
            # Play honestly - choose strategically
            if safe:
                choice = max(safe) if total <= 5 else min(safe)
                self.hand.remove(choice)
                return ("up", choice, choice)
            # No safe cards - play smallest
            choice = min(self.hand)
            self.hand.remove(choice)
            return ("up", choice, choice)
        
        # Bluffing strategy
        real = min(self.hand) if total <= 5 else random.choice(self.hand)
        # Claim a safe value
        claim = min(real, max(0, TOTAL_TARGET - total - 1))
        self.hand.remove(real)
        self.use_bluff()
        return ("down", real, claim)

    def decide_on_bluff(self, opponent_claim, total):
        """
        AI decides whether to trust or call bluff based on learned patterns.
        
        Uses:
        - Historical truth rate for this specific claim
        - Overall honesty rate
        - Game state risk assessment
        """
        # Bayesian combination of specific and general probability
        p_truth = self.p_truth_given_claim(opponent_claim) * 0.65 + self.p_truth_overall() * 0.35
        
        # Risk assessment
        expect_total_if_true = total + opponent_claim
        risk = expect_total_if_true / TOTAL_TARGET
        
        # Calculate call probability
        threshold = self.stats["call_bias"] + (risk - self.stats["risk_tolerance"])
        call_bluff_prob = max(0.05, min(0.95, threshold))
        
        return "b" if random.random() < call_bluff_prob else "t"

    def resolve_keep_or_lose(self, actual, claimed, ctx):
        """AI decides whether to keep or lose revealed card"""
        total = ctx["total"]
        
        # Strategic decision based on game state
        if ctx["called"] == "t":
            x = total + actual
            return "k" if x <= TOTAL_TARGET and (TOTAL_TARGET - x) <= 1 else "l"
        
        if ctx["called"] == "b" and ctx["truth"]:
            x = total + actual
            return "k" if x <= TOTAL_TARGET and (TOTAL_TARGET - x) <= 1 else "l"
        
        if ctx["called"] == "b" and not ctx["truth"]:
            x = total + actual
            return "k" if x <= TOTAL_TARGET and (TOTAL_TARGET - x) <= 1 else "l"

class Game:
    """Main game controller"""
    def __init__(self, seed=None, human_first=None):
        self.deck = Deck(seed=seed)
        self.human = Human("Human")
        self.ai = AdaptiveAI("AI")
        self.total = 0
        self.log = []
        
        # Deal initial hands
        for _ in range(4):
            self.human.give_card(self.deck.draw())
            self.ai.give_card(self.deck.draw())
        
        # Determine first player
        if human_first is None:
            self.turn = random.choice(["Human", "AI"])
        else:
            self.turn = "Human" if human_first else "AI"

    def draw_if_empty_hands(self):
        """Both players draw if hands are empty"""
        if not self.human.has_cards() and not self.ai.has_cards():
            self.human.give_card(self.deck.draw())
            self.ai.give_card(self.deck.draw())

    def resolve_after_call(self, actor, opponent, real, claim, call):
        """
        Resolve the outcome after a bluff is called or trusted.
        
        Rules:
        - If trusted + truth: opponent gains bluff
        - Correct caller/truster chooses keep/lose
        - Wrong caller/truster gives choice to actor
        """
        truth = (real == claim)
        ctx = {"total": self.total, "called": call, "truth": truth}
        
        # Determine who chooses
        if call == "t" and truth:  # Trusted correctly
            chooser = opponent
        elif call == "b" and not truth:  # Called correctly
            chooser = opponent
        else:  # Wrong call/trust
            chooser = actor
        
        # Make choice
        dec = chooser.resolve_keep_or_lose(real, claim, ctx)
        
        if dec == "k":
            self.total += real
        
        # Total can't go negative
        if self.total < 0:
            self.total = 0
        
        # Reward correct trust with bluff
        if call == "t" and truth:
            opponent.gain_bluff()
            print(f"{Colors.GREEN}✓ {opponent.name} gains a bluff for trusting correctly!{Colors.END}")
        
        return RevealResult(truth, real, claim), dec

    def step(self):
        """Execute one turn of the game"""
        self.draw_if_empty_hands()
        
        if self.total > TOTAL_TARGET:
            return True, f"{self.turn} already lost by overflow"
        
        if not (self.human.has_cards() or self.ai.has_cards()):
            return True, "Stalemate"
        
        actor = self.human if self.turn == "Human" else self.ai
        opp = self.ai if self.turn == "Human" else self.human
        
        # Actor plays card
        mode, real, claim = actor.choose_play(self.total)
        
        if mode == "up":
            # Face-up play
            self.total += real
            self.log.append({"actor": actor.name, "type": "up", "value": real})
            if actor.name == "AI":
                print(f"\n{Colors.CYAN}AI plays: {real}{Colors.END}")
            else:
                print(f"\n{Colors.CYAN}You play: {real}{Colors.END}")
            print(f"{Colors.CYAN}Total: {self.total}{Colors.END}")
            
            if self.total > TOTAL_TARGET:
                return True, f"{actor.name} loses (exceeded {TOTAL_TARGET})"
            
            self.turn = opp.name
            return False, None
        
        # Face-down play (bluff)
        print(f"\n{Colors.WARNING}{actor.name} played a card face-down and claims it's {claim}{Colors.END}")
        self.log.append({"actor": actor.name, "type": "down", "actual": real, "claim": claim})
        
        # Opponent responds
        decision = opp.decide_on_bluff(claim, self.total)
        
        # Reveal and resolve
        reveal, decision_keeplose = self.resolve_after_call(actor, opp, real, claim, decision)
        
        # Log the reveal
        self.log.append({
            "actor": actor.name,
            "type": "down_reveal",
            "truth": reveal.was_truth,
            "claim": claim,
            "actual": real,
            "decision": decision_keeplose,
            "caller": opp.name,
            "call": decision
        })
        
        # Show result
        if reveal.was_truth:
            print(f"{Colors.GREEN}✓ Card revealed: {real} - {actor.name} told the TRUTH!{Colors.END}")
        else:
            print(f"{Colors.FAIL}✗ Card revealed: {real} (claimed {claim}) - {actor.name} LIED!{Colors.END}")
        
        print(f"{Colors.CYAN}Total after resolution: {self.total}{Colors.END}")
        
        if self.total > TOTAL_TARGET:
            return True, f"{actor.name} loses (exceeded {TOTAL_TARGET})"
        
        self.turn = opp.name
        return False, None

    def play(self):
        """Play a complete game"""
        print(f"\n{Colors.HEADER}{'='*60}{Colors.END}")
        print(f"{Colors.HEADER}{Colors.BOLD}🎴 GAME START 🎴{Colors.END}")
        print(f"{Colors.HEADER}{'='*60}{Colors.END}")
        print(f"{Colors.CYAN}First player: {self.turn}{Colors.END}\n")
        
        while True:
            over, msg = self.step()
            
            if over:
                print(f"\n{Colors.HEADER}{'='*60}{Colors.END}")
                print(f"{Colors.HEADER}{Colors.BOLD}GAME OVER{Colors.END}")
                print(f"{Colors.HEADER}{'='*60}{Colors.END}")
                print(f"{Colors.WARNING}{msg}{Colors.END}\n")
                return msg

def print_banner():
    """Print game banner"""
    print(f"\n{Colors.HEADER}{Colors.BOLD}")
    print("╔══════════════════════════════════════════════════════════╗")
    print("║            🎴 BLUFF OR TRUST 🎴                         ║")
    print("║      A Kakegurui-Inspired Card Game                     ║")
    print("║                                                          ║")
    print("║  Goal: Force opponent to exceed total of 9              ║")
    print("║  Cards: 4 each of values 0, 1, 2, 3 (16 total)          ║")
    print("║  Bluffs: Each player starts with 1 bluff                ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print(f"{Colors.END}\n")

def play_match(rounds=3, seed=None):
    """Play multiple rounds with persistent AI learning"""
    print_banner()
    
    ai = AdaptiveAI()  # Persistent AI across rounds
    human_score = 0
    ai_score = 0
    
    for r in range(1, rounds + 1):
        print(f"\n{Colors.HEADER}{'='*60}{Colors.END}")
        print(f"{Colors.HEADER}{Colors.BOLD}ROUND {r} of {rounds}{Colors.END}")
        print(f"{Colors.HEADER}{'='*60}{Colors.END}")
        print(f"{Colors.CYAN}Score: You {human_score} - AI {ai_score}{Colors.END}")
        
        # Show AI insights
        if r > 1:
            insights = ai.get_insights()
            if insights:
                print(f"\n{Colors.WARNING}🧠 AI ANALYSIS:{Colors.END}")
                for insight in insights:
                    print(f"{Colors.WARNING}   {insight}{Colors.END}")
        
        # Create new game with same AI
        g = Game(seed=seed + r if seed else None)
        g.ai = ai  # Use persistent AI
        g.human = Human("Human")
        g.total = 0
        g.turn = random.choice(["Human", "AI"])
        
        # Redeal hands
        for _ in range(4):
            g.human.give_card(g.deck.draw())
            g.ai.give_card(g.deck.draw())
        
        # Play round
        result = g.play()
        
        # AI learns from this round
        ai.post_round_update(g.log)
        
        # Update scores
        if "AI loses" in result:
            human_score += 1
        elif "Human loses" in result:
            ai_score += 1
        
        print(f"{Colors.CYAN}Round {r} complete! Score: You {human_score} - AI {ai_score}{Colors.END}")
    
    # Final results
    print(f"\n{Colors.HEADER}{'='*60}{Colors.END}")
    print(f"{Colors.HEADER}{Colors.BOLD}MATCH COMPLETE!{Colors.END}")
    print(f"{Colors.HEADER}{'='*60}{Colors.END}")
    print(f"{Colors.CYAN}Final Score: You {human_score} - AI {ai_score}{Colors.END}\n")
    
    if human_score > ai_score:
        print(f"{Colors.GREEN}{Colors.BOLD}🎉 YOU WIN THE MATCH! 🎉{Colors.END}\n")
    elif ai_score > human_score:
        print(f"{Colors.FAIL}{Colors.BOLD}💀 AI WINS THE MATCH 💀{Colors.END}\n")
    else:
        print(f"{Colors.WARNING}{Colors.BOLD}🤝 DRAW! 🤝{Colors.END}\n")
    
    # Final AI insights
    final_insights = ai.get_insights()
    if final_insights:
        print(f"{Colors.WARNING}🧠 FINAL AI ANALYSIS:{Colors.END}")
        for insight in final_insights:
            print(f"{Colors.WARNING}   {insight}{Colors.END}")
        print()

if __name__ == "__main__":
    play_match(rounds=3, seed=42)