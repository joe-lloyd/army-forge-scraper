# OPR Math-Hammer (BalVal) System

The BalVal (Balance Validation) system is a mathematical engine designed to estimate the real-world efficiency of One Page Rules (OPR) units by simulating combat probabilities. It calculates two main metrics: **Offensive Efficiency** and **Defensive Efficiency**, which are then combined into a single **BalVal Score**.

---

## 1. Offensive Calculations

Offensive efficiency measures how much raw damage a unit is expected to output per turn, adjusted for the targets it is shooting at or hitting.

### 1.1 Hit Chance
Hit chance is purely based on the attacker's **Quality** rating. 
OPR uses D6 dice, so the probability of rolling a target number $Q$ or higher is:

$$ \text{Hit Chance} = \frac{7 - Q}{6} $$

*Example: Quality 4+ means rolling 4, 5, or 6. $(7 - 4) / 6 = 3/6 = 50\%$*

### 1.2 Block Chance
Block chance depends on the defender's **Defense** rating minus the attacker's **AP** (Armor Piercing).
The effective defense is capped between 2+ and 7+. A 7+ defense means the armor is completely pierced and cannot block the attack.

$$ \text{Effective Defense} = \min(7, \max(2, \text{Defense} + \text{AP})) $$
$$ \text{Block Chance} = \max(0, \frac{7 - \text{Effective Defense}}{6}) $$

*Example: Defense 3+ hit by AP(2). Effective Defense becomes 5+. Block Chance = $(7 - 5) / 6 = 2/6 \approx 33\%$*

### 1.3 Damage Multipliers (Special Rules)
Special rules modify the expected damage output. The math engine uses heuristics to estimate their impact against an average target.

- **Deadly(X)**: Multiplies damage by $\min(X, \text{Target Toughness})$.
- **Blast(X)**: Multiplies damage by $\min(X, \text{Target Size})$.
- **Reliable**: Re-roll failed hits of 1. Mathematically adds $1/6 \times \text{Base Hits}$ to the total. Multiplier: $(1 + 1/6) \approx 1.167$.
- **Rending**: Ignores armor on a roll of 6. For simplicity in the raw comparison model, we divide the normal failure rate of the armor to simulate ignoring the block chance.

### 1.4 Total Weapon Offense
The total expected damage of a weapon is:

$$ \text{Weapon Offense} = \text{Attacks} \times \text{Hit Chance} \times (1 - \text{Block Chance}) \times \text{Damage Multiplier} $$

A unit's total offense is the sum of all its weapons' offenses.

---

## 2. Defensive Calculations

Defensive efficiency is measured as **Effective Health Points (EHP)**. This is how many "raw hits" from an AP(0) weapon it takes to completely destroy the unit.

### 2.1 Base EHP
Base EHP combines the unit's model count (Size), its wounds per model (Tough), and its armor (Defense).

$$ \text{Base EHP} = \frac{\text{Size} \times \text{Tough}}{1 - \text{Block Chance}(\text{Defense})} $$

*Example: A unit of 5 models, Tough 1, Defense 4+. Block Chance is $3/6 = 50\%$.*
*Base EHP = $(5 \times 1) / (1 - 0.5) = 10$. It takes 10 raw hits to kill them.*

### 2.2 Defensive Special Rules
- **Regeneration**: Ignore wounds on 5+. This mathematically increases EHP by roughly 33%. $\text{EHP} = \text{EHP} \times 1.33$
- **Stealth**: Enemies get -1 to hit. This reduces incoming hits by 1/6. $\text{EHP} = \text{EHP} \times 1.17$
- **Shielded**: Enemies get -1 to AP, mathematically treated as +1 Defense in base EHP calculation.

---

## 3. The BalVal Score

Finally, we calculate how efficient the unit is relative to its point cost.

$$ \text{Offense Efficiency} = \frac{\text{Total Offense}}{\text{Cost}} $$
$$ \text{Defense Efficiency} = \frac{\text{Effective HP}}{\text{Cost}} $$

The **Raw BalVal Score** is a weighted average of these two efficiencies. By default, it's a 50/50 split, but this can be adjusted in the configuration.

$$ \text{BalVal Score} = (\text{Offense Efficiency} \times W_{offense}) + (\text{Defense Efficiency} \times (1 - W_{offense})) $$

Units are then ranked by this raw score to place them into Percentiles and Tiers (S, A, B, C, D).
