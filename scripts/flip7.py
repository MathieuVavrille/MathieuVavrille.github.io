"""Compute the best strategy (and scores) using Bellman's equation, and store the result in an encoded json"""

import json

CARD_COUNTS = (1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)
TOTAL_NB_CARDS = sum(CARD_COUNTS)

def encode(draw):
    """Encode the draw into a single integer"""
    res = 0
    for i in range(13):
        res = res * 2 + draw[i]
    res = res * 16 + draw[13]//2
    res = res * 2 + draw[14]
    res = res * 2 + draw[15]
    return res

# Order of cards: plus 246810, times 2, second chance
def score(draw):
    """Get the score of a draw (does not include flip7)"""
    card_score = sum(i*min(draw[i], 1) for i in range(13))
    card_score += draw[13]
    if draw[14]:
        card_score *= 2
    return card_score

def repr(draw):
    """Representation of a draw, for visualization purpose"""
    s = ""
    for i in range(13):
        if draw[i]:
            s += f"{i}{'*'*(draw[i]-1)} "
    if draw[13] != 0:
        s += f"+{draw[13]} "
    if draw[14]:
        s += "x2 "
    s += "🤍"*draw[15]
    return s

CACHE = {}
def best_play_score(draw) -> float:
    """Compute the average score using the best strategy (Bellman's equation)"""
    if draw in CACHE:
        return CACHE[draw]
    nb_numbers = sum(1 for i in range(13) if draw[i] != 0)
    if nb_numbers == 7:  # Flip7 !
        CACHE[draw] = 15 + score(draw), 0
    else:
        score_if_continue = 0
        dlist = list(draw)
        for i in range(13):
            if CARD_COUNTS[i] > draw[i]:
                proba = (CARD_COUNTS[i] - draw[i]) / (TOTAL_NB_CARDS - nb_numbers)
                if draw[i] == 1:  # You already have the card
                    if draw[-1] == 1:  # But you have a second chance, oof
                        dlist[i] = 0
                        dlist[-1] = 0
                        reward = max(best_play_score(tuple(dlist)))
                        dlist[i] = 1
                        dlist[-1] = 1
                    else:  # RIP
                        reward = 0
                else:  # 
                    dlist[i] += 1
                    reward = max(best_play_score(tuple(dlist)))
                    dlist[i] -= 1
                score_if_continue += proba * reward
        CACHE[draw] = score(draw), score_if_continue
    return CACHE[draw]

CARDS = (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
for plus in range(0, 31, 2):
    for times in range(2):
        for life in range(2):
            EXAMPLE = CARDS + (plus, times, life)
            best_play_score(EXAMPLE)

encoded = {encode(k): v for k, v in CACHE.items()}

with open("results.json", "w") as f:
    json.dump(encoded, f)
