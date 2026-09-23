# WorkforceAP Product Stakes

Purpose: protect decisions that agents should not casually rewrite.

## Rules
- **Locked**: do not change without explicit Mike approval.
- **Approval Required**: may propose, but do not silently ship.
- **Flexible**: safe to improve within the stated intent.

---

## Locked

### 1. Programs page stays visually open
- Public program groups on `/programs` stay expanded.
- Do not hide the catalog behind dropdowns or accordions.
- Reason: many target members will not intuit dropdown behavior.
- Key files:
  - `app/(decision-journey)/programs/ProgramsContent.tsx`
  - `lib/content/programSubgroup.ts`

### 2. Public members do not freely change programs/classes
- Admin/counselor reassignment stays internal.
- Do not reintroduce public self-serve class/program switching.
- Key files:
  - `app/(portal)/dashboard/program/page.tsx`
  - `components/admin/MemberDetailActions.tsx`
  - `app/api/admin/members/[id]/program/route.ts`

### 3. Public copy stays member-safe
- Prefer `no cost to members` and `funded by grants and partnerships`.
- Do not casually drift back to generic hypey `free` language on public surfaces.

### 4. Homepage hero must stay grounded
- If `Empowering People. Advancing Futures.` is used, the support copy below it must stay specific and operational.
- Do not let it become vague inspiration without concrete explanation.
- Key file:
  - `app/page.tsx`

### 5. Fresh PR rule
- New work goes on fresh branches and fresh PRs.
- Do not hide new work inside giant carryover branches.

---

## Approval Required

### Homepage CTA strategy
- Guided choice first, browsing second.
- Do not flip top-of-funnel CTA hierarchy casually.

### Programs quick-start framing
- Keep quick-start cards concrete and beginner-comprehensible.
- Prefer understandable anchors like IT Support.
- Key file:
  - `app/(decision-journey)/programs/page.tsx`

### Apply follow-up promises
- Do not tighten response-time promises unless ops can support them.
- Key file:
  - `app/apply/confirmation/page.tsx`

### Dashboard progress semantics
- Do not imply completion before real completion.
- Prefer truthful status language like `recommended`, `unlocked`, or `in progress`.
- Key files:
  - `components/portal/kit/pages/member/MemberHomeKit.tsx`
  - `lib/member/loadMemberDashboardHome.ts`

---

## Flexible
- plain-language error states
- loading/success/failure copy
- mobile spacing and hierarchy improvements
- trust/proof presentation
- dashboard next-step prominence
- quick-start clarity improvements that preserve current intent

---

## Agent rule
Before changing public WorkforceAP UX/copy/flow:
1. read this file
2. identify whether the change touches Locked or Approval Required areas
3. say so in the PR summary
4. keep the PR narrow
