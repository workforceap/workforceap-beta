"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { requestFailureMessage } from "@/lib/http/requestFailureCopy";
import PortalPageFrame from "@/components/portal/PortalPageFrame";
import PageHeader from "@/components/portal/PageHeader";
import DataTable, { type DataTableColumn } from "@/components/portal/ui/DataTable";
import { statusColor } from "@/lib/ui/statusColors";

interface Chapter {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  status: string;
  leader: { id: string; fullName: string; email: string } | null;
  _count: { members: number };
  createdAt: string;
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
        padding: "2rem 1rem",
        textAlign: "center",
        color: "var(--color-on-surface-variant)",
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: "1.75rem", opacity: 0.6 }}>
        {icon}
      </span>
      <p style={{ margin: 0, fontSize: "0.85rem" }}>{text}</p>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  padding: "0.625rem 0.75rem",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--outline-variant)",
  background: "var(--surface-container-lowest)",
  color: "var(--color-on-surface)",
  fontSize: "0.875rem",
  width: "100%",
};

export default function AdminChaptersPage() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    city: "",
    state: "",
    leaderId: "",
    meetingSchedule: "",
    meetingLocation: "",
  });
  const router = useRouter();
  const tCommon = useTranslations("common");

  useEffect(() => {
    fetch("/api/admin/chapters")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setChapters(data);
      })
      .catch((e: unknown) => setError(requestFailureMessage(e, { connection: tCommon("connectionError"), fallback: "Could not load chapters." }, "admin-chapters")))
      .finally(() => setLoading(false));
  }, [tCommon]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...formData, leaderId: formData.leaderId || undefined };
    const res = await fetch("/api/admin/chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      return;
    }
    setChapters((prev) => [data, ...prev]);
    setShowForm(false);
    setFormData({ name: "", slug: "", city: "", state: "", leaderId: "", meetingSchedule: "", meetingLocation: "" });
    router.refresh();
  };

  const columns: DataTableColumn<Chapter>[] = [
    {
      key: "name",
      header: "Name",
      cell: (ch) => <span style={{ fontWeight: 600, color: "var(--color-on-surface)" }}>{ch.name}</span>,
    },
    { key: "location", header: "Location", cell: (ch) => `${ch.city || ""}${ch.state ? `, ${ch.state}` : ""}` || "—" },
    { key: "leader", header: "Leader", cell: (ch) => ch.leader?.fullName || "—" },
    {
      key: "members",
      header: "Members",
      align: "right",
      cell: (ch) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{ch._count.members}</span>,
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (ch) => {
        const tone = ch.status === "active" ? "success" : "neutral";
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
              textTransform: "capitalize",
            }}
          >
            {ch.status}
          </span>
        );
      },
    },
  ];

  return (
    <PortalPageFrame>
      <PageHeader
        title="Chapters"
        subtitle="Manage Launchpad Job Club chapters"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {!showForm && (
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: "1.1rem" }}>
                add
              </span>
            )}
            {showForm ? "Cancel" : "New chapter"}
          </button>
        }
      />

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="portal-card portal-card--padded"
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}
        >
          <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 wa-gap-3">
            <div>
              <label htmlFor="chapter-name" className="sr-only">Chapter name</label>
              <input
                id="chapter-name"
                placeholder="Chapter name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={fieldStyle}
                required
              />
            </div>
            <div>
              <label htmlFor="chapter-slug" className="sr-only">Slug</label>
              <input
                id="chapter-slug"
                placeholder="Slug (austin-launchpad)"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                style={fieldStyle}
                required
              />
            </div>
            <div>
              <label htmlFor="chapter-city" className="sr-only">City</label>
              <input
                id="chapter-city"
                placeholder="City"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label htmlFor="chapter-state" className="sr-only">State</label>
              <input
                id="chapter-state"
                placeholder="State"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label htmlFor="chapter-leader" className="sr-only">Leader user ID</label>
              <input
                id="chapter-leader"
                placeholder="Leader User ID"
                value={formData.leaderId}
                onChange={(e) => setFormData({ ...formData, leaderId: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <label htmlFor="chapter-schedule" className="sr-only">Meeting schedule</label>
              <input
                id="chapter-schedule"
                placeholder="Meeting schedule (Fridays 10am)"
                value={formData.meetingSchedule}
                onChange={(e) => setFormData({ ...formData, meetingSchedule: e.target.value })}
                style={fieldStyle}
              />
            </div>
          </div>
          <div>
            <label htmlFor="chapter-location" className="sr-only">Meeting location</label>
            <input
              id="chapter-location"
              placeholder="Meeting location (ACC Highland, Room 301)"
              value={formData.meetingLocation}
              onChange={(e) => setFormData({ ...formData, meetingLocation: e.target.value })}
              style={fieldStyle}
            />
          </div>
          <div>
            <button type="submit" className="btn btn-primary">
              Create chapter
            </button>
          </div>
        </form>
      )}

      {loading && (
        <div
          className="portal-card portal-card--padded-sm"
          style={{
            marginBottom: "1rem",
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
          Loading chapters…
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="portal-card portal-card--padded-sm"
          style={{
            marginBottom: "1rem",
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

      {!loading && (
        <div className="portal-card portal-card--flat" style={{ overflow: "hidden" }}>
          <DataTable
            columns={columns}
            rows={chapters}
            rowKey={(ch) => ch.id}
            emptyState={
              <EmptyPanel icon="apartment" text="No chapters yet. Create one to get your first Launchpad Job Club chapter started." />
            }
          />
        </div>
      )}
    </PortalPageFrame>
  );
}
