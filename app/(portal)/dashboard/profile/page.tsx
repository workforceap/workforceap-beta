import { getMemberState } from '@/lib/member/getMemberState';
import { effectiveStreak } from '@/lib/member/streakDisplay';
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { getProgramBySlug } from "@/lib/content/programs";
import { programDisplayTitle } from "@/lib/content/programTitle";
import { getScoreBreakdownSafeResult } from "@/lib/readiness/score";
// Use the client-safe questions file. This page doesn't need the answer
// key (only renders question text + member's recorded answer), so we
// avoid pulling the server-only answer-key module into this server
// component's import graph.
import {
  ASSESSMENT_QUESTIONS_PUBLIC as ASSESSMENT_QUESTIONS,
  TOTAL_POINTS_PUBLIC as TOTAL_POINTS,
} from "@/lib/assessment/questions";
import DashboardProfileForm from "@/components/portal/DashboardProfileForm";
import SettingsForm from "@/components/portal/SettingsForm";
import PushNotificationsToggle from "@/components/portal/PushNotificationsToggle";
import DeleteAccountButton from "@/components/portal/DeleteAccountButton";
import StartTourButton from "@/components/onboarding/StartTourButton";
import LanguageToggle from "@/components/portal/LanguageToggle";
import DownloadMyDataButton from "@/components/portal/DownloadMyDataButton";
import MemberFeedbackButton from '@/components/portal/MemberFeedbackButton';
import ThemeSelector from '@/components/theme/ThemeSelector';
import {
  getCounselorStarterProfileReview,
  getStarterProfileFieldLabels,
} from "@/lib/member/starterProfileReview";
import { MemberProfileKit } from "@/components/portal/kit/pages/member/MemberProfileKit";
import { isReadOnlyPortalAuditHeader } from "@/lib/audit/readOnlyPortalAudit";
import { getMemberProfilePhotoSignedUrl } from "@/lib/portal/memberProfilePhotoUrl";

const chunkLoadingCard = (
  label: string,
  minHeight: number,
) => (
  <div
    role="status"
    aria-live="polite"
    className="portal-card portal-card--flat"
    style={{
      minHeight,
      padding: "2.5rem 1.25rem",
      borderRadius: 12,
      textAlign: "center",
      color: "var(--color-on-surface-variant)",
      fontSize: "0.9rem",
      fontWeight: 600,
    }}
  >
    {label}
  </div>
);

const ResumeClient = dynamic(() => import("@/app/(portal)/dashboard/resume/ResumeClient"), {
  loading: () => chunkLoadingCard("Loading resume tools…", 280),
});

const ResumeCoachWorkspace = dynamic(() => import("@/components/portal/ResumeCoachWorkspace"), {
  loading: () => chunkLoadingCard("Loading resume coach…", 360),
});

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: "My Profile",
  description: "View and edit your profile.",
  path: "/dashboard/profile",
});
}

