import random
from collections import deque, defaultdict
from dataclasses import dataclass

VALUES = [0, 1, 2, 3]
TOTAL_TARGET = 9

@dataclass
class RevealResult:
    was_truth: bool
    actual_value: int
    claimed_value: int

class Deck:
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
    def choose_play(self, total):
        print(f"\nYour Cards: {sorted(self.hand)} | Your bluffs: {self.bluffs} | Current total: {total}")
        while True:
            m = input("Play card (0-3): ").strip()
            if m.isdigit() and int(m) in VALUES and int(m) in self.hand:
                chosen = int(m)
                break
            print("Please play a card from your hand")
        # remove first occurrence of chosen value
        idx = self.hand.index(chosen)
        face = "u"
        if self.bluffs > 0:
            face = input("Face-up 'u' or face-down 'd' (bluff): ").strip().lower() or "u"
        if face not in ("u","d"):
            face = "u"
        card = self.remove_card(idx)
        if face == "u":
            return ("up", card, card)
        if not self.use_bluff():
            return ("up", card, card)
        claim_in = input(f"Claim value (0..3) for your face-down card {card}: ").strip()
        claim = int(claim_in) if claim_in.isdigit() and int(claim_in) in VALUES else card
        return ("down", card, claim)

    def decide_on_bluff(self, opponent_claim, total):
        while True:
            x = input(f"Opponent claimed {opponent_claim} face-down. Trust 't' or Bluff 'b'?: ").strip().lower()
            if x in ("t","b"): return x

    def resolve_keep_or_lose(self, actual, claimed, ctx):
        while True:
            x = input("Choose KEEP 'k' or LOSE 'l' this card's value into the total: ").strip().lower()
            if x in ("k","l"): return x

class AdaptiveAI(PlayerBase):
    def __init__(self, name="AI"):
        super().__init__(name)
        self.stats = {
            "claims_true": 1,
            "claims_total": 2,
            "claim_hist": defaultdict(lambda: [1,2]),
            "player_face_down_rate": [1,2],
            "player_call_history": {"trust":1,"bluff":1},
            "risk_tolerance": 0.55,
            "call_bias": 0.5
        }

    def post_round_update(self, round_log):
        for e in round_log:
            if e["actor"] == "Human" and e["type"] == "down":
                self.stats["player_face_down_rate"][1] += 1
            if e["actor"] == "Human" and e["type"] == "down_reveal":
                self.stats["claims_total"] += 1
                if e["truth"]:
                    self.stats["claims_true"] += 1
                a = self.stats["claim_hist"][e["claim"]]
                a[1] += 1
                if e["truth"]:
                    a[0] += 1

    def p_truth_overall(self):
        return self.stats["claims_true"]/self.stats["claims_total"]

    def p_truth_given_claim(self, claim):
        a = self.stats["claim_hist"][claim]
        return a[0]/a[1]

    def choose_play(self, total):
        safe = [v for v in self.hand if total+v<=TOTAL_TARGET]
        risky = [v for v in self.hand if total+v>TOTAL_TARGET]
        use_bluff = self.bluffs>0 and len(self.hand)>0 and (len(risky)>0 or random.random()<0.15)
        if not use_bluff:
            if safe:
                choice = max(safe) if total<=5 else min(safe)
                self.hand.remove(choice)
                return ("up", choice, choice)
            choice = min(self.hand)
            self.hand.remove(choice)
            return ("up", choice, choice)
        real = min(self.hand) if total<=5 else random.choice(self.hand)
        claim = min(real, max(0, TOTAL_TARGET-total-1))
        self.hand.remove(real)
        self.use_bluff()
        return ("down", real, claim)

    def decide_on_bluff(self, opponent_claim, total):
        p_truth = self.p_truth_given_claim(opponent_claim)*0.65 + self.p_truth_overall()*0.35
        expect_total_if_true = total + opponent_claim
        risk = expect_total_if_true/TOTAL_TARGET
        threshold = self.stats["call_bias"] + (risk - self.stats["risk_tolerance"])
        call_bluff_prob = max(0.05, min(0.95, threshold))
        return "b" if random.random()<call_bluff_prob else "t"

    def resolve_keep_or_lose(self, actual, claimed, ctx):
        total = ctx["total"]
        if ctx["called"]=="t":
            x = total+actual
            return "k" if x<=TOTAL_TARGET and (TOTAL_TARGET-x)<=1 else "l"
        if ctx["called"]=="b" and ctx["truth"]:
            x = total+actual
            return "k" if x<=TOTAL_TARGET and (TOTAL_TARGET-x)<=1 else "l"
        if ctx["called"]=="b" and not ctx["truth"]:
            x = total+actual
            return "k" if x<=TOTAL_TARGET and (TOTAL_TARGET-x)<=1 else "l"

