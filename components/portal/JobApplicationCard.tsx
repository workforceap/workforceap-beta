"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import type { JobApplication } from "@/types/job-application";
import type { JobApplicationStatus } from "@/lib/jobApplications/constants";
import { isAppLocale } from "@/lib/i18n/config";
import { formatLocalizedDate } from "@/lib/i18n/date";
import { JOB_APPLICATION_STATUS_ACCENT } from "@/lib/jobApplications/statusAccents";

interface JobApplicationCardProps {
  application: JobApplication;
  onStatusChange: (id: string, updates: Partial<JobApplication>) => void;
  availableStatuses: JobApplicationStatus[];
}

const STATUS_LABELS: Record<JobApplicationStatus, string> = {
  APPLIED: "Applied",
  PHONE_SCREEN: "Phone Screen",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  ACCEPTED: "Accepted",
  SAVED: "Saved",
  REJECTED: "Rejected",
};

export default function JobApplicationCard({
  application,
  onStatusChange,
  availableStatuses,
}: JobApplicationCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<JobApplicationStatus>(
    application.status,
  );
  const [notes, setNotes] = useState(application.notes || "");
  const rawLocale = useLocale();
  const locale = isAppLocale(rawLocale) ? rawLocale : undefined;

  const handleStatusChange = async () => {
    if (selectedStatus !== application.status) {
      onStatusChange(application.id, { status: selectedStatus });
    }
    if (notes !== application.notes) {
      onStatusChange(application.id, { notes });
    }
    setIsEditing(false);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "";
    return formatLocalizedDate(date, locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isEditing) {
    return (
      <div
        className="portal-card portal-card--flat job-app-card job-app-card--editing"
        style={{ padding: "1rem" }}
      >
        <div className="wa-mb-4">
          <label
            htmlFor={`status-${application.id}`}
            className="wa-block wa-text-xs wa-font-bold wa-uppercase wa-mb-2"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Status
          </label>
          <select
            id={`status-${application.id}`}
            value={selectedStatus}
            onChange={(e) =>
              setSelectedStatus(e.target.value as JobApplicationStatus)
            }
            className="wa-w-full wa-px-3 wa-py-2 wa-rounded wa-text-sm"
            style={{
              border: "1px solid rgba(222,191,194,0.35)",
              background: "var(--surface-container-lowest)",
              color: "var(--color-on-surface)",
            }}
          >
            {availableStatuses.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="wa-mb-4">
          <label
            htmlFor={`notes-${application.id}`}
            className="wa-block wa-text-xs wa-font-bold wa-uppercase wa-mb-2"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Notes
          </label>
          <textarea
            id={`notes-${application.id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="wa-w-full wa-px-3 wa-py-2 wa-rounded wa-text-sm"
            style={{
              border: "1px solid rgba(222,191,194,0.35)",
              background: "var(--surface-container-lowest)",
              color: "var(--color-on-surface)",
            }}
            rows={3}
            placeholder="Add notes about this application..."
          />
        </div>

        <div className="wa-flex wa-gap-2">
          <button
            onClick={handleStatusChange}
            type="button"
            className="wa-flex-1 wa-px-3 wa-py-2 wa-text-white wa-text-sm wa-font-medium wa-rounded focus-visible:wa-outline-none focus-visible:wa-ring-2 focus-visible:wa-ring-[var(--wa-accent-dark)] focus-visible:wa-ring-offset-1"
            style={{ background: "var(--wa-accent-dark)" }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="wa-flex-1 wa-px-3 wa-py-2 wa-text-sm wa-font-medium wa-rounded focus-visible:wa-outline-none focus-visible:wa-ring-2 focus-visible:wa-ring-[var(--wa-accent-dark)] focus-visible:wa-ring-offset-1"
            style={{
              background: "var(--surface-container-high)",
              color: "var(--color-on-surface)",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsEditing(true);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Edit job application for ${application.role} at ${application.company}`}
      className="portal-kanban-card job-app-card wa-cursor-pointer focus-visible:wa-outline-none focus-visible:wa-ring-2 focus-visible:wa-ring-[var(--wa-accent-dark)] focus-visible:wa-ring-offset-1"
      style={
        {
          padding: "0.75rem",
          "--portal-kanban-accent": JOB_APPLICATION_STATUS_ACCENT[application.status],
        } as CSSProperties
      }
    >
      <div className="wa-flex wa-items-start wa-justify-between wa-gap-2 wa-mb-1">
        <h4
          className="wa-font-bold wa-text-sm"
          style={{ color: "var(--color-on-surface)" }}
        >
          {application.role}
        </h4>
        {application.curatedJobId && (
          <span
            className="wa-shrink-0 wa-text-[13px] wa-font-bold wa-uppercase wa-tracking-wide wa-px-2 wa-py-0.5 wa-rounded"
            style={{
              background: 'color-mix(in srgb, var(--color-amber) 16%, transparent)',
              color: 'var(--color-amber)',
            }}
            title="From WorkforceAP Job Board"
          >
            Board
          </span>
        )}
      </div>
      <p
        className="wa-text-xs wa-mb-2"
        style={{ color: "var(--color-on-surface-variant)" }}
      >
        {application.company}
      </p>

      {application.curatedJobId && application.url && (
        <p className="wa-text-xs wa-mb-2">
          <Link
            href={application.url}
            className="wa-font-medium hover:wa-underline"
            style={{ color: "var(--color-accent)" }}
            onClick={(e) => e.stopPropagation()}
          >
            View job posting →
          </Link>
        </p>
      )}

      {application.appliedAt && (
        <p
          className="wa-text-xs wa-mb-1"
          style={{ color: "var(--color-on-surface-variant)", opacity: 0.9 }}
        >
          Applied {formatDate(application.appliedAt)} · {application.source}
        </p>
      )}

      {application.nextInterviewDate && (
        <p
          className="wa-text-xs wa-font-medium wa-mb-2"
          style={{ color: "var(--color-accent)" }}
        >
          Interview: {formatDate(application.nextInterviewDate)}
        </p>
      )}

      {application.notes && (
        <p
          className="wa-text-xs wa-border-t wa-pt-2 wa-mt-2"
          style={{
            color: "var(--color-on-surface-variant)",
            borderColor: "rgba(222,191,194,0.25)",
          }}
        >
          {application.notes}
        </p>
      )}

      <p
        className="wa-text-xs wa-mt-2 wa-pt-2 wa-border-t wa-flex wa-items-center"
        style={{
          color: "var(--color-on-surface-variant)",
          opacity: 0.7,
          borderColor: "rgba(222,191,194,0.25)",
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "14px", marginRight: "4px" }}
          aria-hidden="true"
        >
          edit
        </span>
        Click to edit
      </p>
    </div>
  );
}
