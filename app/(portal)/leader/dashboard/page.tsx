"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { requestFailureMessage } from "@/lib/http/requestFailureCopy";
import PortalPageFrame from "@/components/portal/PortalPageFrame";
import PageHeader from "@/components/portal/PageHeader";
import DataTable, { type DataTableColumn } from "@/components/portal/ui/DataTable";
import { statusColor, type StatusTone } from "@/lib/ui/statusColors";
import { programDisplayTitle } from "@/lib/content/programTitle";

interface Member {
  id: string;
  fullName: string;
  email: string;
  enrolledProgram: string | null;
  assessmentCompleted: boolean;
  interviewEligible: boolean;
  placementRecord: { placedAt: string; employerName: string } | null;
}

interface ChapterMemberRow {
  user: Member;
  joinedAt: string;
  status: string;
}

interface ChapterMeeting {
  id: string;
  scheduledAt: string;
  location: string | null;
  topic: string | null;
  attendanceCount: number | null;
}

interface CurriculumItem {
  id: string;
  orderIndex: number;
  notes: string | null;
  course: { id: string; name: string; programSlug: string };
}

interface Chapter {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  meetingSchedule: string | null;
  meetingLocation: string | null;
  members: ChapterMemberRow[];
  meetings: ChapterMeeting[];
  curriculumItems: CurriculumItem[];
}

/** Warm one-liner + quiet icon for empty panels (no destructive/blank text). */
function EmptyPanel({ icon, text }: { icon: string; text: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
        padding: "1.75rem 1rem",
        textAlign: "center",
        color: "var(--color-on-surface-variant)",
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{ fontSize: "1.75rem", opacity: 0.6 }}
      >
        {icon}
      </span>
      <p style={{ margin: 0, fontSize: "0.85rem" }}>{text}</p>
    </div>
  );
}

function memberStatusTone(m: Member): { tone: StatusTone; label: string } {
  if (m.placementRecord) return { tone: "success", label: "Placed" };
  if (m.interviewEligible) return { tone: "info", label: "Interview ready" };
  if (m.assessmentCompleted) return { tone: "warning", label: "Assessed" };
  return { tone: "neutral", label: "New" };
}

