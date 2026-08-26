# Scheduling support cases — expected vs. real

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

The decisive fact for these cases: **student rosters are _not_ a placement input.** The
per-combination placement search (`conflictsFor`) is never given `rosterByGroup`. A
student shared between two groups is detected **only in the final pass**, as a
**non-blocking `student` warning** (`detectGeneratedScheduleConflicts` →
`student-schedule-conflict.ts`). The planner therefore staggers two groups **only when they
share a teacher**, never when they merely share students.

---

## Case 1 — two teachers, two subjects, one shared student

`G1 (S1) → T1`, `G2 (S2) → T2`; **ST1 is enrolled in both G1 and G2**. 2 sessions/week.

### 1) Expected
The planner staggers the two groups so ST1 can attend both:
`G1 19:00–20:30` and `G2 20:30–22:00` on each day (any of the 4 mirror-image arrangements
the brief lists is equally acceptable).

### 2) Real
| Group | Tue | Thu | Teacher |
|---|---|---|---|
| G1 | 19:00–20:30 | 19:00–20:30 | T1 |
| G2 | 19:00–20:30 | 19:00–20:30 | T2 |

Conflicts: **4 `student` warnings** — ST1 double-booked (G1↔G2) on both Tue and Thu.
No room or teacher conflict.

### 3) Gap
The two groups are **not staggered**. They sit on top of each other at `19:00–20:30`, so
ST1 is double-booked every session. Expected a clean split; got a full overlap plus a warning.

### 4) Reason for the conflict
G1 and G2 have **different teachers**, so the only staggering mechanism — same-teacher
packing — never fires. Nothing else moves them apart, because the shared student **is not a
placement constraint**: the clash is discovered only after placement and reported as a
non-blocking warning, not avoided.

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

### 2) Real

**1 session/week** — all four groups stacked on **Tuesday**:

| Group | Tue | Room | Teacher |
|---|---|---|---|
| G1 | 19:00–20:30 | R4 | T1 |
| G2 | 20:30–22:00 | R4 | T1 |
| G3 | 19:00–20:30 | R3 | T2 |
| G4 | 20:30–22:00 | R3 | T2 |

Conflicts: **ST11** (G1↔G3, both 19:00–20:30) and **ST22** (G2↔G4, both 20:30–22:00) are
double-booked → 4 `student` warnings (each clash reported from both sides). ST12 and ST21
happen to land on adjacent, non-overlapping slots, so they are clean by luck.

**2 sessions/week** — all four groups on **Tue + Thu**, same stacking; **all four** shared
students double-booked → **8 `student` warnings**.

### 3) Gap
- **1/week:** large gap. A **zero-conflict** schedule exists (Tue for T1, Thu for T2), but the
  planner produces **two avoidable double-bookings** by piling every group onto Tuesday.
- **2/week:** no gap in outcome (conflicts are truly unavoidable), but the planner still only
  *warns*; it does not tell the admin the configuration is over-subscribed.

### 4) Reason
Identical root cause to Case 1, amplified by greedy day selection:

1. **Student rosters are not a placement constraint** — the planner never tries to keep a
   shared student's two groups apart; it only reports the clash afterward.
2. **Greedy, earliest-day-first placement** — with each group needing only one day, the
   engine takes the first feasible day (Tuesday) for *all four* groups instead of moving
   T2's groups to Thursday. It never explores the cross-group day assignment that would
   separate the two subjects.

---

## Summary

| Case | Expected | Real | Match? | Root cause |
|---|---|---|---|---|
| 1 | Stagger G1/G2 for ST1 | Both at 19:00–20:30; warn | ✗ | Shared student not a placement constraint; different teachers ⇒ no packing |
| 2 | Pack back-to-back | Packed, no conflicts | ✓ | Same-teacher packing fires |
| 3 | Pack each pair | Packed, no conflicts | ✓ | Same-teacher packing + room draw; no shared students |
| 4 (1/wk) | Split T1→Tue, T2→Thu (0 conflicts) | All on Tue; 2 clashes | ✗ | Rosters ignored in placement + greedy same-day fill |
| 4 (2/wk) | Infeasible / reject | Warns on 4 students | ~ | Truly infeasible; planner only warns, doesn't reject |

**One root cause explains every miss:** the auto-planner treats a **shared teacher** as a hard
placement constraint but a **shared student** only as an after-the-fact, non-blocking warning.
Whenever the binding constraint is student overlap rather than teacher overlap (Cases 1 and 4),
the planner stacks the groups and leaves the admin to resolve the reported clashes by hand.

### If this should be fixed
Two independent levers, in the domain engine only (`session-generator.ts`):

1. **Make student overlap a placement constraint** — thread `rosterByGroup` into
   `conflictsFor` so the per-combination search rejects a slot that double-books a shared
   student, exactly as it already does for teacher/room clashes.
2. **Let placement move groups across pool days** — so Case 4 (1/week) can put the two
   subjects on different days instead of greedily stacking day one.

Both are behavioral changes to the planner, out of scope for this report, which only
characterizes current behavior.
