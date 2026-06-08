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
> answer dishonestly (a "lie"), the chain verification catches it and you take a
> **10-second time penalty**.

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
spy, your score is the sum of the **combo points** you earned during play plus a
**time bonus**:

```
finalScore = comboPointsEarned + (timeRemaining * 10)
```

### Combo points (earned while eliminating)

How you earn points for an elimination depends on whether you used the
information ("intel") from your questions:

| Elimination type | Points |
|---|---|
| **Full combo** — eliminating all cards ruled out by a piece of intel | **200 × N** (N = cards eliminated) |
| **Partial intel** — eliminating a card supported by intel | **100** per card |
| **Wild guess** — eliminating a card with no supporting intel | **0** (and a warning) |

The takeaway: ask questions, then eliminate the suspects your answers rule out —
clearing a whole group at once is worth the most.

### Time bonus

- Every second left on the clock when you declare correctly is worth **10
  points**.
- With a 180-second timer, the maximum time bonus is **1,800 points**.

## After the Game

- **Leaderboard** — the top correct guesses are ranked by **score (highest
  first)**, with ties broken by **fewest questions used**. Each entry records
  your shielded wallet address, score, questions used, time elapsed, and date.
- **Player stats** — your total `spies_caught` and `games_played` are tracked
  per wallet address.
- **Achievements** — there is a unique achievement for each catchable spy
  (Viper, Cipher, Nova, Phantom, Rook, Echo, Lancer, Blaze, Jade, Steel, Iris,
  Kade, Orion, Sable, Wren, Zara). Each unlocks once, the first time you
  correctly identify that spy.

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