export default function LeaderDashboardPage() {
  const tCommon = useTranslations("common");
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // For now, fetch the first chapter the user leads
    // In production, this would be /api/leader/chapters/me or similar
    fetch("/api/leader/chapters")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        // If array, take first; if single object, use it
        const ch = Array.isArray(data) ? data[0] : data;
        if (!ch) throw new Error("No chapter found");
        setChapter(ch);
      })
      .catch((e: unknown) => setError(requestFailureMessage(e, { connection: tCommon("connectionError"), fallback: "Could not load your chapter." }, "leader-dashboard")))
      .finally(() => setLoading(false));
  }, [tCommon]);

  const stats = chapter ? {
    total: chapter.members.length,
    active: chapter.members.filter((m) => m.status === "active").length,
    assessed: chapter.members.filter((m) => m.user.assessmentCompleted).length,
    interviewReady: chapter.members.filter((m) => m.user.interviewEligible).length,
    placed: chapter.members.filter((m) => m.user.placementRecord).length,
  } : null;

  const memberColumns: DataTableColumn<ChapterMemberRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (m) => <span style={{ fontWeight: 600 }}>{m.user.fullName}</span>,
    },
    { key: "program", header: "Program", cell: (m) => (m.user.enrolledProgram ? programDisplayTitle(m.user.enrolledProgram) : "—") },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (m) => {
        const { tone, label } = memberStatusTone(m.user);
        const { fg, bg, border } = statusColor(tone);
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0.2rem 0.6rem",
              borderRadius: "var(--radius-full)",
              fontSize: "0.8125rem",
              fontWeight: 700,
              color: fg,
              background: bg,
              border: `1px solid ${border}`,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
        );
      },
    },
  ];

  return (
    <PortalPageFrame>
      <PageHeader
        title={chapter?.name || "Leader Dashboard"}
        subtitle={
          chapter
            ? `${chapter.city ?? ""}${chapter.state ? `, ${chapter.state}` : ""}${chapter.meetingSchedule ? ` — ${chapter.meetingSchedule}` : ""}`
            : "Launchpad Job Club"
        }
      />

      {loading && (
        <div
          className="portal-card portal-card--padded-sm"
          style={{
            marginTop: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            color: "var(--color-on-surface-variant)",
            fontSize: "0.875rem",
          }}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: "1.1rem", animation: "spin 1s linear infinite" }}
          >
            progress_activity
          </span>
          Loading your chapter…
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="portal-card portal-card--padded-sm"
          style={{
            marginTop: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            color: statusColor("danger").fg,
            background: statusColor("danger").bg,
            borderColor: statusColor("danger").border,
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: "1.2rem" }}>
            error
          </span>
          <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{error}</span>
        </div>
      )}

      {stats && (
        <div
          className="wa-grid wa-grid-cols-2 md:wa-grid-cols-5 wa-gap-3"
          style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}
        >
          {[
            { label: "Total members", value: stats.total },
            { label: "Active", value: stats.active },
            { label: "Assessed", value: stats.assessed },
            { label: "Interview ready", value: stats.interviewReady },
            { label: "Placed", value: stats.placed },
          ].map((s) => (
            <div key={s.label} className="portal-card portal-card--padded-sm" style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--color-on-surface)",
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--color-on-surface-variant)",
                  marginTop: "0.25rem",
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {chapter && (
        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-2 wa-gap-4">
          <section className="portal-card portal-card--flat">
            <div className="portal-card__header">
              <div className="portal-card__headings">
                <h2 className="portal-card__title">Members</h2>
              </div>
            </div>
            <div className="portal-card__body" style={{ padding: 0 }}>
              {chapter.members.length === 0 ? (
                <EmptyPanel icon="group" text="No members have joined this chapter yet." />
              ) : (
                <DataTable columns={memberColumns} rows={chapter.members} rowKey={(m) => m.user.id} />
              )}
            </div>
          </section>

          <section className="portal-card portal-card--flat">
            <div className="portal-card__header">
              <div className="portal-card__headings">
                <h2 className="portal-card__title">Meetings</h2>
              </div>
            </div>
            <div className="portal-card__body">
              {chapter.meetings.length === 0 ? (
                <EmptyPanel icon="event" text="No meetings scheduled yet." />
              ) : (
                <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem", listStyle: "none", margin: 0, padding: 0 }}>
                  {chapter.meetings.map((mtg) => (
                    <li
                      key={mtg.id}
                      style={{
                        border: "1px solid var(--outline-variant)",
                        borderRadius: "var(--radius-md)",
                        padding: "0.6rem 0.75rem",
                        fontSize: "0.85rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                        <span style={{ fontWeight: 700 }}>{new Date(mtg.scheduledAt).toLocaleDateString()}</span>
                        {mtg.attendanceCount !== null && (
                          <span
                            style={{
                              fontSize: "0.8125rem",
                              color: "var(--color-on-surface-variant)",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {mtg.attendanceCount} attended
                          </span>
                        )}
                      </div>
                      <div style={{ color: "var(--color-on-surface-variant)", marginTop: "0.15rem" }}>
                        {mtg.topic || "General meeting"}
                      </div>
                      <div style={{ color: "var(--color-on-surface-variant)" }}>
                        {mtg.location || chapter.meetingLocation || "Location TBD"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="portal-card portal-card--flat lg:wa-col-span-2">
            <div className="portal-card__header">
              <div className="portal-card__headings">
                <h2 className="portal-card__title">Curriculum</h2>
              </div>
            </div>
            <div className="portal-card__body">
              {chapter.curriculumItems.length === 0 ? (
                <EmptyPanel icon="menu_book" text="No curriculum items assigned yet." />
              ) : (
                <ol style={{ display: "flex", flexDirection: "column", gap: "0.5rem", listStyle: "none", margin: 0, padding: 0 }}>
                  {chapter.curriculumItems.map((item) => (
                    <li
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        border: "1px solid var(--outline-variant)",
                        borderRadius: "var(--radius-md)",
                        padding: "0.6rem 0.75rem",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: "1.5rem",
                          height: "1.5rem",
                          borderRadius: "var(--radius-full)",
                          background: statusColor("info").bg,
                          color: statusColor("info").fg,
                          fontSize: "0.8125rem",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                          flexShrink: 0,
                        }}
                      >
                        {item.orderIndex + 1}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{item.course.name}</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--color-on-surface-variant)" }}>
                          {programDisplayTitle(item.course.programSlug)}
                        </div>
                      </div>
                      {item.notes && (
                        <div style={{ fontSize: "0.8125rem", color: "var(--color-on-surface-variant)", marginLeft: "auto" }}>
                          {item.notes}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>
      )}
    </PortalPageFrame>
  );
}