class Game:
    def __init__(self, seed=None, human_first=None):
        self.deck = Deck(seed=seed)
        self.human = Human("Human")
        self.ai = AdaptiveAI("AI")
        self.total = 0
        self.log = []
        for _ in range(4):
            self.human.give_card(self.deck.draw())
            self.ai.give_card(self.deck.draw())
        if human_first is None:
            self.turn = random.choice(["Human","AI"])
        else:
            self.turn = "Human" if human_first else "AI"

    def draw_if_empty_hands(self):
        if not self.human.has_cards() and not self.ai.has_cards():
            self.human.give_card(self.deck.draw())
            self.ai.give_card(self.deck.draw())

    def resolve_after_call(self, actor, opponent, real, claim, call):
        truth = (real==claim)
        ctx = {"total": self.total, "called": call, "truth": truth}
        # Correct trust or correct call -> opponent chooses; otherwise actor chooses
        if (call == "t" and truth) or (call == "b" and not truth):
            chooser = opponent
        else:
            chooser = actor
        dec = chooser.resolve_keep_or_lose(real, claim, ctx)
        if dec=="k":
            self.total += real
        if self.total<0:
            self.total = 0
        if call=="t" and truth:
            opponent.gain_bluff()
        return RevealResult(truth, real, claim), dec

    def step(self):
        self.draw_if_empty_hands()
        if self.total>TOTAL_TARGET:
            return True, f"{self.turn} already lost by overflow"
        if not (self.human.has_cards() or self.ai.has_cards()):
            return True, "Stalemate"
        actor = self.human if self.turn=="Human" else self.ai
        opp = self.ai if self.turn=="Human" else self.human
        mode, real, claim = actor.choose_play(self.total)
        if mode=="up":
            self.total += real
            self.log.append({"actor":actor.name,"type":"up","value":real})
            if actor.name == "AI":
                print(f"AI plays: {real}")
            else:
                print(f"You play: {real}")
            print(f"Total: {self.total}")
            if self.total>TOTAL_TARGET:
                return True, f"{actor.name} loses (exceeded {TOTAL_TARGET})"
            self.turn = opp.name
            return False, None
        self.log.append({"actor":actor.name,"type":"down","actual":real,"claim":claim})
        if actor.name == "AI":
            print(f"AI plays a card face-down and claims {claim}")
        decision = opp.decide_on_bluff(claim, self.total)
        reveal, decision_keeplose = self.resolve_after_call(actor, opp, real, claim, decision)
        self.log.append({"actor":actor.name,"type":"down_reveal","truth":reveal.was_truth,"claim":claim,"actual":real,"decision":decision_keeplose,"caller":opp.name,"call":decision})
        if self.total>TOTAL_TARGET:
            return True, f"{actor.name} loses (exceeded {TOTAL_TARGET})"
        self.turn = opp.name
        return False, None

    def play(self):
        while True:
            over, msg = self.step()
            print(f"Total: {self.total}")
            if over:
                print(msg)
                return msg

def play_one_round(prev_ai_stats=None, seed=None):
    """Play a single round and return (result_message, updated_ai_stats)."""
    # Build a fresh game; if previous AI stats exist, carry them forward so the AI adapts over rounds.
    g = Game(seed=seed)
    if isinstance(g.ai, AdaptiveAI) and prev_ai_stats:
        g.ai.stats = prev_ai_stats
    print(f"\n=== New Round === | First: {g.turn}")
    result = g.play()
    # Update AI learning from this round and return the updated stats to persist across rounds.
    if isinstance(g.ai, AdaptiveAI):
        g.ai.post_round_update(g.log)
        return result, g.ai.stats
    return result, None

def play_match(rounds=1, seed=None):
    """Play multiple rounds in sequence (kept for compatibility)."""
    human_score = 0
    ai_score = 0
    ai_stats = None
    base_seed = seed if seed is not None else random.randint(1, 1_000_000)
    for r in range(1, rounds+1):
        print(f"\n=== Round {r} ===")
        result, ai_stats = play_one_round(prev_ai_stats=ai_stats, seed=base_seed + r)
        if "AI loses" in result:
            human_score += 1
        elif "Human loses" in result:
            ai_score += 1
        print(f"Score -> You {human_score} : AI {ai_score}")
    print("\nFinal:", "You win" if human_score>ai_score else ("AI wins" if ai_score>human_score else "Draw"))

if __name__ == "__main__":
    # Continuous play: run exactly one round at a time and ask if the player wants to continue.
    ai_stats = None
    human_score = 0
    ai_score = 0
    seed = 42
    while True:
        try:
            result, ai_stats = play_one_round(prev_ai_stats=ai_stats, seed=seed)
            # Update running score display (optional, but helpful)
            if "AI loses" in result:
                human_score += 1
            elif "Human loses" in result:
                ai_score += 1
            print(f"Score -> You {human_score} : AI {ai_score}")
            # Prompt to play again
            while True:
                ans = input("Play again? (Y) or (N): ").strip().lower()
                if ans in ("y", "n"):
                    break
                print("Please enter Y or N.")
            if ans == "n":
                print("\nThanks for playing!")
                break
            seed += 1
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break
