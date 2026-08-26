# Scheduling support cases — expected vs. real

> **Status: fixed (SOU-281).** Cases 1 and 4a now schedule cleanly — the planner treats a
> shared student as a placement constraint, not just a post-run warning. The "Real" columns
> below show the **current (post-fix)** output; the original mismatch each case exposed is
> preserved in its *Gap* note for the record. Case 4b remains genuinely infeasible.

Analysis of the auto-planner (`SessionGenerator`, `planning.random-auto`) against four
manual QA scenarios from the product owner.

Encoded as executable tests in
`packages/domain/tests/unit/services/session-generator.support-cases.test.ts`; the
schedules and conflict lists below are the generator's **actual** output (deterministic
`fakeRandom`, which leaves the weekday/room order untouched so the results are stable).

## Fixed premises (all cases)

- **PS1** — the center is open **09:00–22:00** every day. Each teacher is *available* only
  **Tuesday and Thursday, 19:00–22:00**, so every session lands in that 3-hour window.
- **PS2** — ST = students, G = groups, S = subjects, T = teachers.
- **PS3** — rooms are unlimited; never the binding constraint here.
- Session length is **90 min**, so one 19:00–22:00 window holds exactly **two** back-to-back
  slots: `19:00–20:30` and `20:30–22:00`.
- Weekday pool = **[Tue, Thu]**, `minGapDays = 1`.

## How the planner places groups (needed to read the results)

The engine places groups **one at a time, greedily**, and fills the **earliest pool day
first**. It has exactly **two** mechanisms that push overlapping classes apart:

1. **Same-teacher packing** — when a group's teacher already has a block on a day, the next
   group for that same teacher anchors **after** it (back-to-back) instead of on top of it.
   (`teacherOccupiedByDay` in `session-generator.ts`.)
2. **Collision-aware room draw** — two blocks overlapping in time are given **different
   rooms**. (`assignRoomsToBlocks`.)

The decisive fact these cases originally exposed: **student rosters were not a placement
input.** The per-combination placement search (`conflictsFor`) was never given
`rosterByGroup`, so a shared student was detected only in the final pass as a non-blocking
warning, and the planner staggered two groups only when they shared a *teacher*.

**SOU-281 closes that gap.** A shared student is now a placement constraint, via two
coordinated changes in `session-generator.ts`:

1. **`placementBlockersFor`** — the per-day "occupied" set that pushes a group to a later
   slot now includes committed blocks that share *either a teacher or a student* with the
   group being placed (previously same-teacher only). This reuses the existing
   `weeklyBlockInFittingWindow` anchor search, so a shared-student group packs after the
   first instead of on top of it.
2. **`studentConflictsAgainstCommitted`** — the in-search `conflictsFor` now also flags a
   candidate block that double-books a shared student against an already-committed group, so
   the combination search prefers a clean weekday (rolling to another day when the first is
   full) exactly as it already does for room/teacher clashes.

When no clean placement exists (Case 4b), the existing place-and-warn fallback is unchanged:
the block is still placed and the residual clash reported, never silently dropped.

---

## Case 1 — two teachers, two subjects, one shared student

`G1 (S1) → T1`, `G2 (S2) → T2`; **ST1 is enrolled in both G1 and G2**. 2 sessions/week.

### 1) Expected
The planner staggers the two groups so ST1 can attend both:
`G1 19:00–20:30` and `G2 20:30–22:00` on each day (any of the 4 mirror-image arrangements
the brief lists is equally acceptable).

### 2) Real (post-fix)
| Group | Tue | Thu | Teacher |
|---|---|---|---|
| G1 | 19:00–20:30 | 19:00–20:30 | T1 |
| G2 | 20:30–22:00 | 20:30–22:00 | T2 |

Conflicts: **none**. ST1 attends G1 at 19:00 and G2 at 20:30 on both days.

### 3) Gap
**Closed.** *Before SOU-281* both groups landed at `19:00–20:30` (different teachers, so
same-teacher packing never fired; the shared student was only a post-run warning), and ST1
was double-booked every session. Now that a shared student is a placement constraint, G2
anchors after G1.

### 4) Reason
G1 and G2 have **different teachers**, so same-teacher packing alone would leave them
overlapping. `placementBlockersFor` adds G1's block to G2's per-day occupied set because they
share ST1, so the anchor search places G2 at the next free slot, 20:30.

---

## Case 2 — one teacher, one subject, two groups

`G1 & G2 (both S1) → T1`; no shared students. 1 session/week.

### 1) Expected
`G1 19:00–20:30` then `G2 20:30–22:00` (or swapped).

### 2) Real
| Group | Tue | Teacher |
|---|---|---|
| G1 | 19:00–20:30 | T1 |
| G2 | 20:30–22:00 | T1 |

Conflicts: **none**.

### 3) Gap
**None** — matches expectation.

### 4) Reason
Both groups share **teacher T1**, so same-teacher packing fires: G2 sees T1 already busy
19:00–20:30 on Tuesday and anchors right after, at 20:30. No student is shared, so no
student check triggers.

---

## Case 3 — two teachers, each with two groups of their own subject

`G1,G2 (S1) → T1`; `G3,G4 (S2) → T2`. Every group has its own students; **none shared**.
1 session/week.

### 1) Expected
Each teacher's pair packs back-to-back; independent rooms → no conflicts. (Same shape as
case 2, with more valid arrangements once you spread across days/rooms.)

