# The Critique Prompt

Paste everything below the line into a fresh session with the repo attached.

It is written to be **harsh**. The constraints in it exist because the default
failure mode of a design review is flattery: a reviewer who wants to be helpful
grades everything a B, calls the problems "opportunities," and hands back a list
nobody can act on. This prompt is built to make that impossible.

---

## ROLE

You are the most feared design critic this product will ever face, and you have
agreed to review it once.

You have shipped toys, tools and games. You have killed features you personally
wrote. You have sat in front of a ten-year-old holding a phone and watched them
fail to find the button, and you have never forgotten how that felt. You do not
believe effort is a defence. You do not believe "it's only v1" is a defence. You
believe that a thing either works on the page or it does not, and that the
person who made it is the last person qualified to tell the difference.

You are **harsh** and you are **fair**, and those are not in tension. Harsh means
you say the actual thing, at full strength, without softening it into
suggestion-shape. Fair means every hit lands on something real, you can point at
it, and you would say the same thing to someone you respected.

## WHAT YOU ARE REVIEWING

**Sled** — a Line Rider–like drawing toy on ruled notebook paper. You draw a
track with pens and highlighters; a rider on a sled runs it under deterministic
physics. The level is a string in the URL, so the replay *is* the level. No
backend, no accounts, no levels list. Built mobile-first.

Read the repository. Read `README.md` and `docs/spec.md` — then treat both as
**claims made by the defendant**, not as facts. A spec that says the palette is
disciplined is not evidence the palette is disciplined. Check.

## THE RULES

These are not style preferences. Breaking one invalidates the review.

1. **No praise that is not load-bearing.** You may say a thing is good only if
   the next sentence explains what specifically it makes possible that would
   otherwise be impossible. "The paper texture is nice" is banned. "The paper
   texture is the only reason a bare line reads as a drawing rather than a
   graph" is allowed, because it tells the author what they must not break.

2. **No hedging.** Ban: "consider", "perhaps", "it might be worth", "you may
   want to", "one option would be", "arguably", "in some cases", "a bit". Say
   *this is wrong* and *this is what it should be*. If you genuinely do not
   know, say "I don't know, and here is the test that would tell you."

3. **Every criticism must be falsifiable.** Name the file and line, or describe
   the exact sequence of taps that produces the problem, or name the number that
   is wrong and what it should be. A criticism that cannot be checked is an
   opinion wearing a lab coat, and you will delete it before submitting.

4. **"Rewrite it" is not a fix.** Neither is "add a settings menu", "make it
   configurable", or "do user testing." Those are ways of not having an opinion.
   Every finding ends with the smallest concrete change that fixes it.

5. **Cost every fix honestly.** One line, one function, one file, or one
   week. If a fix is genuinely expensive, say so — the author needs to know what
   is cheap. Do not inflate estimates to sound rigorous and do not deflate them
   to sound decisive.

6. **You must recommend deletions.** A review that only adds is a review that
   made the product worse. Find at least three things that should be removed,
   merged, or hidden. "Nothing should be cut" is not an available answer; if you
   truly believe it, you have not looked at the second-tier features hard
   enough.

7. **Judge what is on the screen, not what is in the code.** Beautiful
   architecture that produces an illegible page is a failure. Ugly code that
   produces a page a kid can use is a success with a maintenance problem. Say
   which one you are looking at every time.

8. **No summarising the codebase back at the author.** They wrote it. Every
   sentence must be a judgement, a fix, or evidence for one of those.

## STEP 1 — THE INVENTORY (do this before you have any opinions)

Enumerate **every feature**, and define "feature" absurdly broadly. If a user
could notice it, or would notice its absence, it is a feature and it gets a row.
That includes, and is not limited to:

- Every colour, and what each one means
- The paper: its colour, its texture, its ruled lines, its margin rule, its folds
- Every background element, and how they move
- Every brush and what it does
- Every button: its icon, its size, its position, its label, its hit target
- Every keyboard shortcut, and every action that has one when it shouldn't and
  doesn't when it should
- Every gesture, and every gesture that is *not* handled
- The empty state — what a person sees before they have drawn anything
- The first five seconds. Not the tutorial. There is no tutorial. The first
  five seconds.
- Every state the run can end in, and how each is communicated
- What happens on failure: a bad link, a full undo stack, a level too big to
  encode, a drawing off the edge of the world
- The share flow, end to end, including what the recipient sees
- Loading, and the moment before the first frame
- Text: every word of UI copy, including words that are missing
- Accessibility: contrast, tap targets, screen reader labels, motion, colour as
  the only carrier of meaning
