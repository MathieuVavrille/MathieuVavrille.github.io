
from functools import lru_cache

initial_draw = (0,)*13

TOTAL_NB_CARDS = 6 * 13 + 1

N = 8

def score(draw):
    return sum(i*draw[i] for i in range(13))

_cache = {}

@lru_cache
def best_play_score(draw):
    nb_cards = sum(draw)
    if nb_cards == 7:
        if nb_cards < N:
            print("   "*nb_cards, "F", draw, 15 + score(draw))
        _cache[draw] = 15 + score(draw)
        return 15 + score(draw)
    score_if_continue = 0
    for i in range(13):
        proba = (max(1, i) - draw[i]) / (TOTAL_NB_CARDS - nb_cards)
        if draw[i]:
            reward = 0
        else:
            draw_copy = list(draw)
            draw_copy[i] = 1
            reward = best_play_score(tuple(draw_copy))
        score_if_continue += proba * reward
    if nb_cards < N:
        print("  "*nb_cards, draw, max(score(draw), # Stop
                                      score_if_continue))
    do_stop = score(draw) >= score_if_continue
    _cache[draw] = (do_stop, score(draw), max(score(draw), # Stop
               score_if_continue))
    return max(score(draw), # Stop
               score_if_continue)

EXAMPLE = (1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0)
    
print(best_play_score(EXAMPLE))

print(len(_cache))