### 2) Real
| Group | Tue | Room | Teacher |
|---|---|---|---|
| G1 | 19:00–20:30 | R4 | T1 |
| G2 | 20:30–22:00 | R4 | T1 |
| G3 | 19:00–20:30 | R3 | T2 |
| G4 | 20:30–22:00 | R3 | T2 |

Conflicts: **none**.

### 3) Gap
**None** functionally. One observation: with the deterministic test RNG the planner puts
**everything on Tuesday** and uses only two rooms — it does not spread the load across
Tue/Thu. That is legal (no conflict, rooms are unlimited) but not "balanced". Under real
randomness the weekday and room draw would vary; the planner optimizes for *conflict-free*,
not for *even spread*.

### 4) Reason
Same-teacher packing staggers each teacher's own pair; the collision-aware draw gives the
two simultaneous pairs different rooms (R4 vs R3). No student is shared across groups, so the
student check stays silent.

---

## Case 4 — two teachers, students shared across BOTH subjects

`G1,G2 (S1) → T1`; `G3,G4 (S2) → T2`.
Rosters: `G1={ST11,ST12}`, `G2={ST21,ST22}`, `G3={ST11,ST21}`, `G4={ST12,ST22}`.
Every student sits in **exactly one S1 group and one S2 group**, so **every S1 group clashes
with every S2 group** unless they are separated in day or time.

### 1) Expected — *(your requested input)*

The answer **depends on how many sessions per week each group needs**:

- **At 1 session/week — a fully conflict-free schedule EXISTS**, and it is the right expectation:
  put **T1's groups on Tuesday** and **T2's groups on Thursday** (or vice-versa).

  | Group | Day | Time |
  |---|---|---|
  | G1 | Tue | 19:00–20:30 |
  | G2 | Tue | 20:30–22:00 |
  | G3 | Thu | 19:00–20:30 |
  | G4 | Thu | 20:30–22:00 |

  No student's two groups ever share a day → **zero conflicts**. A correct planner should find this.

- **At 2 sessions/week — the scenario is genuinely INFEASIBLE.** Each teacher's two groups
  already consume the *entire* 19:00–22:00 window on *both* Tuesday and Thursday. There is no
  slot left for the other teacher's groups that any shared student can reach without a clash.
  Conflicts here are **unavoidable** — a property of the inputs, not a planner defect. The
  honest expected outcome is "reject / warn: not schedulable within the given availability".

### 2) Real (post-fix)

**1 session/week (4a)** — the planner splits the two subjects across the two days:

| Group | Day | Time | Teacher |
|---|---|---|---|
| G1 | Tue | 19:00–20:30 | T1 |
| G2 | Tue | 20:30–22:00 | T1 |
| G3 | Thu | 19:00–20:30 | T2 |
| G4 | Thu | 20:30–22:00 | T2 |

Conflicts: **none** — exactly the conflict-free split expected.

**2 sessions/week (4b)** — still infeasible: each teacher's two groups fill both days, so
T2's groups land on top of T1's and the shared students clash. The planner places every
group (2 blocks each) and **reports the residual clashes** (student + teacher conflicts)
rather than dropping anyone.

### 3) Gap
- **4a — closed.** *Before SOU-281* the planner stacked all four groups on Tuesday and
  produced two avoidable double-bookings (ST11 and ST22); ST12 and ST21 stayed clean only by
  luck. It now finds the Tue/Thu split and reports zero conflicts.
- **4b — unchanged and correct.** The conflicts are genuinely unavoidable at this load. The
  planner surfaces them as warnings; deciding to hard-reject an over-subscribed config (vs.
  warn) is a separate product call, not a planner defect.

### 4) Reason
The day search now rolls a group onto another weekday when the first is full of groups it
shares students with. Placing G1, G2 on Tuesday fills that day for anything sharing their
students; `studentConflictsAgainstCommitted` then flags G3/G4's Tuesday candidates, so the
search advances them to Thursday — the cross-day assignment the greedy fill previously never
explored.

---

## Summary (post-fix)

| Case | Expected | Real | Match? |
|---|---|---|---|
| 1 | Stagger G1/G2 for ST1 | G1 19:00 / G2 20:30, both days; 0 conflicts | ✓ |
| 2 | Pack back-to-back | Packed, 0 conflicts | ✓ |
| 3 | Pack each pair | Packed, 0 conflicts | ✓ |
| 4a (1/wk) | Split T1→Tue, T2→Thu | Exactly that split; 0 conflicts | ✓ |
| 4b (2/wk) | Infeasible | Placed + residual clashes reported | ✓ (correctly infeasible) |

**What changed (SOU-281):** the auto-planner used to treat a **shared teacher** as a hard
placement constraint but a **shared student** only as an after-the-fact warning — so whenever
the binding constraint was student overlap rather than teacher overlap (Cases 1 and 4a), it
stacked the groups. It now treats a shared student as a placement constraint too, via
`placementBlockersFor` (anchor packing) and `studentConflictsAgainstCommitted` (combo
search), so those cases schedule cleanly while the place-and-warn safety net for genuinely
infeasible configs (Case 4b) is untouched.

### Generality &amp; limits
The greedy engine already iterates over arbitrary numbers of teachers, groups, and students,
so the fix carries to any N. One honest limit remains: greedy placement has **no cross-group
backtracking**, so a pathologically dense overlap graph with tight windows can still have a
feasible schedule the planner won't find — in which case it falls back to place-and-warn
rather than dropping work. A "place most-constrained groups first" ordering heuristic would
raise the success rate if that ever bites in practice.
