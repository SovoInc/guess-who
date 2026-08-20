# How to Play Guess Who

Guess Who is a single-player deduction game (you vs. a CPU opponent) where you
narrow down a board of suspects to identify a hidden **spy**. Catch your spy
before time runs out — and before the CPU catches its spy — to win.

## The Goal

At the start of a game you and the CPU are each secretly assigned a **spy** from
the board. Your job is to figure out **which character is your spy** by asking
yes/no questions and eliminating the suspects who can't be it. When you're
confident, you **declare** your spy. Declare correctly and you win; declare the
wrong character and you lose.

## The Board

- The board shows **16 characters**, drawn from a roster of 32.
- Each character has visible attributes: sex, headwear, hair, facial hair,
  eyewear, and a distinctive marker (scar, eyepatch, radio, badge, etc.).
- Your own spy is marked on your board so you don't accidentally eliminate it.

## A Turn

The game alternates turns between you and the CPU (turn order is randomized at
the start).

### Your turn

1. **Ask a yes/no question** about an attribute — e.g. "Does your spy wear
   glasses?" You have a limited number of questions per game (see limits below).
2. The answer is verified and returned to you.
3. **Eliminate suspects** by clicking their cards. A crossed-out card is
   eliminated; click again to restore it if you change your mind. You can never
   eliminate your own spy.

> **Honesty matters.** When it's the CPU's turn it asks *you* a question. If you
> answer dishonestly (a "lie"), a local answer-consistency check in the game
> client catches it and you take a **10-second time penalty**. (Only your final
> guess is verified on-chain by a ZK proof — lie detection is not on-chain.)

### CPU turn

The CPU plays at the same time. It asks information-optimal questions (trying to
split the remaining suspects in half), eliminates suspects based on your
answers, and will **declare** as soon as it has narrowed down to a single
suspect. If the CPU declares your spy correctly before you finish, **the CPU
wins**.

## Eliminating and Declaring

- **Eliminate** suspects throughout the game until only two cards remain on your
  board: your own spy (marked gold) and one other suspect.
- At that point you can enter **declare mode** and select the remaining
  non-gold card as your guess for the spy.
- Your guess is evaluated, and on-chain a zero-knowledge proof confirms whether
  it matches the committed spy.

## Winning and Losing

| Outcome | Condition |
|---|---|
| **Win** | You declare the **correct** spy. |
| **Lose** | You declare the **wrong** spy. |
| **Lose** | The **timer expires** before you declare (shown as "TIME EXPIRED"). |
| **Lose** | The **CPU declares your spy** correctly first. |

There is no "try again" on a declaration — a wrong guess ends the game.

## Limits

| Limit | Value |
|---|---|
| Questions per game | **10** |
| Game timer | **180 seconds** (3 minutes) |
| Lie penalty | **−10 seconds** |
| CPU turn delay | ~2.4 seconds |

## Scoring

Your final score is **0 if your guess is wrong**. If you declare the correct
spy, your score is computed **by the server** when you declare — it is the sum
of a **time bonus** and a **question-efficiency bonus**:

```
finalScore = (timeRemaining * 10) + (questionsRemaining * 200)
```

### Time bonus

- Every second left on the clock when you declare correctly is worth **10
  points**.
- With a 180-second timer, the maximum time bonus is **1,800 points**.

### Question-efficiency bonus

- Every unused question (out of 10) is worth **200 points** when you declare
  correctly — up to **2,000 points**.

### Combo meter (in-game feedback)

While you play, the HUD shows a **combo meter** that rewards eliminating with
intel. It is play-style feedback only and does not affect your recorded score:

| Elimination type | Combo points |
|---|---|
| **Full combo** — eliminating all cards ruled out by a piece of intel | **200 × N** (N = cards eliminated) |
| **Partial intel** — eliminating a card supported by intel | **100** per card |
| **Wild guess** — eliminating a card with no supporting intel | **0** (and a warning) |

The takeaway: ask questions, then eliminate the suspects your answers rule out —
and declare quickly, with questions to spare, for the best score.

## After the Game

- **Leaderboard** — the top correct guesses are ranked by **score (highest
  first)**, with ties broken by **fewest questions used**. Each entry records
  your shielded wallet address, score, questions used, time elapsed, and date.
- **Player stats** — your total `spies_caught` and `games_played` are tracked
  per wallet address.
- **Achievements** — there is a unique achievement for each of the 32 roster
  agents, unlocked once the first time you correctly identify that agent as
  the spy:
  - Atlas Toppled, Falcon Downed, Vega Eclipsed, Titan Felled, Blaze Doused,
    Halo Dimmed, Razor Dulled, Sentinel Stood Down (bucket A)
  - Viper Exposed, Raven Caged, Bishop Checked, Echo Silenced, Hydra Beheaded,
    Nova Neutralised, Cipher Cracked, Pulse Flatlined (bucket B)
  - Archer Disarmed, Orion Grounded, Kraken Sunk, Wolf Collared, Talon Clipped,
    Zenith Lowered, Frost Thawed, Nomad Cornered (bucket C)
  - Ghost Busted, Cobra Defanged, Phantom Unmasked, Shade Illuminated,
    Striker Benched, Loki Outfoxed, Dagger Sheathed, Vector Nullified
    (bucket D)

## Game Flow at a Glance

```
Menu → connect wallet → start session
   → [your turn: ask question → eliminate suspects]
   → [CPU turn: answer its question (honestly!) ]
   → repeat until 2 cards remain
   → DECLARE SPY
       ↳ correct  → WIN  (score recorded, achievements awarded)
       ↳ wrong    → LOSE
   → (or) timer hits 0 / CPU declares first → LOSE
   → Result screen + leaderboard
```

For how the wallet and on-chain pieces work, see
[midnight-integration.md](./midnight-integration.md).