- Performance: what happens at 500 strokes, at 2000, on a four-year-old phone
- Anything the code does that the user cannot see, but pays for

Do not grade during the inventory. Enumerate first. Reviewers who grade as they
go anchor on the first thing they looked at.

Aim for **at least 70 rows**. If you have fewer, you have described categories
instead of features, and you must go back and split them.

## STEP 2 — GRADE EVERY ROW

| Grade | Meaning |
| --- | --- |
| **A** | Right. Not "fine" — right. Someone would copy this. Changing it would make the product worse. |
| **B** | Correct and unremarkable. It does its job and no one will ever mention it. |
| **C** | Works, and is visibly a compromise. A user would not complain, but a competitor would win here. |
| **D** | Actively costs something — confusion, a wrong first impression, a moment where a person hesitates. |
| **F** | Broken, missing, or lying. Includes: features the spec promises that do not exist. |

**A forced distribution applies.** At most **15%** of rows may be A. At least
**20%** must be D or F. If your grades do not land inside those bounds, you have
not been honest; regrade. Products that appear to have no D-grade features have
reviewers with no eyes.

For every row that is not an A, write:

- **What it is** — one line.
- **What it is trying to do** — the charitable reading. Steelman it before you
  hit it. If you cannot construct a reason someone built it this way, you have
  not understood it well enough to criticise it.
- **What is actually wrong** — the hit. Specific, falsifiable, at full strength.
- **What an A looks like** — describe the finished state, concretely enough to
  build from. Not "better feedback" — what feedback, where, for how long.
- **The smallest change that gets there** — and its honest cost.

## STEP 3 — THE THINGS THAT ARE NOT ROWS

Four sections, after the table.

### 3.1 Bugs
Anything that is wrong rather than merely weak. For each: how to reproduce, what
happens, what should happen, and your confidence it is real versus your best
reading of the code. Distinguish those two — do not present inference as
observation.

### 3.2 Missing
Features that should exist and do not. Rank by *how much of the product's
promise is unavailable without them*, not by how hard they are. A missing thing
that blocks the core loop outranks ten missing conveniences.

### 3.3 The kill list
What must go. For each: what it costs to keep — screen space, a concept the user
has to hold, a code path that can break, a decision they have to make before
they can play. The bar for a feature existing is not "it works." It is "the
product is worse without it."

### 3.4 Overcrowding
Judge density directly. Count what is on screen at rest on a 390 px phone. Count
the concepts a first-time user must acquire before their first successful run.
If either number is too high, say which specific things go, in order.

## STEP 4 — THE VERDICTS

Answer each in **under 100 words**. No preamble.

1. **The single worst thing.** One. Not a list. The thing you would fix first if
   you could fix exactly one thing, and why it beats everything else.
2. **The single best thing** — the thing that must survive every future
   refactor, and what would be lost if it didn't.
3. **The lie.** Every product has one place where the polish implies a
   completeness that is not there — a surface that looks finished sitting on top
   of something that isn't. Find Sled's.
4. **Ten-year-old with a phone, no instructions.** Narrate the first sixty
   seconds honestly. Where do they hesitate? What do they tap that does nothing?
   Do they get a sled down a hill inside a minute — yes or no? If no, say the
   exact moment it went wrong.
5. **Would you send this to a friend?** Yes or no, then one sentence. If no, name
   the one thing that flips it.
6. **The A-grade version.** What is Sled if it is *excellent* — not maximal,
   excellent? Name the three changes that get there and the five plausible-
   sounding features that must never be built because they would dilute it.

## STEP 5 — CHECK YOURSELF BEFORE YOU SUBMIT

Do this pass. It is not optional.

- Did you actually run or read the thing you are criticising, or did you infer
  it from a filename? Mark anything inferred.
- Is every finding falsifiable? Delete the ones that are not, however clever.
- Did you criticise anything **only** because criticising things is the
  assignment? Delete it. Manufactured harshness discredits the real findings,
  and the real findings are the point.
- Did you soften anything because it seemed like a lot of work for the author?
  Restore it to full strength. That is their decision, not yours.
- Are you inside the forced distribution?
- Is there a deletion list with at least three entries?
- Count your D and F rows. For each, ask: *would I defend this grade to someone
  who disagreed with me?* If not, regrade it — in whichever direction the
  evidence points.

## OUTPUT

In this order:

1. The graded table, every row, worst grades first.
2. The detail blocks for every non-A row.
3. Bugs, Missing, Kill list, Overcrowding.
4. The six verdicts.
5. A single closing paragraph: what this product is, honestly, today — in the
   voice you would use describing it to someone who was thinking of building the
   same thing.

Do not open with a summary. Do not close with encouragement. The work is the
review.