export default async function DashboardProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login?redirectTo=/dashboard/profile");
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const params = await searchParams;
  const requestedUi = typeof params?.ui === "string" ? params.ui : null;

  const userSelect = {
    id: true,
    fullName: true,
    email: true,
    phone: true,
    createdAt: true,
    enrolledProgram: true,
    enrolledAt: true,
    assessmentCompleted: true,
    assessmentCompletedAt: true,
    assessmentScore: true,
    assessmentScorePct: true,
    assessmentAnswers: true,
    notificationsUpdates: true,
    notificationsReminders: true,
    profile: {
      select: {
        profilePhone: true,
        profileAddress: true,
        city: true,
        state: true,
        zip: true,
        referralSource: true,
        profileLinkedin: true,
        profileBio: true,
        employmentStatus: true,
        educationLevel: true,
        financialAidInterest: true,
        resumeEnhancedPath: true,
        resumeOriginalPath: true,
        profilePhotoPath: true,
        hasEmploymentBarrier: true,
        barrierTypes: true,
        employmentStatusAtEnroll: true,
      },
    },
    // Multi-program: read enrolledByAdminId from the primary enrollment
    // (the counselor-created flag for the starter-profile review). Returns
    // an array of length 0 or 1 thanks to the partial unique index.
    courseEnrollments: {
      where: { isPrimary: true },
      select: {
        enrolledByAdminId: true,
      },
      take: 1,
    },
  } satisfies Prisma.UserSelect;

  type DashboardProfileUser = Prisma.UserGetPayload<{
    select: typeof userSelect;
  }>;
  type DashboardProfileUserFallback = Omit<DashboardProfileUser, "profile"> & {
    profile: null;
  };

  let dbUser: DashboardProfileUser | DashboardProfileUserFallback | null = null;
  let profileLoadFailed = false;

  try {
    dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: userSelect,
    });
  } catch (error) {
    profileLoadFailed = true;
    console.error(
      "[dashboard/profile] user+profile query failed, retrying without profile relation:",
      error,
    );
    const fallbackUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        createdAt: true,
        enrolledProgram: true,
        enrolledAt: true,
        assessmentCompleted: true,
        assessmentCompletedAt: true,
        assessmentScore: true,
        assessmentScorePct: true,
        assessmentAnswers: true,
        notificationsUpdates: true,
        notificationsReminders: true,
        courseEnrollments: {
          where: { isPrimary: true },
          select: {
            enrolledByAdminId: true,
          },
          take: 1,
        },
      },
    });
    dbUser = fallbackUser ? { ...fallbackUser, profile: null } : null;
  }

  if (!dbUser) redirect("/login");

  const nameParts = dbUser.fullName?.split(" ") ?? [];
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") ?? "";

  const program = dbUser.enrolledProgram
    ? getProgramBySlug(dbUser.enrolledProgram)
    : null;
  const rawAnswers = dbUser.assessmentAnswers;
  const assessmentAnswers =
    rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers)
      ? (rawAnswers as Record<string, unknown>)
      : null;

  const initials = dbUser.fullName
    ? dbUser.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "??";

  // Single source of truth: getMemberState returns consistent profile % across all surfaces.
  const memberState = await getMemberState(user.id, { readOnlyAudit });
  const profilePct = memberState.profileCompletenessPct;
  const completeness = profilePct;
  const witData = {
    name: dbUser.fullName ?? "",
    email: dbUser.email,
    phone: dbUser.phone ?? dbUser.profile?.profilePhone ?? "",
    recentEmployer: "—",
    targetJob: dbUser.enrolledProgram ? programDisplayTitle(dbUser.enrolledProgram) : "Target role",
    skills: program?.skills?.join(", ") ?? "—",
  };
  const hasEnhanced = !!dbUser.profile?.resumeEnhancedPath;
  const hasOriginal = !!dbUser.profile?.resumeOriginalPath;
  const starterProfileReview = getCounselorStarterProfileReview({
    wasCounselorCreated: !!dbUser.courseEnrollments?.[0]?.enrolledByAdminId,
    phone: dbUser.phone,
    profilePhone: dbUser.profile?.profilePhone,
    profileAddress: dbUser.profile?.profileAddress,
    city: dbUser.profile?.city,
    state: dbUser.profile?.state,
    zip: dbUser.profile?.zip,
    referralSource: dbUser.profile?.referralSource,
  });
  const starterProfileMissingLabels = getStarterProfileFieldLabels(
    starterProfileReview.missing,
  );

  // Kit profile is the DEFAULT; legacy is available at ?ui=legacy.
  // Wires to the same real endpoints the legacy forms use:
  //   account details → PATCH /api/member/dashboard-profile
  //   notifications   → PATCH /api/member/settings
  if (requestedUi !== "legacy") {
    const kitLocation = [dbUser.profile?.city, dbUser.profile?.state]
      .filter((part) => part && part.trim())
      .join(", ");
    const kitHeadline = program?.title
      ? `${program.title}${kitLocation ? ` · ${kitLocation}` : ""}`
      : kitLocation || "WorkforceAP Member";

    // ── Profile header badges (REAL data) ──
    // Three cheap, parallel reads feed the kit's header badges:
    //   • Certs earned   → UserCertification count
    //   • Readiness score → same getScoreBreakdownSafe helper the readiness
    //                       page uses (overallScore = capped sum of earned).
    //   • Daily streak    → MemberPoints.currentStreak gated by lastActiveDate
    //                       (effectiveStreak; the stored counter alone is stale).
    // Each badge is only shown when its value is meaningful (> 0), so a brand-new
    // member with no signal doesn't see "0 Certs / 0 Readiness / 0-day streak".
    const [certCount, readinessResult, pointsRow, profilePhotoUrl] = await Promise.all([
      prisma.userCertification.count({ where: { userId: user.id } }),
      getScoreBreakdownSafeResult(user.id),
      prisma.memberPoints.findUnique({
        where: { userId: user.id },
        select: { currentStreak: true, lastActiveDate: true },
      }),
      dbUser.profile?.profilePhotoPath
        ? getMemberProfilePhotoSignedUrl(user.id)
        : Promise.resolve(null),
    ]);
    const readinessBreakdown = readinessResult.breakdown;
    const readinessScore = Math.min(
      100,
      Object.values(readinessBreakdown).reduce((sum, b) => sum + b.earned, 0),
    );
    // Same rule as the home chip and the points page: a counter whose last
    // activity is older than yesterday is a lost streak and reads 0.
    const currentStreak = effectiveStreak({
      currentStreak: pointsRow?.currentStreak,
      lastActiveDate: pointsRow?.lastActiveDate,
    });

    const profileBadges: { label: string; bg: string; color: string }[] = [];
    if (certCount > 0) {
      profileBadges.push({
        label: `${certCount} ${certCount === 1 ? "cert" : "certs"}`,
        bg: "var(--wa-gold-soft)",
        color: "var(--wa-gold-dark)",
      });
    }
    if (readinessScore > 0) {
      profileBadges.push({
        label: `${readinessScore} readiness`,
        bg: "var(--wa-success-soft)",
        color: "var(--wa-success-dark)",
      });
    }
    if (currentStreak > 0) {
      profileBadges.push({
        label: `${currentStreak}-day streak`,
        bg: "var(--wa-accent-soft)",
        color: "var(--wa-accent-text)",
      });
    }

    return (
      <>
        {profileLoadFailed ? <span hidden data-portal-error-state="member-profile-load" /> : null}
        {readinessResult.loadFailed ? (
          <span hidden data-portal-error-state="member-profile-readiness-load" />
        ) : null}
        {readOnlyAudit && (
          <span hidden data-portal-audit-suppressed="resume-storage-provider-and-member-state-cache" />
        )}
        <MemberProfileKit
        live
        photoUrl={profilePhotoUrl}
        name={dbUser.fullName ?? ""}
        initials={initials}
        headline={kitHeadline}
        badges={profileBadges}
        email={dbUser.email}
        location={kitLocation}
        programInterest={dbUser.enrolledProgram ? programDisplayTitle(dbUser.enrolledProgram) : "Not enrolled"}
        programOptions={
          program?.title ? [program.title] : dbUser.enrolledProgram ? [programDisplayTitle(dbUser.enrolledProgram)] : ["Not enrolled"]
        }
        notifications={[
          {
            key: "updates",
            label: "Updates from WorkforceAP",
            enabled: dbUser.notificationsUpdates ?? true,
            field: "notificationsUpdates",
          },
          {
            key: "reminders",
            label: "Training reminders",
            enabled: dbUser.notificationsReminders ?? true,
            field: "notificationsReminders",
          },
        ]}
        accountPassthrough={{
          phone: dbUser.profile?.profilePhone ?? dbUser.phone ?? null,
          address: dbUser.profile?.profileAddress ?? null,
          state: dbUser.profile?.state ?? null,
          zip: dbUser.profile?.zip ?? null,
          referralSource: dbUser.profile?.referralSource ?? null,
          linkedin: dbUser.profile?.profileLinkedin ?? null,
          bio: dbUser.profile?.profileBio ?? null,
          hasEmploymentBarrier: dbUser.profile?.hasEmploymentBarrier ?? false,
          barrierTypes: dbUser.profile?.barrierTypes ?? [],
          employmentStatusAtEnroll: dbUser.profile?.employmentStatusAtEnroll ?? null,
        }}
        />
      </>
    );
  }

  return (
    <>
      {profileLoadFailed ? <span hidden data-portal-error-state="member-profile-load" /> : null}
      {readOnlyAudit && (
        <span hidden data-portal-audit-suppressed="resume-storage-provider-and-member-state-cache" />
      )}
      <h1 className="wa-sr-only">My Profile</h1>
      <div className="portal-profile-page" style={{ paddingBottom: "2rem" }}>
        {/* Profile hero banner */}
        <div className="portal-profile-hero">
          <div className="portal-profile-avatar">{initials}</div>
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "var(--color-on-surface)",
                margin: "0 0 0.375rem",
              }}
            >
              {dbUser.fullName ?? "Your Profile"}
            </h2>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              {program && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0.2rem 0.625rem",
                    borderRadius: "9999px",
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    background:
                      "color-mix(in srgb, var(--color-accent) 12%, transparent)",
                    color: "var(--wa-accent-text)",
                  }}
                >
                  {program.title}
                </span>
              )}
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--color-on-surface-variant)",
                }}
              >
                {dbUser.createdAt
                  ? `Member since ${new Date(dbUser.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`
                  : "WorkforceAP Member"}
              </span>
            </div>
            {/* Profile completeness bar */}
            <div
              style={{
                marginTop: "0.75rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <div className="portal-progress-bar wa-w-full md:wa-w-[180px]">
                <div
                  className="portal-progress-bar__fill"
                  style={{ width: `${profilePct}%` }}
                />
              </div>
              <span
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  color: "var(--color-on-surface-variant)",
                }}
              >
                {profilePct}% complete
              </span>
            </div>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: "0.5rem",
              flexShrink: 0,
              alignSelf: "flex-start",
            }}
          >
            <a
              href="#profile"
              className="btn btn-outline"
              style={{ fontSize: "0.8125rem" }}
            >
              Edit Profile
            </a>
            <a
              href="#resume"
              className="btn btn-outline"
              style={{ fontSize: "0.8125rem" }}
            >
              Resume
            </a>
            <a
              href="#settings"
              className="btn btn-outline"
              style={{ fontSize: "0.8125rem" }}
            >
              Settings
            </a>
          </div>
        </div>

        {/* Contact info card */}
        <div id="profile" className="portal-profile-section-card">
          <div className="portal-profile-section-card__header">
            <h2 className="portal-profile-section-card__title">
              Contact Information
            </h2>
          </div>
          <div className="portal-profile-section-card__body">
            <DashboardProfileForm
              defaultFirstName={firstName}
              defaultLastName={lastName}
              defaultPhone={dbUser.profile?.profilePhone ?? dbUser.phone ?? ""}
              defaultAddress={dbUser.profile?.profileAddress ?? ""}
              defaultCity={dbUser.profile?.city ?? ""}
              defaultState={dbUser.profile?.state ?? ""}
              defaultZip={dbUser.profile?.zip ?? ""}
              defaultReferralSource={dbUser.profile?.referralSource ?? ""}
              defaultLinkedin={dbUser.profile?.profileLinkedin ?? ""}
              defaultBio={dbUser.profile?.profileBio ?? ""}
              defaultFinancialAidInterest={
                dbUser.profile?.financialAidInterest ?? null
              }
              defaultHasEmploymentBarrier={
                dbUser.profile?.hasEmploymentBarrier ?? false
              }
              defaultBarrierTypes={dbUser.profile?.barrierTypes ?? []}
              defaultEmploymentStatusAtEnroll={
                dbUser.profile?.employmentStatusAtEnroll ?? null
              }
              starterProfileReviewRequired={starterProfileReview.required}
              starterProfileMissingFields={starterProfileMissingLabels}
            />
          </div>
        </div>

        {/* Account + Program cards side by side */}
        <div
          className="portal-profile-account-grid"
          style={{
            display: "grid",
            gridTemplateColumns: program
              ? "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))"
              : "1fr",
            gap: "1rem",
            marginBottom: "1rem",
          }}
        >
          <div className="portal-profile-section-card">
            <div className="portal-profile-section-card__header">
              <h2 className="portal-profile-section-card__title">Account</h2>
            </div>
            <div className="portal-profile-section-card__body">
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div>
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--color-on-surface-variant)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Email
                  </p>
                  <p
                    style={{
                      fontSize: "0.9375rem",
                      fontWeight: 600,
                      color: "var(--color-on-surface)",
                      margin: 0,
                    }}
                  >
                    {dbUser.email}
                  </p>
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--color-on-surface-variant)",
                      margin: "0.25rem 0 0",
                    }}
                  >
                    Cannot be changed here
                  </p>
                </div>
              </div>
            </div>
          </div>

          {program && (
            <div className="portal-profile-section-card">
              <div className="portal-profile-section-card__header">
                <h2 className="portal-profile-section-card__title">
                  Enrolled Program
                </h2>
                <Link
                  href="/dashboard/program"
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    color: "var(--wa-accent-text)",
                    textDecoration: "none",
                  }}
                >
                  View →
                </Link>
              </div>
              <div className="portal-profile-section-card__body">
                <p
                  style={{
                    fontSize: "0.9375rem",
                    fontWeight: 700,
                    color: "var(--color-on-surface)",
                    margin: "0 0 0.375rem",
                  }}
                >
                  {program.title}
                </p>
                {dbUser.enrolledAt && (
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--color-on-surface-variant)",
                      margin: 0,
                    }}
                  >
                    Enrolled{" "}
                    {dbUser.enrolledAt.toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Assessment card */}
        {dbUser.assessmentCompleted && (
          <div
            className="portal-profile-section-card"
            style={{ marginBottom: "1rem" }}
          >
            <div className="portal-profile-section-card__header">
              <h2 className="portal-profile-section-card__title">
                Skills Assessment
              </h2>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0.2rem 0.625rem",
                  borderRadius: "9999px",
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  background:
                    "color-mix(in srgb, var(--color-green) 10%, transparent)",
                  color: "var(--color-green)",
                }}
              >
                Complete
              </span>
            </div>
            <div className="portal-profile-section-card__body">
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "1.5rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--color-on-surface-variant)",
                      marginBottom: "0.375rem",
                    }}
                  >
                    Score
                  </p>
                  <p
                    style={{
                      fontSize: "2rem",
                      fontWeight: 800,
                      color: "var(--wa-accent-text)",
                      letterSpacing: "-0.04em",
                      margin: 0,
                      lineHeight: 1,
                    }}
                  >
                    {dbUser.assessmentScorePct ?? 0}
                    <span style={{ fontSize: "1rem" }}>%</span>
                  </p>
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--color-on-surface-variant)",
                      margin: "0.25rem 0 0",
                    }}
                  >
                    {dbUser.assessmentScore ?? 0}/{TOTAL_POINTS} points
                  </p>
                </div>
                {dbUser.assessmentCompletedAt && (
                  <div>
                    <p
                      style={{
                        fontSize: "0.8125rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--color-on-surface-variant)",
                        marginBottom: "0.375rem",
                      }}
                    >
                      Completed
                    </p>
                    <p
                      style={{
                        fontSize: "0.9375rem",
                        fontWeight: 600,
                        color: "var(--color-on-surface)",
                        margin: 0,
                      }}
                    >
                      {dbUser.assessmentCompletedAt.toLocaleDateString(
                        "en-US",
                        { month: "long", day: "numeric", year: "numeric" },
                      )}
                    </p>
                  </div>
                )}
              </div>
              <details style={{ marginTop: "1rem" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    color: "var(--color-on-surface-variant)",
                  }}
                >
                  View Assessment Answers
                </summary>
                {assessmentAnswers && (
                  <ul
                    style={{
                      marginTop: "1rem",
                      paddingLeft: "1.25rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    {ASSESSMENT_QUESTIONS.map((q) => {
                      const v =
                        assessmentAnswers[String(q.id)] ??
                        assessmentAnswers[q.id as unknown as string];
                      const text =
                        v == null
                          ? "—"
                          : typeof v === "string"
                            ? v
                            : JSON.stringify(v);
                      return (
                        <li
                          key={q.id}
                          style={{
                            marginBottom: "0.5rem",
                            color: "var(--color-on-surface-variant)",
                          }}
                        >
                          <strong style={{ color: "var(--color-on-surface)" }}>
                            Q{q.id}:
                          </strong>{" "}
                          {q.question} → {text}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </details>
            </div>
          </div>
        )}

        {/* Resume tools card */}
        <div
          id="resume"
          className="portal-profile-section-card"
          style={{ marginBottom: "1rem" }}
        >
          <div className="portal-profile-section-card__header">
            <h2 className="portal-profile-section-card__title">
              Resume &amp; AI Toolkit
            </h2>
          </div>
          <div className="portal-profile-section-card__body">
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--color-on-surface-variant)",
                marginBottom: "1.25rem",
                lineHeight: 1.6,
              }}
            >
              Upload, generate, and improve your resume without leaving your
              profile.
            </p>
            <div className="md:wa-hidden">
              <a
                href="/dashboard/resume"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 1rem",
                  background: "var(--surface-container-low)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--outline-variant)",
                  color: "var(--wa-accent-text)",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  marginBottom: "1rem",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "1.1rem" }}
                  aria-hidden="true"
                >
                  description
                </span>
                Manage My Resume →
              </a>
              <ResumeCoachWorkspace />
            </div>
            <div className="wa-hidden md:wa-block">
              <ResumeClient
                completeness={completeness}
                witData={witData}
                hasOriginal={hasOriginal}
                hasEnhanced={hasEnhanced}
              />
              <ResumeCoachWorkspace />
            </div>
          </div>
        </div>

        {/* Settings card */}
        <div id="settings" className="portal-profile-section-card">
          <div className="portal-profile-section-card__header">
            <h2 className="portal-profile-section-card__title">
              Account Settings
            </h2>
          </div>
          <div className="portal-profile-section-card__body">
            <div style={{ display: "grid", gap: "1.5rem" }}>
              <section>
                <h3
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--color-on-surface)",
                    marginBottom: "0.75rem",
                  }}
                >
                  Email Notifications
                </h3>
                <SettingsForm
                  defaultUpdates={dbUser.notificationsUpdates ?? true}
                  defaultReminders={dbUser.notificationsReminders ?? true}
                />
                <div style={{ marginTop: "1rem" }}>
                  <PushNotificationsToggle />
                </div>
              </section>
              <section>
                <h3
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--color-on-surface)",
                    marginBottom: "0.75rem",
                  }}
                >
                  Password &amp; Security
                </h3>
                <div
                  style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}
                >
                  <Link
                    href={`/forgot-password?email=${encodeURIComponent(dbUser.email)}`}
                    className="btn btn-outline"
                  >
                    Reset password
                  </Link>
                  <StartTourButton />
                </div>
              </section>
              <section>
                <h3
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--color-on-surface)",
                    marginBottom: "0.75rem",
                  }}
                >
                  Language
                </h3>
                <LanguageToggle />
              </section>
              <section>
                <h3
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--color-on-surface)",
                    marginBottom: "0.75rem",
                  }}
                >
                  Appearance
                </h3>
                <ThemeSelector />
              </section>
              <section>
                <h3
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--color-on-surface)",
                    marginBottom: "0.75rem",
                  }}
                >
                  Data Privacy
                </h3>
                <DownloadMyDataButton />
              </section>
              <section>
                <h3
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--color-on-surface)",
                    marginBottom: "0.75rem",
                  }}
                >
                  Feedback
                </h3>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--color-on-surface-variant)",
                    marginBottom: "0.75rem",
                    lineHeight: 1.55,
                  }}
                >
                  Have suggestions or found a bug? We want to hear from you.
                </p>
                <MemberFeedbackButton />
              </section>
              <section>
                <h3
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--wa-accent-text)",
                    marginBottom: "0.75rem",
                  }}
                >
                  Danger Zone
                </h3>
                <DeleteAccountButton />
              </section>
            </div>
          </div>
        </div>
      </div>    </>
  );
}
