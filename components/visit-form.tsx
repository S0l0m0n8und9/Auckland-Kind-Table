"use client";

import { useState } from "react";
import type { Visit } from "@/lib/domain";

type Props = { venueId: string; visit?: Visit; onSave: (visit: Omit<Visit, "id"> | Visit) => Promise<void>; onCancel: () => void };
const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export default function VisitForm({ venueId, visit, onSave, onCancel }: Props) {
  const [date, setDate] = useState(visit?.visitedAt ?? today());
  const [who, setWho] = useState(visit?.who.join(", ") ?? "");
  const [dishes, setDishes] = useState(visit?.dishes.join(", ") ?? "");
  const [modifications, setModifications] = useState(visit?.modifications ?? "");
  const [rating, setRating] = useState(visit?.rating?.toString() ?? "");
  const [notes, setNotes] = useState(visit?.notes ?? "");
  const [wouldReturn, setWouldReturn] = useState(visit?.wouldReturn === undefined ? "" : visit.wouldReturn ? "yes" : "no");
  const [highChair, setHighChair] = useState(visit?.highChair ?? "unknown");
  const [price, setPrice] = useState(visit?.price ?? "");
  const [photoKey, setPhotoKey] = useState(visit?.photoKey ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch("/api/photos", { method: "POST", body });
      const value = await response.json() as { photoKey?: string; error?: string };
      if (!response.ok || !value.photoKey) throw new Error(value.error ?? "Photo upload failed");
      setPhotoKey(value.photoKey);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Photo upload failed"); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const payload: Omit<Visit, "id"> | Visit = {
      ...(visit?.id ? { id: visit.id } : {}), venueId, visitedAt: date,
      who: who.split(",").map((item) => item.trim()).filter(Boolean),
      dishes: dishes.split(",").map((item) => item.trim()).filter(Boolean),
      modifications: modifications.trim(), ...(rating ? { rating: Number(rating) } : {}), notes: notes.trim(),
      ...(wouldReturn ? { wouldReturn: wouldReturn === "yes" } : {}), highChair, price: price.trim(), ...(photoKey ? { photoKey } : {}),
    };
    try { await onSave(payload); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this visit"); }
    finally { setBusy(false); }
  }

  return <form className="visit-form" onSubmit={submit}>
    <div className="form-grid"><label>Visit date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Who came?<input maxLength={400} placeholder="e.g. Sam, the kids" value={who} onChange={(event) => setWho(event.target.value)} /></label></div>
    <label>What did you order?<input maxLength={1200} placeholder="Separate dishes with commas" value={dishes} onChange={(event) => setDishes(event.target.value)} /></label>
    <label>Modifications<textarea rows={2} maxLength={1000} value={modifications} onChange={(event) => setModifications(event.target.value)} placeholder="Any swaps or adjustments?" /></label>
    <div className="form-grid"><label>Rating<select value={rating} onChange={(event) => setRating(event.target.value)}><option value="">No rating</option>{[5,4,3,2,1].map((number) => <option key={number} value={number}>{"★".repeat(number)} ({number})</option>)}</select></label>
      <label>Would you return?<select value={wouldReturn} onChange={(event) => setWouldReturn(event.target.value)}><option value="">Not sure</option><option value="yes">Yes</option><option value="no">No</option></select></label></div>
    <div className="form-grid"><label>High chairs on your visit?<select value={highChair} onChange={(event) => setHighChair(event.target.value as "available" | "unavailable" | "unknown")}><option value="unknown">Not sure / not checked</option><option value="available">Saw one available</option><option value="unavailable">None available</option></select><small>Your diary report stays visit-reported and won’t become a venue confirmation.</small></label>
      <label>Price note<input maxLength={80} placeholder="e.g. $18 each" value={price} onChange={(event) => setPrice(event.target.value)} /></label></div>
    <label>Notes<textarea rows={3} maxLength={3000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="A note for your family diary" /></label>
    <label className="photo-field">Add a photo <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload(event.target.files?.[0])} /><small>JPEG, PNG or WebP, up to 8 MB. Uploads are private to this diary.</small></label>
    {photoKey && <div className="photo-attached"><p className="inline-success">Photo attached to this visit.</p><button type="button" onClick={() => setPhotoKey("")}>Remove photo</button></div>}{error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button className="button button-quiet" type="button" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={busy} type="submit">{busy ? "Saving…" : visit ? "Save changes" : "Save visit"}</button></div>
  </form>;
}
