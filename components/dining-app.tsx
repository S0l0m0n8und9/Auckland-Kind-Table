"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowDownToLine, ArrowUpRight, Baby, BookOpen, Check, ChevronDown, CircleHelp, Clock3, Heart, Leaf, MapPin, MapPinned, Search, Sparkles, Star, Utensils, X } from "lucide-react";
import type { Catalogue, Evidence, Preference, Venue, Visit } from "@/lib/domain";
import { isVeganAndGlutenFree } from "@/lib/domain";
import { DEFAULT_FILTERS, evidenceNeedsReview, filterVenues, isStale, venueHasStaleEvidence, type Filters } from "@/lib/catalogue-filters";
import { formatGuideDate } from "@/lib/format-date";
import VenueMap from "@/components/venue-map";
import VisitForm from "@/components/visit-form";
import { relatedVenues } from "@/lib/related-brands";

type Props = { displayName: string };
type ResponseError = { error?: string };
const dateLabel = formatGuideDate;
const shortName = (name: string) => name.trim().split(/\s+/)[0] || "there";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }), ...init?.headers } });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { const body = await response.json() as ResponseError; if (body.error) message = body.error; } catch { /* retain status */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function statusLabel(status: Evidence["status"]) {
  return ({ "menu-supported": "Menu supported", "venue-confirmed": "Venue confirmed", "visit-reported": "Visit reported", "needs-checking": "Needs a check" })[status];
}

export default function DiningApp({ displayName }: Props) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Venue | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "loading" | "ready" | "denied">("idle");
  const [editVisit, setEditVisit] = useState<Visit | null | undefined>(undefined);
  const [notice, setNotice] = useState("");
  const closeButton = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    try { const data = await api<Catalogue>("/api/catalogue", { cache: "no-store" }); setCatalogue(data); setLoadError(""); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "Could not load the guide"); }
  }, []);
  useEffect(() => {
    let active = true;
    api<Catalogue>("/api/catalogue", { cache: "no-store" }).then((data) => { if (active) { setCatalogue(data); setLoadError(""); } }).catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : "Could not load the guide"); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelected(null); setEditVisit(undefined); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [selected]);

  const visible = useMemo(() => catalogue ? filterVenues(catalogue, filters, location) : [], [catalogue, filters, location]);
  const suburbs = useMemo(() => [...new Set(catalogue?.venues.map((venue) => venue.suburb) ?? [])].sort((a, b) => a.localeCompare(b)), [catalogue]);
  const selectedVisits = catalogue?.visits.filter((visit) => visit.venueId === selected?.id).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)) ?? [];
  const updates = useMemo(() => {
    if (!catalogue) return { evidenceRows: [], chairRows: [], reviewChanges: [] };
    const evidenceRows = catalogue.venues.flatMap((venue) => venue.dishes.flatMap((dish) => dish.evidence.map((evidence) => ({ venue, dish, evidence }))).filter(({ evidence }) => evidenceNeedsReview(evidence)));
    const chairRows = catalogue.venues.filter((venue) => venue.highChairEvidence && evidenceNeedsReview(venue.highChairEvidence)).map((venue) => ({ venue, evidence: venue.highChairEvidence! }));
    const reviewChanges = catalogue.changes.filter((change) => change.reviewRequired).slice(0, 8);
    return { evidenceRows, chairRows, reviewChanges };
  }, [catalogue]);

  async function preference(venue: Venue, status: Preference) {
    if (!catalogue) return;
    const old = catalogue.preferences[venue.id] ?? "none";
    setCatalogue({ ...catalogue, preferences: { ...catalogue.preferences, [venue.id]: status } });
    try { await api(`/api/preferences/${encodeURIComponent(venue.id)}`, { method: "PUT", body: JSON.stringify({ status }) }); }
    catch (error) { setCatalogue({ ...catalogue, preferences: { ...catalogue.preferences, [venue.id]: old } }); setNotice(error instanceof Error ? error.message : "Could not save preference"); }
  }

  async function saveVisit(value: Omit<Visit, "id"> | Visit) {
    const saved = "id" in value ? await api<Visit>(`/api/visits/${encodeURIComponent(value.id!)}`, { method: "PUT", body: JSON.stringify(value) }) : await api<Visit>("/api/visits", { method: "POST", body: JSON.stringify(value) });
    setCatalogue((current) => current ? { ...current, visits: [saved, ...current.visits.filter((visit) => visit.id !== saved.id)] } : current);
    setEditVisit(undefined); setNotice("Visit saved to your family diary.");
  }

  async function deleteVisit(visit: Visit) {
    if (!visit.id || !window.confirm("Delete this diary visit? This cannot be undone.")) return;
    try { await api(`/api/visits/${encodeURIComponent(visit.id)}`, { method: "DELETE" }); setCatalogue((current) => current ? { ...current, visits: current.visits.filter((entry) => entry.id !== visit.id) } : current); setNotice("Visit deleted."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not delete visit"); }
  }

  function locate() {
    if (!navigator.geolocation) { setGeoState("denied"); return; }
    setGeoState("loading"); navigator.geolocation.getCurrentPosition((position) => { setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setGeoState("ready"); setFilters((current) => ({ ...current, distanceKm: current.distanceKm ?? 10 })); }, () => setGeoState("denied"), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  return <main className="kind-app">
    <header className="site-header"><a className="brand" href="#top" aria-label="Kind Table home"><span className="brand-mark"><Leaf size={19} /></span><span>kind table<small>AUCKLAND, NZ</small></span></a><div className="header-actions"><span className="welcome">A little more ease, {shortName(displayName)}.</span><a className="button button-quiet export-button" href="/api/export"><ArrowDownToLine size={16} /> Export diary</a></div></header>
    <section className="intro" id="top"><div className="intro-copy"><div className="eyebrow"><span className="eyebrow-line" /> A FAMILY DINING GUIDE</div><h1>Good meals, made<br className="desktop-break" /> a little easier.</h1><p>Auckland spots for plant-forward plates, little diners and the people around the table. Every lead comes with its source and last checked date.</p><div className="intro-meta"><span><MapPin size={14} /> Auckland region</span><span><BookOpen size={14} /> Private family diary</span></div></div><div className="intro-note"><div className="note-spark"><Sparkles size={17} /></div><div><strong>Useful, never assumed.</strong><p>Dietary details are tied to individual dishes. Unchecked leads are clearly labelled.</p></div></div></section>

    <section className="guide-shell" aria-label="Dining guide">
      <div className="guide-topline"><div><div className="eyebrow">FIND YOUR TABLE</div><h2>Neighbourhood guide <span className="count-pill">{catalogue?.venues.length ?? "—"}</span></h2></div><div className="guide-tools"><button className={`text-button ${geoState === "ready" ? "active" : ""}`} onClick={locate}><MapPinned size={16} />{geoState === "loading" ? "Finding you…" : geoState === "ready" ? "Location on" : "Near me"}</button><a className="updates-link" href="#updates">Updates <span>{updates ? updates.evidenceRows.length + updates.chairRows.length + updates.reviewChanges.length : "·"}</span></a></div></div>
      {geoState === "denied" && <p className="subtle-alert" role="status">Location wasn’t available. You can still browse by suburb.</p>}
      <div className="search-row"><label className="searchbox"><Search size={18} /><input aria-label="Search venues, dishes or suburbs" placeholder="Search places, dishes, suburbs…" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} />{filters.query && <button aria-label="Clear search" onClick={() => setFilters({ ...filters, query: "" })}><X size={16} /></button>}</label><span className="result-count">{visible.length} {visible.length === 1 ? "place" : "places"}</span></div>
      <div className="filter-row">
        <label className="filter-select"><Leaf size={14} /><select aria-label="Dietary options" value={filters.diet} onChange={(event) => setFilters({ ...filters, diet: event.target.value as Filters["diet"] })}><option value="all">Dietary: any</option><option value="vegan">Vegan dish</option><option value="vegan-gf">Vegan + GF same dish</option></select><ChevronDown size={13} /></label>
        <label className="filter-select"><Utensils size={14} /><select aria-label="Venue type" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="all">All types</option>{["cafe","pub","gastropub","restaurant"].map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select><ChevronDown size={13} /></label>
        <label className="filter-select"><MapPin size={14} /><select aria-label="Suburb" value={filters.suburb} onChange={(event) => setFilters({ ...filters, suburb: event.target.value })}><option value="all">All suburbs</option>{suburbs.map((suburb) => <option key={suburb}>{suburb}</option>)}</select><ChevronDown size={13} /></label>
        <label className="filter-select"><Baby size={14} /><select aria-label="High chair availability" value={filters.highChair} onChange={(event) => setFilters({ ...filters, highChair: event.target.value as Filters["highChair"] })}><option value="all">High chairs: any</option><option value="available">Available</option><option value="known">Known either way</option></select><ChevronDown size={13} /></label>
        <label className="filter-select"><Clock3 size={14} /><select aria-label="Source freshness" value={filters.freshness} onChange={(event) => setFilters({ ...filters, freshness: event.target.value as Filters["freshness"] })}><option value="all">Freshness: any</option><option value="fresh">Checked within 90 days</option><option value="stale">Stale / needs check</option></select><ChevronDown size={13} /></label>
        <label className="filter-select"><Heart size={14} /><select aria-label="Family shortlist" value={filters.preference} onChange={(event) => setFilters({ ...filters, preference: event.target.value as Filters["preference"] })}><option value="all">Your shortlist: all</option><option value="favourite">Favourites</option><option value="want-to-try">Want to try</option><option value="visited">Visited</option></select><ChevronDown size={13} /></label>
        {location && <label className="filter-select distance-select"><MapPinned size={14} /><select aria-label="Maximum distance" value={filters.distanceKm ?? ""} onChange={(event) => setFilters({ ...filters, distanceKm: event.target.value ? Number(event.target.value) : null })}><option value="">Any distance</option>{[5,10,20,40].map((km) => <option key={km} value={km}>Within {km} km</option>)}</select><ChevronDown size={13} /></label>}
        <label className="filter-select distance-select"><CircleHelp size={14} /><select aria-label="Meal or snack" value={filters.mealSnack} onChange={(event) => setFilters({ ...filters, mealSnack: event.target.value as Filters["mealSnack"] })}><option value="all">Meals &amp; snacks</option><option value="meal">Meal notes available</option><option value="snack">Snack dishes listed</option></select><ChevronDown size={13} /></label>
      </div>

      <div className="results-layout"><section className="venue-list" aria-label="Matching venues" aria-live="polite">
        {loadError ? <div className="empty-state"><div className="empty-icon"><CircleHelp /></div><h3>We couldn’t load the guide.</h3><p>{loadError}</p><button className="button button-primary" onClick={() => void refresh()}>Try again</button></div> : !catalogue ? <div className="empty-state"><span className="loading-dot" /><h3>Opening the guide…</h3><p>Loading your private Auckland list.</p></div> : visible.length === 0 ? <div className="empty-state"><div className="empty-icon"><Search /></div><h3>{catalogue.venues.length ? "No places match just yet." : "Your guide is getting ready."}</h3><p>{catalogue.venues.length ? "Try a broader search or clear a filter." : "There aren’t researched places in the guide yet. No venues or menu claims are being invented."}</p>{catalogue.venues.length > 0 && <button className="button button-quiet" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>}</div> : visible.map((venue, index) => {
          const preferenceStatus = catalogue.preferences[venue.id] ?? "none";
          const supportedVegan = venue.dishes.some((dish) => dish.vegan && dish.evidence.some((item) => item.status !== "needs-checking"));
          const supportedVg = venue.dishes.some(isVeganAndGlutenFree);
          const stale = venueHasStaleEvidence(venue);
          const visitCount = catalogue.visits.filter((visit) => visit.venueId === venue.id).length;
          const relatedCount = venue.brand ? catalogue.venues.filter((candidate) => candidate.brand?.id === venue.brand?.id).length : 0;
          return <article className={`venue-card ${selected?.id === venue.id ? "venue-card-selected" : ""}`} key={venue.id}>
            <div className="card-index">{String(index + 1).padStart(2, "0")}</div><div className="card-main"><div className="card-meta"><span>{venue.type}</span><i />{venue.suburb}{visitCount > 0 && <><i /><span className="visited-mark"><Check size={12} /> Visited</span></>}</div><h3>{venue.name}</h3><p className="venue-address">{venue.address}</p>
              <div className="tag-row">{supportedVegan && <span className="tag tag-green"><Leaf size={12} /> Vegan option</span>}{supportedVg && <span className="tag tag-orange">Vegan + GF</span>}<span className={`tag ${venue.highChair === "available" ? "tag-chair" : "tag-muted"}`}><Baby size={13} />{venue.highChair === "available" ? "High chair" : venue.highChair === "unavailable" ? "No high chair" : "Chair unknown"}</span>{stale && <span className="tag tag-stale"><Clock3 size={12} /> Check again</span>}</div>
              {relatedCount > 1 && <span className="brand-count">{relatedCount} {venue.brand?.name} locations</span>}
              <div className="card-foot"><span className="freshness-note">Checked {dateLabel(venue.lastCheckedAt)}{stale && <span className="stale-dot"> · may be out of date</span>}</span><button className="detail-link" type="button" aria-label={`Open details for ${venue.name}`} onClick={() => setSelected(venue)}>Explore <ArrowUpRight size={14} /></button></div>
              {venue.highChairEvidence && <span className={`chair-source-note ${evidenceNeedsReview(venue.highChairEvidence) ? "needs-review" : ""}`}>High-chair source · {statusLabel(venue.highChairEvidence.status)} · {dateLabel(venue.highChairEvidence.checkedAt)}{evidenceNeedsReview(venue.highChairEvidence) ? " · check again" : ""}</span>}
            </div><button className={`save-button ${preferenceStatus === "favourite" ? "saved" : ""}`} aria-label={preferenceStatus === "favourite" ? `Remove ${venue.name} from favourites` : `Favourite ${venue.name}`} title="Favourite" onClick={() => void preference(venue, preferenceStatus === "favourite" ? "none" : "favourite")}><Heart size={18} fill={preferenceStatus === "favourite" ? "currentColor" : "none"} /></button>
          </article>;
        })}
      </section><aside className="map-column"><div className="map-heading"><div><span className="eyebrow">ON THE MAP</span><p>Find a spot near your next stop.</p></div><span className="map-zoom-note">Zoom &amp; explore</span></div><VenueMap venues={visible} selectedId={selected?.id ?? null} onSelect={(id) => { const venue = visible.find((entry) => entry.id === id); if (venue) setSelected(venue); }} /><p className="map-footnote">Map tiles © OpenStreetMap contributors · <a href="https://operations.osmfoundation.org/policies/tiles/" target="_blank" rel="noreferrer">Tile usage policy</a></p></aside></div>
    </section>

    <section className="updates-section" id="updates"><div className="section-heading"><div><div className="eyebrow">KEEPING IT CURRENT</div><h2>Updates &amp; checks</h2></div><p>Evidence can change. These leads need another look before you rely on them.</p></div>
      {!catalogue ? <p className="updates-empty">Loading recent checks…</p> : !updates.evidenceRows.length && !updates.chairRows.length && !updates.reviewChanges.length ? <div className="updates-empty"><Check size={17} /> All current evidence is within its check window. New research updates will appear here.</div> : <div className="updates-grid">
        {updates.evidenceRows.slice(0, 6).map(({ venue, dish, evidence }) => <article className="update-card" key={`${venue.id}-${dish.id}-${evidence.url}`}><span className="update-label">{evidence.status === "needs-checking" ? "Needs review" : "Check again"}</span><h3>{venue.name}</h3><p>{dish.name} · {venue.suburb}</p><div className="update-source"><span>Source checked {dateLabel(evidence.checkedAt)}</span><a href={evidence.url} target="_blank" rel="noreferrer">View source <ArrowUpRight size={12} /></a></div></article>)}
        {updates.chairRows.slice(0, 6).map(({ venue, evidence }) => <article className="update-card" key={`${venue.id}-high-chair-${evidence.url}`}><span className="update-label">High-chair evidence · {evidence.status === "needs-checking" ? "needs review" : "check again"}</span><h3>{venue.name}</h3><p>High chairs · {venue.suburb}</p><div className="update-source"><span>Source checked {dateLabel(evidence.checkedAt)}</span><a href={evidence.url} target="_blank" rel="noreferrer">View source <ArrowUpRight size={12} /></a></div></article>)}
        {updates.reviewChanges.slice(0, 4).map((change) => <article className="update-card" key={change.id}><span className="update-label">Catalogue change · review</span><h3>{change.after?.name ?? change.before?.name ?? "Venue update"}</h3><p>{change.kind.replaceAll("_", " ")} · {dateLabel(change.changedAt)}</p><span className="update-source">Research update needs a human check</span></article>)}
      </div>}
      <div className="research-status"><span>Latest research run</span><strong>{catalogue?.runs[0] ? `${catalogue.runs[0].status} · ${dateLabel(catalogue.runs[0].completedAt)}` : "No research runs recorded yet"}</strong><span>{catalogue?.runs[0] ? `${catalogue.runs[0].summary.accepted} accepted · ${catalogue.runs[0].summary.failures} failed · ${catalogue.runs[0].summary.ambiguous} ambiguous` : "Research notes will be shown when available."}</span></div>
    </section>
    <footer className="site-footer"><a className="brand footer-brand" href="#top"><span className="brand-mark"><Leaf size={17} /></span><span>kind table<small>GOOD FOOD, KINDLY FOUND</small></span></a><p>Sources are shown per dish. Always confirm directly with the venue if your needs are strict or have changed.</p><span>Made for your table · Tāmaki Makaurau</span></footer>
    {notice && <div className="toast-note" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice("")}><X size={14} /></button></div>}
    {selected && <div className="detail-backdrop" role="presentation" onClick={() => { setSelected(null); setEditVisit(undefined); }}><section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={(event) => event.stopPropagation()}><button ref={closeButton} className="close-detail" aria-label="Close details" onClick={() => { setSelected(null); setEditVisit(undefined); }}><X size={20} /></button>
      <div className="detail-kicker">{selected.type.toUpperCase()} <i /> {selected.suburb.toUpperCase()}</div><h2 id="detail-title">{selected.name}</h2><p className="detail-address">{selected.address}</p><div className="detail-actions"><button className={`button ${catalogue?.preferences[selected.id] === "favourite" ? "button-green" : "button-quiet"}`} onClick={() => void preference(selected, catalogue?.preferences[selected.id] === "favourite" ? "none" : "favourite")}><Heart size={15} fill={catalogue?.preferences[selected.id] === "favourite" ? "currentColor" : "none"} /> Favourite</button><button className={`button ${catalogue?.preferences[selected.id] === "want-to-try" ? "button-green" : "button-quiet"}`} onClick={() => void preference(selected, catalogue?.preferences[selected.id] === "want-to-try" ? "none" : "want-to-try")}><Star size={15} /> Want to try</button>{selected.officialUrl && <a className="button button-quiet" href={selected.officialUrl} target="_blank" rel="noreferrer">Venue website <ArrowUpRight size={14} /></a>}</div>
      <div className="detail-facts"><div><span>HIGH CHAIRS</span><strong>{selected.highChair === "available" ? "Reported available" : selected.highChair === "unavailable" ? "Reported unavailable" : "Not yet known"}</strong>{selected.highChairEvidence && <><small>{statusLabel(selected.highChairEvidence.status)} · checked {dateLabel(selected.highChairEvidence.checkedAt)} · <a className="fact-source" href={selected.highChairEvidence.url} target="_blank" rel="noreferrer">Source</a></small>{evidenceNeedsReview(selected.highChairEvidence) && <small className="text-warning">High-chair evidence needs {selected.highChairEvidence.status === "needs-checking" ? "review" : "another check"}.</small>}</>}</div><div><span>LAST CATALOGUE CHECK</span><strong>{dateLabel(selected.lastCheckedAt)}</strong>{isStale(selected.lastCheckedAt) && <small className="text-warning">May need another check</small>}</div></div>
      {selected.brand && <div className="detail-block related-block"><div className="block-title"><h3>Other locations</h3><span>{relatedVenues(selected, catalogue?.venues ?? []).length + 1} {selected.brand.name} branches</span></div><p className="muted-copy">Shared brand: {selected.brand.name}. These locations can differ from your current filters. Menu and family details apply to each branch individually.</p><div className="related-list">{relatedVenues(selected, catalogue?.venues ?? []).map((branch) => <button className="related-branch" type="button" key={branch.id} aria-label={`Open ${branch.name}, ${branch.suburb}, ${branch.address}`} onClick={() => { setEditVisit(undefined); setSelected(branch); }}><span><strong>{branch.name}</strong><small>{branch.suburb} · {branch.address}</small></span><ArrowUpRight size={15} /></button>)}</div>{relatedVenues(selected, catalogue?.venues ?? []).length === 0 && <p className="muted-copy">No other confirmed locations are in the guide yet.</p>}<button className="button button-quiet show-brand" type="button" onClick={() => { setFilters({ ...DEFAULT_FILTERS, query: selected.brand!.name }); setEditVisit(undefined); setSelected(null); }}>Show all locations</button></div>}
      <div className="detail-block"><div className="block-title"><h3>Plant-forward on the menu</h3><span>{selected.dishes.length} {selected.dishes.length === 1 ? "dish" : "dishes"}</span></div>{selected.dishes.length === 0 ? <p className="muted-copy">No dish details have been researched yet.</p> : <div className="dish-list">{selected.dishes.map((dish) => { const supported = dish.evidence.some((item) => item.status !== "needs-checking"); return <article className="dish-card" key={dish.id}><div className="dish-title"><h4>{dish.name}</h4>{dish.vegan && <span className="mini-tag">{supported ? "Vegan" : "Vegan lead · needs check"}</span>}{dish.glutenFree && <span className="mini-tag mini-tag-orange">{supported ? "GF" : "GF lead · needs check"}</span>}</div>{dish.price && <span className="dish-price">{dish.price}</span>}{dish.notes && <p>{dish.notes}</p>}{dish.evidence.length ? dish.evidence.map((source, index) => <div className="evidence-row" key={`${source.url}-${index}`}><span className={`evidence-pill ${source.status === "needs-checking" || isStale(source.checkedAt) ? "evidence-old" : ""}`}>{statusLabel(source.status)}{isStale(source.checkedAt) ? " · stale" : ""}</span><span>Checked {dateLabel(source.checkedAt)}</span><a href={source.url} target="_blank" rel="noreferrer">Source <ArrowUpRight size={12} /></a><p className="evidence-excerpt">“{source.excerpt}”</p></div>) : <div className="evidence-row"><span className="evidence-pill evidence-old">No supporting evidence yet</span></div>}</article>; })}</div>}</div>
      {selected.mealNotes && <div className="detail-block"><h3>Meal notes</h3><p>{selected.mealNotes}</p></div>}{selected.familyNotes && <div className="detail-block"><h3>For little diners</h3><p>{selected.familyNotes}</p></div>}
      <div className="detail-block diary-block"><div className="block-title"><h3>Family visit diary</h3><span>{selectedVisits.length} {selectedVisits.length === 1 ? "visit" : "visits"}</span></div><p className="muted-copy">Your visits stay here even when a menu changes.</p>{editVisit !== undefined ? <VisitForm key={editVisit?.id ?? "new"} venueId={selected.id} visit={editVisit ?? undefined} onSave={saveVisit} onCancel={() => setEditVisit(undefined)} /> : <button className="button button-primary add-visit" onClick={() => setEditVisit(null)}>+ Add a visit</button>}
        {selectedVisits.length === 0 && editVisit === undefined ? <p className="diary-empty">No visits yet. Add one after your next meal together.</p> : <div className="visit-list">{selectedVisits.map((visit) => <article className="visit-card" key={visit.id}><div className="visit-head"><div><strong>{dateLabel(visit.visitedAt)}</strong>{visit.rating && <span className="rating"><Star size={12} fill="currentColor" /> {visit.rating}/5</span>}</div><div className="visit-tools"><button onClick={() => setEditVisit(visit)}>Edit</button><button onClick={() => void deleteVisit(visit)}>Delete</button></div></div>{visit.who.length > 0 && <p>With {visit.who.join(", ")}</p>}{visit.dishes.length > 0 && <p><strong>Ordered:</strong> {visit.dishes.join(", ")}</p>}{visit.modifications && <p><strong>Changes:</strong> {visit.modifications}</p>}{visit.notes && <p>{visit.notes}</p>}{visit.price && <p className="visit-price">{visit.price}</p>}{visit.highChair && visit.highChair !== "unknown" && <p className="visit-highchair"><Baby size={13} /> High chair {visit.highChair} on this visit <span>· family report, not venue-confirmed</span></p>}{visit.wouldReturn !== undefined && <p>{visit.wouldReturn ? "Would return" : "Would not return"}</p>}{visit.photoKey && <Image className="visit-photo" src={`/api/photos/${encodeURIComponent(visit.photoKey)}`} width={800} height={600} unoptimized alt={`Family visit on ${dateLabel(visit.visitedAt)}`} loading="lazy" />}</article>)}</div>}
      </div>
    </section></div>}
  </main>;
}
